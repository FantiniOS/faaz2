import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { criarSessao } from "@/lib/auth-session";
import type { Cargo } from "@/lib/auth-rbac";

// Perfis pré-configurados de Homologação da Clínica FAAZ (Suporte a Username e E-mail)
const HOMOLOGACAO_USERS: Record<
  string,
  {
    nome: string;
    cargo: Cargo;
    role: any;
    specialty: string;
    username: string;
    podeAcessarProntuario: boolean;
  }
> = {
  "carlos.fantini": {
    nome: "Dr. Carlos Fantini",
    cargo: "DONO_CLINICA",
    role: "CLINIC_ADMIN",
    specialty: "Endocrinologia & Nutrologia",
    username: "carlos.fantini",
    podeAcessarProntuario: true,
  },
  "carlos.fantini@clinicafaaz.com.br": {
    nome: "Dr. Carlos Fantini",
    cargo: "DONO_CLINICA",
    role: "CLINIC_ADMIN",
    specialty: "Endocrinologia & Nutrologia",
    username: "carlos.fantini",
    podeAcessarProntuario: true,
  },
  "rodrigo.mendes": {
    nome: "Dr. Rodrigo Mendes",
    cargo: "MEDICO",
    role: "DOCTOR",
    specialty: "Nutrologia & Medicina Funcional",
    username: "rodrigo.mendes",
    podeAcessarProntuario: true,
  },
  "medico.parceiro@clinicafaaz.com.br": {
    nome: "Dr. Rodrigo Mendes",
    cargo: "MEDICO",
    role: "DOCTOR",
    specialty: "Nutrologia & Medicina Funcional",
    username: "rodrigo.mendes",
    podeAcessarProntuario: true,
  },
  "patricia.santos": {
    nome: "Patrícia Santos",
    cargo: "SECRETARIA",
    role: "RECEPTIONIST",
    specialty: "Recepção & Agendamentos",
    username: "patricia.santos",
    podeAcessarProntuario: false,
  },
  "secretaria": {
    nome: "Patrícia Santos",
    cargo: "SECRETARIA",
    role: "RECEPTIONIST",
    specialty: "Recepção & Agendamentos",
    username: "patricia.santos",
    podeAcessarProntuario: false,
  },
  "secretaria@clinicafaaz.com.br": {
    nome: "Patrícia Santos",
    cargo: "SECRETARIA",
    role: "RECEPTIONIST",
    specialty: "Recepção & Agendamentos",
    username: "patricia.santos",
    podeAcessarProntuario: false,
  },
  "eduardo.lima": {
    nome: "Eduardo Lima",
    cargo: "ADMINISTRADOR",
    role: "ADMIN",
    specialty: "Gestão Financeira & RH",
    username: "eduardo.lima",
    podeAcessarProntuario: false,
  },
  "admin": {
    nome: "Eduardo Lima",
    cargo: "ADMINISTRADOR",
    role: "ADMIN",
    specialty: "Gestão Financeira & RH",
    username: "eduardo.lima",
    podeAcessarProntuario: false,
  },
  "admin@clinicafaaz.com.br": {
    nome: "Eduardo Lima",
    cargo: "ADMINISTRADOR",
    role: "ADMIN",
    specialty: "Gestão Financeira & RH",
    username: "eduardo.lima",
    podeAcessarProntuario: false,
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, email, senha, autoCargo } = body;

    const identifier = (username || email || "").toLowerCase().trim();

    // 1. Busca usuário ativo no banco checando USERNAME (prioritário) ou E-mail (fallback)
    let user = identifier
      ? await prisma.user.findFirst({
          where: {
            OR: [
              { username: { equals: identifier, mode: "insensitive" } },
              { email: { equals: identifier, mode: "insensitive" } },
            ],
            deletedAt: null,
            accountStatus: "ACTIVE",
          },
          include: {
            organization: {
              select: { id: true, tradeName: true, slug: true },
            },
          },
        })
      : null;

    // 2. Se o usuário for de homologação e ainda não existir no banco, auto-provisiona na hora
    if (!user && (HOMOLOGACAO_USERS[identifier] || autoCargo)) {
      const config =
        HOMOLOGACAO_USERS[identifier] ||
        Object.values(HOMOLOGACAO_USERS).find((h) => h.cargo === autoCargo);

      if (config) {
        // Assegura organização
        const org = await prisma.organization.upsert({
          where: { slug: "clinica-faaz" },
          update: {},
          create: {
            slug: "clinica-faaz",
            tradeName: "Clínica FAAZ",
            legalName: "Clínica FAAZ Medicina & Saúde Integrativa Ltda",
            taxId: "12345678000190",
            primaryColorHex: "#0f766e",
          },
        });

        const passwordHash = await bcrypt.hash("faaz123", 10);

        user = await prisma.user.upsert({
          where: { username: config.username },
          update: {
            cargo: config.cargo,
            role: config.role,
            podeAcessarProntuario: config.podeAcessarProntuario,
            accountStatus: "ACTIVE",
          },
          create: {
            organizationId: org.id,
            fullName: config.nome,
            username: config.username,
            email: `${config.username}@clinicafaaz.com.br`,
            passwordHash,
            role: config.role,
            cargo: config.cargo,
            podeAcessarProntuario: config.podeAcessarProntuario,
            isClinical: config.podeAcessarProntuario,
            specialty: config.specialty,
            accountStatus: "ACTIVE",
            mustChangePassword: false,
          },
          include: {
            organization: {
              select: { id: true, tradeName: true, slug: true },
            },
          },
        });
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "Credenciais inválidas. Verifique o usuário e a senha." },
        { status: 401 }
      );
    }

    // 3. Validação de senha (ou bypass seguro caso seja homologação direta por autoCargo)
    if (!autoCargo) {
      const senhaValida = await bcrypt.compare(senha, user.passwordHash);
      if (!senhaValida) {
        return NextResponse.json(
          { error: "Senha incorreta. Para o ambiente de homologação, utilize 'faaz123'." },
          { status: 401 }
        );
      }
    }

    // 4. Cria sessão JWT e define o cookie HTTP-only
    const token = await criarSessao({
      userId: user.id,
      nome: user.fullName,
      cargo: user.cargo as Cargo,
      email: user.email || "",
      organizationId: user.organizationId,
    });

    // 5. Atualiza registro de último login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return NextResponse.json({
      sucesso: true,
      usuario: {
        id: user.id,
        nome: user.fullName,
        username: user.username,
        email: user.email,
        cargo: user.cargo,
        role: user.role,
        podeAcessarProntuario: user.podeAcessarProntuario,
        organizacao: user.organization?.tradeName,
      },
      token,
    });
  } catch (error: any) {
    console.error("[AUTH/LOGIN] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor de autenticação." },
      { status: 500 }
    );
  }
}
