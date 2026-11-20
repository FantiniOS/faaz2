import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { IsNull, Not } from "typeorm";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import {
  UserEntity,
  type AccountStatus,
  type Cargo as DbCargo,
  type User,
  type UserRole,
} from "@/lib/db/entities";
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
        {
          error:
            "Acesso negado. Apenas o Dono da Clínica e Administradores podem gerenciar a equipe.",
        },
        { status: 403 },
      );
    }

    const equipe = await withRepositoryRetry(
      UserEntity,
      (repo) =>
        repo.find({
          where: {
            organizationId: sessao.organizationId,
            deletedAt: IsNull(),
            role: Not("PATIENT"),
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
          order: { fullName: "ASC" },
        }),
      { label: "equipe:list" },
    );

    return NextResponse.json({ equipe });
  } catch (error: unknown) {
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
        {
          error:
            "Acesso negado. Apenas o Dono da Clínica e Administradores podem cadastrar membros.",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { nome, username, email, cargo, senha, especialidade, crm } = body;

    if (!nome || !username || !cargo || !senha) {
      return NextResponse.json(
        {
          error:
            "Nome completo, Nome de Usuário (username), cargo e senha inicial são obrigatórios.",
        },
        { status: 400 },
      );
    }

    const normalizedUsername = username
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]/g, "");
    if (!normalizedUsername || normalizedUsername.length < 3) {
      return NextResponse.json(
        { error: "O nome de usuário deve conter pelo menos 3 caracteres alfanuméricos." },
        { status: 400 },
      );
    }

    const cargosValidos: DbCargo[] = [
      "DONO_CLINICA",
      "MEDICO",
      "SECRETARIA",
      "ADMINISTRADOR",
    ];
    if (!cargosValidos.includes(cargo)) {
      return NextResponse.json(
        { error: `Cargo inválido. Valores válidos: ${cargosValidos.join(", ")}` },
        { status: 400 },
      );
    }

    const userRepo = await getRepository(UserEntity);

    // Verificar se username já existe
    const usernameExistente = await userRepo.findOne({
      where: { username: normalizedUsername, deletedAt: IsNull() },
    });
    if (usernameExistente) {
      return NextResponse.json(
        { error: "Este nome de usuário (username) já está cadastrado." },
        { status: 409 },
      );
    }

    // Verificar se e-mail já existe (caso informado)
    let normalizedEmail: string | null = null;
    if (email && email.trim()) {
      const cleanEmail = String(email).toLowerCase().trim();
      normalizedEmail = cleanEmail;
      const emailExistente = await userRepo.findOne({
        where: { email: cleanEmail, deletedAt: IsNull() },
      });
      if (emailExistente) {
        return NextResponse.json(
          { error: "Este e-mail já está cadastrado no sistema." },
          { status: 409 },
        );
      }
    }

    const passwordHash = await bcrypt.hash(senha, 12);

    const roleMap: Record<DbCargo, UserRole> = {
      DONO_CLINICA: "CLINIC_ADMIN",
      MEDICO: "DOCTOR",
      SECRETARIA: "RECEPTIONIST",
      ADMINISTRADOR: "ADMIN",
    };

    const podeAcessarProntuario = cargo === "DONO_CLINICA" || cargo === "MEDICO";

    const salvo = await userRepo.save(
      userRepo.create({
        organizationId: sessao.organizationId!,
        fullName: nome.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        role: roleMap[cargo as DbCargo],
        cargo: cargo as DbCargo,
        podeAcessarProntuario,
        isClinical: podeAcessarProntuario,
        mfaEnabled: false,
        specialty: especialidade || null,
        councilType: crm ? "CRM" : null,
        councilNumber: crm || null,
        accountStatus: "ACTIVE",
        mustChangePassword: true,
        createdBy: sessao.userId,
      }),
    );

    const novoMembro = {
      id: salvo.id,
      fullName: salvo.fullName,
      username: salvo.username,
      email: salvo.email,
      cargo: salvo.cargo,
      role: salvo.role,
      accountStatus: salvo.accountStatus,
      createdAt: salvo.createdAt,
    };

    return NextResponse.json({ sucesso: true, membro: novoMembro }, { status: 201 });
  } catch (error: unknown) {
    console.error("[EQUIPE/POST] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao cadastrar membro da equipe." },
      { status: 500 },
    );
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
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();
    const { id, nome, cargo, status, especialidade } = body;

    if (!id) {
      return NextResponse.json({ error: "ID do membro é obrigatório." }, { status: 400 });
    }

    const updateData: {
      fullName?: string;
      cargo?: DbCargo;
      podeAcessarProntuario?: boolean;
      accountStatus?: AccountStatus;
      specialty?: string | null;
      updatedBy: string;
    } = {
      updatedBy: sessao.userId,
    };
    if (nome) updateData.fullName = nome.trim();
    if (cargo) {
      updateData.cargo = cargo as DbCargo;
      updateData.podeAcessarProntuario = cargo === "DONO_CLINICA" || cargo === "MEDICO";
    }
    if (status) updateData.accountStatus = status as AccountStatus;
    if (especialidade !== undefined) updateData.specialty = especialidade;

    const userRepo = await getRepository(UserEntity);
    await userRepo.update({ id }, updateData);

    const atualizado = await userRepo.findOne({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        cargo: true,
        accountStatus: true,
      },
    });

    return NextResponse.json({ sucesso: true, membro: atualizado });
  } catch (error: unknown) {
    console.error("[EQUIPE/PATCH] Erro:", error);
    return NextResponse.json({ error: "Erro ao atualizar membro." }, { status: 500 });
  }
}
