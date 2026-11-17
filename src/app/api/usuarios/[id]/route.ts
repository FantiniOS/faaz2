import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { IsNull, Not } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  UserEntity,
  type AccountStatus,
  type Cargo as DbCargo,
  type User,
  type UserRole,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeGerenciarEquipe } from "@/lib/auth-rbac";

const roleMap: Record<DbCargo, UserRole> = {
  DONO_CLINICA: "CLINIC_ADMIN",
  MEDICO: "DOCTOR",
  SECRETARIA: "RECEPTIONIST",
  ADMINISTRADOR: "ADMIN",
};

/**
 * PUT /api/usuarios/[id] — Editar membro da equipe
 * Acesso exclusivo: DONO_CLINICA e ADMINISTRADOR (RBAC)
 */
export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const sessao = await getSessao();
    if (!sessao || !podeGerenciarEquipe(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas o Dono da Clínica ou Administradores podem editar membros da equipe.",
        },
        { status: 403 },
      );
    }

    const { id } = await props.params;
    if (!id) {
      return NextResponse.json(
        { error: "ID de usuário obrigatório." },
        { status: 400 },
      );
    }

    const userRepo = await getRepository(UserEntity);
    const userExistente = await userRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!userExistente) {
      return NextResponse.json(
        { error: "Usuário não encontrado ou já inativado." },
        { status: 404 },
      );
    }

    const body = await request.json();
    const {
      nome,
      fullName,
      username,
      email,
      cargo,
      senha,
      especialidade,
      specialty,
      crm,
      councilNumber,
      accountStatus,
    } = body;

    const targetFullName = (nome || fullName || userExistente.fullName).trim();

    // Validação de Username se alterado
    let targetUsername = userExistente.username;
    if (username && username.trim()) {
      targetUsername = username
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9._-]/g, "");
      if (targetUsername !== userExistente.username) {
        const usernameEmUso = await userRepo.findOne({
          where: {
            username: targetUsername,
            id: Not(id),
            deletedAt: IsNull(),
          },
        });
        if (usernameEmUso) {
          return NextResponse.json(
            {
              error:
                "Este nome de usuário (username) já está sendo utilizado por outro membro.",
            },
            { status: 409 },
          );
        }
      }
    }

    // Validação de E-mail se alterado
    let targetEmail = userExistente.email;
    if (email !== undefined) {
      if (email && email.trim()) {
        const normalizedEmail = email.toLowerCase().trim();
        if (normalizedEmail !== userExistente.email) {
          const emailEmUso = await userRepo.findOne({
            where: {
              email: normalizedEmail,
              id: Not(id),
              deletedAt: IsNull(),
            },
          });
          if (emailEmUso) {
            return NextResponse.json(
              { error: "Este e-mail já está sendo utilizado por outro membro." },
              { status: 409 },
            );
          }
        }
        targetEmail = normalizedEmail;
      } else {
        targetEmail = null;
      }
    }

    // Validação de Cargo
    let targetCargo: DbCargo = userExistente.cargo;
    let targetRole: UserRole = userExistente.role;
    let podeAcessarProntuario = userExistente.podeAcessarProntuario;

    if (cargo) {
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
      targetCargo = cargo as DbCargo;
      targetRole = roleMap[targetCargo] || userExistente.role;
      podeAcessarProntuario =
        targetCargo === "DONO_CLINICA" || targetCargo === "MEDICO";
    }

    let passwordHashUpdate: string | undefined = undefined;
    if (senha && senha.trim().length >= 4) {
      passwordHashUpdate = await bcrypt.hash(senha.trim(), 12);
    }

    const targetSpecialty =
      especialidade !== undefined
        ? especialidade
        : specialty !== undefined
          ? specialty
          : userExistente.specialty;
    const targetCrm =
      crm !== undefined
        ? crm
        : councilNumber !== undefined
          ? councilNumber
          : userExistente.councilNumber;

    await userRepo.update(
      { id },
      {
        fullName: targetFullName,
        username: targetUsername,
        email: targetEmail,
        cargo: targetCargo,
        role: targetRole,
        podeAcessarProntuario,
        isClinical: podeAcessarProntuario,
        specialty: targetSpecialty || null,
        councilType: targetCrm ? "CRM" : null,
        councilNumber: targetCrm || null,
        accountStatus:
          (accountStatus as AccountStatus) || userExistente.accountStatus,
        ...(passwordHashUpdate ? { passwordHash: passwordHashUpdate } : {}),
        updatedBy: sessao.userId,
      },
    );

    const usuarioAtualizado = await userRepo.findOne({
      where: { id },
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
        updatedAt: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Membro da equipe atualizado com sucesso.",
      usuario: usuarioAtualizado,
    });
  } catch (error: unknown) {
    console.error("[USUARIOS/PUT] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar membro da equipe." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/usuarios/[id] — Inativação lógica / Exclusão de membro da equipe
 * Acesso exclusivo: DONO_CLINICA e ADMINISTRADOR (RBAC)
 */
export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const sessao = await getSessao();
    if (!sessao || !podeGerenciarEquipe(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas o Dono da Clínica ou Administradores podem remover acessos de equipe.",
        },
        { status: 403 },
      );
    }

    const { id } = await props.params;
    if (!id) {
      return NextResponse.json(
        { error: "ID de usuário obrigatório." },
        { status: 400 },
      );
    }

    if (id === sessao.userId) {
      return NextResponse.json(
        { error: "Não é permitido excluir o próprio usuário logado." },
        { status: 400 },
      );
    }

    const userRepo = await getRepository(UserEntity);
    const userExistente = await userRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!userExistente) {
      return NextResponse.json(
        { error: "Usuário não encontrado ou já inativado." },
        { status: 404 },
      );
    }

    await userRepo.update(
      { id },
      {
        deletedAt: new Date(),
        accountStatus: "REVOKED",
        updatedBy: sessao.userId,
      },
    );

    return NextResponse.json({
      sucesso: true,
      mensagem: `Acesso do usuário ${userExistente.fullName} (@${userExistente.username}) revogado com sucesso.`,
    });
  } catch (error: unknown) {
    console.error("[USUARIOS/DELETE] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao excluir membro da equipe." },
      { status: 500 },
    );
  }
}
