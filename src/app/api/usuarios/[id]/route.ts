import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { IsNull, Not } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  UserEntity,
  type AccountStatus,
  type Cargo as DbCargo,
  type Especialidade,
  type UserRole,
} from "@/lib/db/entities";
import {
  ensureEspecialidadesSchemaAndSeed,
  listarTodasEspecialidadesEntity,
} from "@/lib/db/especialidades-bootstrap";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import { getSessao } from "@/lib/auth-session";
import { podeGerenciarEquipe } from "@/lib/auth-rbac";
import {
  comporTextoSpecialtyUsuario,
  encontrarEspecialidadeCompativel,
  normalizarCorEspecialidade,
  normalizarCrmArmazenado,
} from "@/lib/especialidades-clinica";
import {
  garantirEspelhoMedicoAgenda,
  mapUserToMedicoResponsavel,
} from "@/lib/medico-responsavel";

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

    await ensureEspecialidadesSchemaAndSeed();

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
      especialidadeId,
      especialidade,
      subespecialidade,
      specialty,
      crm,
      councilNumber,
      accountStatus,
    } = body;

    const targetFullName = String(
      nome || fullName || userExistente.fullName,
    )
      .trim()
      .toUpperCase();

    // Validação de Username se alterado
    let targetUsername = userExistente.username;
    if (username && String(username).trim()) {
      targetUsername = String(username)
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
      if (email && String(email).trim()) {
        const normalizedEmail = String(email).toLowerCase().trim();
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
    if (senha && String(senha).trim().length >= 4) {
      passwordHashUpdate = await bcrypt.hash(String(senha).trim(), 12);
    }

    const isCargoClinico =
      targetCargo === "DONO_CLINICA" || targetCargo === "MEDICO";

    const especialidades = await listarTodasEspecialidadesEntity(false);

    let targetEspecialidadeId: string | null = null;
    let targetSpecialty: string | null = null;

    if (isCargoClinico) {
      const temInfoEsp =
        especialidadeId !== undefined ||
        subespecialidade !== undefined ||
        especialidade !== undefined ||
        specialty !== undefined;

      let espResolvida: Especialidade | null = null;

      if (especialidadeId !== undefined) {
        const cleanEspId =
          typeof especialidadeId === "string" ? especialidadeId.trim() : "";
        if (!cleanEspId) {
          return NextResponse.json(
            {
              error:
                "Selecione a Especialidade de Atendimento para perfis clínicos (Médico ou Diretoria Clínica).",
            },
            { status: 400 },
          );
        }
        espResolvida = especialidades.find((e) => e.id === cleanEspId) ?? null;
        if (!espResolvida) {
          return NextResponse.json(
            { error: "Especialidade selecionada não encontrada." },
            { status: 400 },
          );
        }
      } else if (userExistente.especialidadeId) {
        espResolvida =
          especialidades.find((e) => e.id === userExistente.especialidadeId) ??
          null;
      } else if (typeof especialidade === "string" && especialidade.trim()) {
        espResolvida = encontrarEspecialidadeCompativel(
          especialidade,
          especialidades,
        );
      }

      if (temInfoEsp && !espResolvida) {
        return NextResponse.json(
          {
            error:
              "Selecione a Especialidade de Atendimento para perfis clínicos (Médico ou Diretoria Clínica).",
          },
          { status: 400 },
        );
      }

      targetEspecialidadeId = espResolvida?.id ?? userExistente.especialidadeId ?? null;

      if (temInfoEsp) {
        const subInput =
          subespecialidade !== undefined
            ? subespecialidade
            : especialidade !== undefined
              ? especialidade
              : specialty;
        targetSpecialty = comporTextoSpecialtyUsuario(
          espResolvida?.nome,
          subInput,
        );
      } else {
        targetSpecialty = userExistente.specialty;
      }
    }

    const rawCrmInput =
      crm !== undefined
        ? crm
        : councilNumber !== undefined
          ? councilNumber
          : userExistente.councilNumber;
    const targetCrm = isCargoClinico
      ? normalizarCrmArmazenado(rawCrmInput)
      : null;
    const targetAccountStatus =
      (accountStatus as AccountStatus) || userExistente.accountStatus;

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
        especialidadeId: targetEspecialidadeId,
        specialty: targetSpecialty || null,
        councilType: targetCrm ? "CRM" : null,
        councilNumber: targetCrm || null,
        accountStatus: targetAccountStatus,
        ...(passwordHashUpdate ? { passwordHash: passwordHashUpdate } : {}),
        updatedBy: sessao.userId,
      },
    );

    const usuarioAtualizado = await userRepo.findOne({
      where: { id },
      select: {
        id: true,
        title: true,
        fullName: true,
        username: true,
        email: true,
        cargo: true,
        role: true,
        specialty: true,
        especialidadeId: true,
        councilType: true,
        councilNumber: true,
        accountStatus: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (usuarioAtualizado && isCargoClinico && targetAccountStatus === "ACTIVE") {
      const medicoDto = mapUserToMedicoResponsavel(
        usuarioAtualizado,
        especialidades,
      );
      if (medicoDto) {
        await garantirEspelhoMedicoAgenda(medicoDto).catch((err) => {
          console.warn("[USUARIOS/PUT] Aviso ao sincronizar espelho MEDICOS:", err);
        });
      }
    }

    const espAtual = usuarioAtualizado?.especialidadeId
      ? especialidades.find((e) => e.id === usuarioAtualizado.especialidadeId) ??
        null
      : null;

    return NextResponse.json({
      sucesso: true,
      mensagem: "Membro da equipe atualizado com sucesso.",
      usuario: usuarioAtualizado
        ? {
            ...usuarioAtualizado,
            especialidadeNome: espAtual?.nome ?? null,
            especialidadeCor: espAtual
              ? normalizarCorEspecialidade(espAtual.cor)
              : null,
            especialidadeAtiva: espAtual ? Boolean(espAtual.ativo) : null,
          }
        : null,
    });
  } catch (error: unknown) {
    logOracleRouteError("PUT /api/usuarios/[id]", error);
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
    logOracleRouteError("DELETE /api/usuarios/[id]", error);
    return NextResponse.json(
      { error: "Erro interno ao excluir membro da equipe." },
      { status: 500 },
    );
  }
}
