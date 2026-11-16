import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";
import { podeGerenciarEquipe } from "@/lib/auth-rbac";

/**
 * GET /api/equipe — Lista os membros da equipe da clínica
 * Acesso: DONO_CLINICA e ADMINISTRADOR
 */
export async function GET() {
  try {
    const sessao = await getSessao();
    if (!sessao || !podeGerenciarEquipe(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Apenas o Dono da Clínica e Administradores podem gerenciar a equipe." },
        { status: 403 }
      );
    }

    const equipe = await prisma.user.findMany({
      where: {
        organizationId: sessao.organizationId,
        deletedAt: null,
        role: { not: "PATIENT" },
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        cargo: true,
        role: true,
        specialty: true,
        councilType: true,
        councilNumber: true,
        accountStatus: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { fullName: "asc" },
    });

    return NextResponse.json({ equipe });
  } catch (error: any) {
    console.error("[EQUIPE/GET] Erro:", error);
    return NextResponse.json({ error: "Erro ao listar equipe." }, { status: 500 });
  }
}

/**
 * POST /api/equipe — Cadastrar novo membro da equipe
 * Acesso: DONO_CLINICA e ADMINISTRADOR
 */
export async function POST(request: Request) {
  try {
    const sessao = await getSessao();
    if (!sessao || !podeGerenciarEquipe(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Apenas o Dono da Clínica e Administradores podem cadastrar membros." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { nome, username, email, cargo, senha, especialidade, crm } = body;

    if (!nome || !username || !cargo || !senha) {
      return NextResponse.json(
        { error: "Nome completo, Nome de Usuário (username), cargo e senha inicial são obrigatórios." },
        { status: 400 }
      );
    }

    const normalizedUsername = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, "");
    if (!normalizedUsername || normalizedUsername.length < 3) {
      return NextResponse.json(
        { error: "O nome de usuário deve conter pelo menos 3 caracteres alfanuméricos." },
        { status: 400 }
      );
    }

    // Validar cargo permitido
    const cargosValidos = ["DONO_CLINICA", "MEDICO", "SECRETARIA", "ADMINISTRADOR"];
    if (!cargosValidos.includes(cargo)) {
      return NextResponse.json(
        { error: `Cargo inválido. Valores válidos: ${cargosValidos.join(", ")}` },
        { status: 400 }
      );
    }

    // Verificar se username já existe
    const usernameExistente = await prisma.user.findFirst({
      where: { username: normalizedUsername, deletedAt: null },
    });
    if (usernameExistente) {
      return NextResponse.json(
        { error: "Este nome de usuário (username) já está cadastrado." },
        { status: 409 }
      );
    }

    // Verificar se e-mail já existe (caso informado)
    let normalizedEmail: string | null = null;
    if (email && email.trim()) {
      normalizedEmail = email.toLowerCase().trim();
      const emailExistente = await prisma.user.findFirst({
        where: { email: normalizedEmail, deletedAt: null },
      });
      if (emailExistente) {
        return NextResponse.json(
          { error: "Este e-mail já está cadastrado no sistema." },
          { status: 409 }
        );
      }
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(senha, 12);

    // Mapear cargo para UserRole
    const roleMap: Record<string, string> = {
      DONO_CLINICA: "CLINIC_ADMIN",
      MEDICO: "DOCTOR",
      SECRETARIA: "RECEPTIONIST",
      ADMINISTRADOR: "ADMIN",
    };

    // Determinar acesso a prontuário
    const podeAcessarProntuario = cargo === "DONO_CLINICA" || cargo === "MEDICO";

    const novoMembro = await prisma.user.create({
      data: {
        organizationId: sessao.organizationId!,
        fullName: nome.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        role: roleMap[cargo] as any,
        cargo: cargo as any,
        podeAcessarProntuario,
        isClinical: podeAcessarProntuario,
        specialty: especialidade || null,
        councilType: crm ? "CRM" : null,
        councilNumber: crm || null,
        accountStatus: "ACTIVE",
        mustChangePassword: true,
        createdBy: sessao.userId,
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        cargo: true,
        role: true,
        accountStatus: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { sucesso: true, membro: novoMembro },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[EQUIPE/POST] Erro:", error);
    return NextResponse.json({ error: "Erro ao cadastrar membro da equipe." }, { status: 500 });
  }
}

/**
 * PATCH /api/equipe — Atualizar membro existente
 * Acesso: DONO_CLINICA e ADMINISTRADOR
 */
export async function PATCH(request: Request) {
  try {
    const sessao = await getSessao();
    if (!sessao || !podeGerenciarEquipe(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, nome, cargo, status, especialidade } = body;

    if (!id) {
      return NextResponse.json({ error: "ID do membro é obrigatório." }, { status: 400 });
    }

    const updateData: any = {};
    if (nome) updateData.fullName = nome.trim();
    if (cargo) {
      updateData.cargo = cargo;
      updateData.podeAcessarProntuario = cargo === "DONO_CLINICA" || cargo === "MEDICO";
    }
    if (status) updateData.accountStatus = status;
    if (especialidade !== undefined) updateData.specialty = especialidade;
    updateData.updatedBy = sessao.userId;

    const atualizado = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        cargo: true,
        accountStatus: true,
      },
    });

    return NextResponse.json({ sucesso: true, membro: atualizado });
  } catch (error: any) {
    console.error("[EQUIPE/PATCH] Erro:", error);
    return NextResponse.json({ error: "Erro ao atualizar membro." }, { status: 500 });
  }
}
