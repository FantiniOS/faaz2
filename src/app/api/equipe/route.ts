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
import {
  comporEspecialidadeArmazenada,
  normalizarCrmArmazenado,
} from "@/lib/especialidades-clinica";
import {
  garantirEspelhoMedicoAgenda,
  mapUserToMedicoResponsavel,
} from "@/lib/medico-responsavel";

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
    const {
      nome,
      username,
      email,
      cargo,
      senha,
      especialidade,
      especialidadeCodigo,
      subespecialidade,
      crm,
    } = body;

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

    const isCargoClinico = cargo === "DONO_CLINICA" || cargo === "MEDICO";
    const especialidadeFinal = isCargoClinico
      ? comporEspecialidadeArmazenada(
          especialidadeCodigo,
          subespecialidade,
          especialidade,
        )
      : null;
    const crmNormalizado = isCargoClinico ? normalizarCrmArmazenado(crm) : null;

    if (isCargoClinico && !especialidadeFinal) {
      return NextResponse.json(
        {
          error:
            "Selecione a Especialidade de Atendimento para perfis clínicos (Médico ou Diretoria Clínica).",
        },
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

    const podeAcessarProntuario = isCargoClinico;

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
        specialty: especialidadeFinal,
        councilType: crmNormalizado ? "CRM" : null,
        councilNumber: crmNormalizado,
        accountStatus: "ACTIVE",
        mustChangePassword: true,
        createdBy: sessao.userId,
      }),
    );

    if (isCargoClinico) {
      const medicoDto = mapUserToMedicoResponsavel(salvo);
      if (medicoDto) {
        await garantirEspelhoMedicoAgenda(medicoDto).catch((err) => {
          console.warn("[EQUIPE/POST] Aviso ao sincronizar espelho MEDICOS:", err);
        });
      }
    }

    const novoMembro = {
      id: salvo.id,
      fullName: salvo.fullName,
      username: salvo.username,
      email: salvo.email,
      cargo: salvo.cargo,
      role: salvo.role,
      specialty: salvo.specialty,
      councilType: salvo.councilType,
      councilNumber: salvo.councilNumber,
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
    const {
      id,
      nome,
      cargo,
      status,
      especialidade,
      especialidadeCodigo,
      subespecialidade,
      crm,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID do membro é obrigatório." }, { status: 400 });
    }

    const userRepo = await getRepository(UserEntity);
    const existente = await userRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!existente) {
      return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
    }

    const cargoFinal = (cargo || existente.cargo) as DbCargo;
    const isCargoClinico =
      cargoFinal === "DONO_CLINICA" || cargoFinal === "MEDICO";

    const updateData: {
      fullName?: string;
      cargo?: DbCargo;
      podeAcessarProntuario?: boolean;
      isClinical?: boolean;
      accountStatus?: AccountStatus;
      specialty?: string | null;
      councilType?: string | null;
      councilNumber?: string | null;
      updatedBy: string;
    } = {
      updatedBy: sessao.userId,
    };
    if (nome) updateData.fullName = nome.trim();
    if (cargo) {
      updateData.cargo = cargoFinal;
      updateData.podeAcessarProntuario = isCargoClinico;
      updateData.isClinical = isCargoClinico;
    }
    if (status) updateData.accountStatus = status as AccountStatus;

    if (!isCargoClinico) {
      updateData.specialty = null;
      updateData.councilType = null;
      updateData.councilNumber = null;
    } else {
      if (
        especialidadeCodigo !== undefined ||
        subespecialidade !== undefined ||
        especialidade !== undefined
      ) {
        updateData.specialty = comporEspecialidadeArmazenada(
          especialidadeCodigo,
          subespecialidade,
          especialidade,
        );
      }
      if (crm !== undefined) {
        const crmNorm = normalizarCrmArmazenado(crm);
        updateData.councilType = crmNorm ? "CRM" : null;
        updateData.councilNumber = crmNorm;
      }
    }

    await userRepo.update({ id }, updateData);

    const atualizado = await userRepo.findOne({
      where: { id },
      select: {
        id: true,
        title: true,
        fullName: true,
        email: true,
        cargo: true,
        specialty: true,
        councilType: true,
        councilNumber: true,
        accountStatus: true,
      },
    });

    if (atualizado && isCargoClinico && atualizado.accountStatus === "ACTIVE") {
      const medicoDto = mapUserToMedicoResponsavel(atualizado);
      if (medicoDto) {
        await garantirEspelhoMedicoAgenda(medicoDto).catch((err) => {
          console.warn("[EQUIPE/PATCH] Aviso ao sincronizar espelho MEDICOS:", err);
        });
      }
    }

    return NextResponse.json({ sucesso: true, membro: atualizado });
  } catch (error: unknown) {
    console.error("[EQUIPE/PATCH] Erro:", error);
    return NextResponse.json({ error: "Erro ao atualizar membro." }, { status: 500 });
  }
}
