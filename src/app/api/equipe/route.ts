import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { IsNull, Not } from "typeorm";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import {
  EspecialidadeEntity,
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

function enriquecerMembroComEspecialidade<
  T extends { especialidadeId?: string | null; specialty?: string | null },
>(membro: T, especialidades: readonly Especialidade[]) {
  const esp = membro.especialidadeId
    ? especialidades.find((e) => e.id === membro.especialidadeId) ?? null
    : null;
  return {
    ...membro,
    especialidadeId: membro.especialidadeId ?? null,
    especialidadeNome: esp?.nome ?? null,
    especialidadeCor: esp ? normalizarCorEspecialidade(esp.cor) : null,
    especialidadeAtiva: esp ? Boolean(esp.ativo) : null,
  };
}

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

    await ensureEspecialidadesSchemaAndSeed();

    const [equipeRaw, especialidades] = await Promise.all([
      withRepositoryRetry(
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
              especialidadeId: true,
              councilType: true,
              councilNumber: true,
              accountStatus: true,
              lastLoginAt: true,
              createdAt: true,
            },
            order: { fullName: "ASC" },
          }),
        { label: "equipe:list" },
      ),
      listarTodasEspecialidadesEntity(false),
    ]);

    const equipe = equipeRaw.map((m) =>
      enriquecerMembroComEspecialidade(m, especialidades),
    );

    return NextResponse.json({ equipe });
  } catch (error: unknown) {
    logOracleRouteError("GET /api/equipe", error);
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

    await ensureEspecialidadesSchemaAndSeed();

    const body = await request.json();
    const {
      nome,
      username,
      email,
      cargo,
      senha,
      especialidadeId,
      especialidade,
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

    const normalizedUsername = String(username)
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
    const especialidades = await listarTodasEspecialidadesEntity(false);

    let espResolvida: Especialidade | null = null;
    if (isCargoClinico) {
      const cleanEspId =
        typeof especialidadeId === "string" ? especialidadeId.trim() : "";
      if (cleanEspId) {
        espResolvida = especialidades.find((e) => e.id === cleanEspId) ?? null;
        if (!espResolvida) {
          return NextResponse.json(
            { error: "Especialidade selecionada não encontrada." },
            { status: 400 },
          );
        }
      } else if (typeof especialidade === "string" && especialidade.trim()) {
        espResolvida = encontrarEspecialidadeCompativel(
          especialidade,
          especialidades,
        );
      }

      if (!espResolvida) {
        return NextResponse.json(
          {
            error:
              "Selecione a Especialidade de Atendimento para perfis clínicos (Médico ou Diretoria Clínica).",
          },
          { status: 400 },
        );
      }
    }

    const especialidadeFinalTexto = isCargoClinico
      ? comporTextoSpecialtyUsuario(
          espResolvida?.nome,
          subespecialidade !== undefined ? subespecialidade : especialidade,
        )
      : null;
    const crmNormalizado = isCargoClinico ? normalizarCrmArmazenado(crm) : null;

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
    if (email && String(email).trim()) {
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

    const passwordHash = await bcrypt.hash(String(senha), 12);

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
        fullName: String(nome).trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        role: roleMap[cargo as DbCargo],
        cargo: cargo as DbCargo,
        podeAcessarProntuario,
        isClinical: podeAcessarProntuario,
        mfaEnabled: false,
        especialidadeId: isCargoClinico ? espResolvida?.id ?? null : null,
        specialty: especialidadeFinalTexto,
        councilType: crmNormalizado ? "CRM" : null,
        councilNumber: crmNormalizado,
        accountStatus: "ACTIVE",
        mustChangePassword: true,
        createdBy: sessao.userId,
      }),
    );

    if (isCargoClinico) {
      const medicoDto = mapUserToMedicoResponsavel(salvo, especialidades);
      if (medicoDto) {
        await garantirEspelhoMedicoAgenda(medicoDto).catch((err) => {
          console.warn("[EQUIPE/POST] Aviso ao sincronizar espelho MEDICOS:", err);
        });
      }
    }

    const novoMembro = enriquecerMembroComEspecialidade(
      {
        id: salvo.id,
        fullName: salvo.fullName,
        username: salvo.username,
        email: salvo.email,
        cargo: salvo.cargo,
        role: salvo.role,
        specialty: salvo.specialty,
        especialidadeId: salvo.especialidadeId,
        councilType: salvo.councilType,
        councilNumber: salvo.councilNumber,
        accountStatus: salvo.accountStatus,
        createdAt: salvo.createdAt,
      },
      especialidades,
    );

    return NextResponse.json({ sucesso: true, membro: novoMembro }, { status: 201 });
  } catch (error: unknown) {
    logOracleRouteError("POST /api/equipe", error);
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

    await ensureEspecialidadesSchemaAndSeed();

    const body = await request.json();
    const {
      id,
      nome,
      cargo,
      status,
      especialidadeId,
      especialidade,
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
      especialidadeId?: string | null;
      specialty?: string | null;
      councilType?: string | null;
      councilNumber?: string | null;
      updatedBy: string;
    } = {
      updatedBy: sessao.userId,
    };

    if (nome) updateData.fullName = String(nome).trim();
    if (cargo) {
      updateData.cargo = cargoFinal;
      updateData.podeAcessarProntuario = isCargoClinico;
      updateData.isClinical = isCargoClinico;
    }
    if (status) updateData.accountStatus = status as AccountStatus;

    const especialidades = await listarTodasEspecialidadesEntity(false);

    if (!isCargoClinico) {
      updateData.especialidadeId = null;
      updateData.specialty = null;
      updateData.councilType = null;
      updateData.councilNumber = null;
    } else {
      if (especialidadeId !== undefined) {
        const cleanEspId =
          typeof especialidadeId === "string" ? especialidadeId.trim() : "";
        if (!cleanEspId) {
          return NextResponse.json(
            {
              error:
                "Selecione a Especialidade de Atendimento para perfis clínicos.",
            },
            { status: 400 },
          );
        }
        const espRepo = await getRepository(EspecialidadeEntity);
        const espObj = await espRepo.findOne({ where: { id: cleanEspId } });
        if (!espObj) {
          return NextResponse.json(
            { error: "Especialidade selecionada não encontrada." },
            { status: 400 },
          );
        }
        updateData.especialidadeId = espObj.id;
        updateData.specialty = comporTextoSpecialtyUsuario(
          espObj.nome,
          subespecialidade !== undefined ? subespecialidade : existente.specialty,
        );
      } else if (subespecialidade !== undefined || especialidade !== undefined) {
        const espAtual = existente.especialidadeId
          ? especialidades.find((e) => e.id === existente.especialidadeId)
          : null;
        updateData.specialty = comporTextoSpecialtyUsuario(
          espAtual?.nome,
          subespecialidade !== undefined ? subespecialidade : especialidade,
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
        especialidadeId: true,
        councilType: true,
        councilNumber: true,
        accountStatus: true,
      },
    });

    if (atualizado && isCargoClinico && atualizado.accountStatus === "ACTIVE") {
      const medicoDto = mapUserToMedicoResponsavel(atualizado, especialidades);
      if (medicoDto) {
        await garantirEspelhoMedicoAgenda(medicoDto).catch((err) => {
          console.warn("[EQUIPE/PATCH] Aviso ao sincronizar espelho MEDICOS:", err);
        });
      }
    }

    return NextResponse.json({
      sucesso: true,
      membro: atualizado
        ? enriquecerMembroComEspecialidade(atualizado, especialidades)
        : null,
    });
  } catch (error: unknown) {
    logOracleRouteError("PATCH /api/equipe", error);
    return NextResponse.json({ error: "Erro ao atualizar membro." }, { status: 500 });
  }
}
