export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { In, type EntityManager } from "typeorm";
import { getRepository, withTransaction } from "@/lib/db/data-source";
import {
  extractOracleErrorInfo,
  logOracleRouteError,
  safeClobString,
  safeJsonParse,
} from "@/lib/db/oracle-utils";
import {
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  PatientEntity,
  ProntuarioPacienteEntity,
  type BiologicalSex,
  type PatientStatus,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import {
  podeAcessarDadosClinicos,
  podeCadastrarPacientes,
  podeExcluirPacientes,
} from "@/lib/auth-rbac";
import {
  normalizarObjetivoClinicoValor,
  resolverObjetivoAtivo,
} from "@/lib/objetivo-clinico";
import {
  resolverMedicoResponsavel,
  resolverUsuarioMedicoId,
} from "@/lib/medico-responsavel";
import { toIsoUtc } from "@/lib/date-br";
import { VERSAO_ATUAL_TERMOS } from "@/lib/termos-privacidade";
import { invalidarCacheMetricaPeso } from "@/lib/metrica-peso-eliminado";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isUniqueConstraintError(err: unknown): boolean {
  const info = extractOracleErrorInfo(err);
  return (
    info.errorNum === 1 ||
    info.message.includes("ORA-00001") ||
    info.message.includes("UQ_PATIENTS")
  );
}

/**
 * Executa uma etapa SQL de limpeza dentro da transação de exclusão de paciente.
 * Ignora exclusivamente ORA-00942 (tabela opcional/legada inexistente no schema),
 * relançando qualquer outra falha para garantir rollback atômico da transação.
 */
async function executarEtapaLimpezaOracle(
  manager: EntityManager,
  etapa: string,
  sql: string,
  params: unknown[],
): Promise<void> {
  try {
    await manager.query(sql, params);
  } catch (error: unknown) {
    const info = extractOracleErrorInfo(error);
    if (info.errorNum === 942 || info.oraCode === "ORA-00942") {
      console.warn(
        `[DELETE /api/pacientes/[id]] Tabela opcional ausente na etapa '${etapa}' (ORA-00942); ignorando.`,
      );
      return;
    }
    console.error(
      `[DELETE /api/pacientes/[id]] Falha na etapa '${etapa}'`,
      {
        etapa,
        errorNum: info.errorNum,
        oraCode: info.oraCode,
        message: info.message,
      },
    );
    throw error;
  }
}

/**
 * GET /api/pacientes/[id] — Retorna os dados de um paciente específico
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  let pacienteIdLog = "";
  try {
    const { id } = await params;
    pacienteIdLog = id;
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const patientRepo = await getRepository(PatientEntity);
    const paciente = await patientRepo.findOne({
      where: { id },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    let medicacoes: string | null = null;
    let prontuarioObjetivo: string | null = null;
    if (!sessao || podeAcessarDadosClinicos(sessao.cargo)) {
      const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
      const prontuario = await prontuarioRepo.findOne({
        where: { pacienteId: paciente.id },
        select: { id: true, medicacoes: true, objetivo: true },
      });
      medicacoes = safeClobString(prontuario?.medicacoes).trim() || null;
      prontuarioObjetivo = safeClobString(prontuario?.objetivo).trim() || null;
    }

    const medicoResponsavel = await resolverMedicoResponsavel(paciente.id, {
      primaryDoctorId: paciente.primaryDoctorId,
      organizationId: paciente.organizationId,
    });

    const objetivoUnificado = resolverObjetivoAtivo(
      paciente.treatmentObjective,
      paciente.clinicalFocus,
      prontuarioObjetivo,
    );

    const activeModulesSeguros = safeJsonParse<string[]>(
      paciente.activeModules,
      [],
    );

    return NextResponse.json({
      paciente: {
        ...paciente,
        activeModules: Array.isArray(activeModulesSeguros)
          ? activeModulesSeguros
          : [],
        treatmentObjective: objetivoUnificado || paciente.treatmentObjective,
        clinicalFocus: objetivoUnificado || paciente.clinicalFocus,
        medicacoes,
        medicoResponsavelId: paciente.primaryDoctorId || null,
        medicoResponsavel,
        termosVersaoAceita: paciente.termosVersaoAceita ?? null,
        termosAceitoEm: toIsoUtc(paciente.termosAceitoEm),
        versaoAtualTermos: VERSAO_ATUAL_TERMOS,
      },
    });
  } catch (error: unknown) {
    logOracleRouteError("GET /api/pacientes/[id]", error, {
      pacienteId: pacienteIdLog || undefined,
    });
    return NextResponse.json(
      { error: "Erro ao buscar paciente." },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  return handleUpdate(req, params);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return handleUpdate(req, params);
}

async function handleUpdate(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>,
) {
  let pacienteIdLog = "";
  try {
    const { id } = await paramsPromise;
    pacienteIdLog = id;
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado para alteração de pacientes." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      nome,
      cpf,
      rg,
      dataNascimento,
      sexo,
      estadoCivil,
      profissao,
      convenio,
      planoFaaz,
      status,
      telefoneWhatsapp,
      telefoneSecundario,
      email,
      contatoEmergenciaNome,
      contatoEmergenciaTelefone,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      metaHidricaMl,
      avatarUrl,
      photoUrl,
      treatmentObjective,
      clinicalFocus,
      workoutType,
      workoutFrequency,
      workoutDuration,
      workoutRestrictions,
      medicoResponsavelId,
      primaryDoctorId,
    } = body;

    const cleanCpf = cpf !== undefined ? String(cpf).replace(/\D/g, "") : undefined;

    const biologicalSex: BiologicalSex | undefined =
      sexo !== undefined
        ? sexo === "Masculino" || sexo === "MALE"
          ? "MALE"
          : sexo === "Feminino" || sexo === "FEMALE"
            ? "FEMALE"
            : "OTHER"
        : undefined;

    const patientStatus: PatientStatus | undefined =
      status !== undefined
        ? status === "Inativo"
          ? "INACTIVE"
          : "ACTIVE"
        : undefined;

    const rawMedicoParam =
      medicoResponsavelId !== undefined
        ? medicoResponsavelId
        : primaryDoctorId;
    let resolvedPrimaryDoctorId: string | null | undefined = undefined;
    if (rawMedicoParam !== undefined) {
      if (rawMedicoParam === null || String(rawMedicoParam).trim() === "") {
        resolvedPrimaryDoctorId = null;
      } else {
        const validUserId = await resolverUsuarioMedicoId(
          String(rawMedicoParam),
          sessao?.organizationId,
        );
        if (!validUserId) {
          return NextResponse.json(
            { error: "Médico responsável informado não foi encontrado." },
            { status: 400 },
          );
        }
        resolvedPrimaryDoctorId = validUserId;
      }
    }

    const patientRepo = await getRepository(PatientEntity);

    const objetivoInformado =
      treatmentObjective !== undefined
        ? treatmentObjective
          ? normalizarObjetivoClinicoValor(String(treatmentObjective))
          : null
        : clinicalFocus !== undefined
          ? clinicalFocus
            ? normalizarObjetivoClinicoValor(String(clinicalFocus))
            : null
          : undefined;

    await patientRepo.update(
      { id },
      {
        ...(nome ? { fullName: String(nome).trim().toUpperCase() } : {}),
        ...(cleanCpf !== undefined ? { cpf: cleanCpf || null } : {}),
        ...(rg !== undefined
          ? { rg: rg ? String(rg).trim().toUpperCase() : null }
          : {}),
        ...(dataNascimento !== undefined
          ? {
              birthDate: dataNascimento
                ? String(dataNascimento).split("T")[0]
                : null,
            }
          : {}),
        ...(biologicalSex !== undefined ? { biologicalSex } : {}),
        ...(estadoCivil !== undefined
          ? { estadoCivil: estadoCivil || null }
          : {}),
        ...(profissao !== undefined
          ? {
              profissao: profissao
                ? String(profissao).trim().toUpperCase()
                : null,
            }
          : {}),
        ...(convenio !== undefined
          ? { convenio: convenio || "Particular" }
          : {}),
        ...(planoFaaz !== undefined ? { planoFaaz: Boolean(planoFaaz) } : {}),
        ...(patientStatus !== undefined ? { patientStatus } : {}),
        ...(telefoneWhatsapp !== undefined
          ? { phoneWhatsapp: String(telefoneWhatsapp).trim() }
          : {}),
        ...(telefoneSecundario !== undefined
          ? { telefoneSecundario: telefoneSecundario || null }
          : {}),
        ...(email !== undefined
          ? { email: email ? String(email).trim() : null }
          : {}),
        ...(contatoEmergenciaNome !== undefined
          ? {
              contatoEmergenciaNome: contatoEmergenciaNome
                ? String(contatoEmergenciaNome).trim().toUpperCase()
                : null,
            }
          : {}),
        ...(contatoEmergenciaTelefone !== undefined
          ? { contatoEmergenciaTelefone: contatoEmergenciaTelefone || null }
          : {}),
        ...(cep !== undefined ? { zipCode: cep || null } : {}),
        ...(logradouro !== undefined
          ? {
              street: logradouro
                ? String(logradouro).trim().toUpperCase()
                : null,
            }
          : {}),
        ...(numero !== undefined ? { number: numero || null } : {}),
        ...(complemento !== undefined
          ? {
              complement: complemento
                ? String(complemento).trim().toUpperCase()
                : null,
            }
          : {}),
        ...(bairro !== undefined
          ? {
              neighborhood: bairro
                ? String(bairro).trim().toUpperCase()
                : null,
            }
          : {}),
        ...(cidade !== undefined
          ? { city: cidade ? String(cidade).trim().toUpperCase() : null }
          : {}),
        ...(estado !== undefined
          ? { state: estado ? String(estado).trim().toUpperCase() : null }
          : {}),
        ...(metaHidricaMl !== undefined
          ? { metaDiariaMl: parseInt(String(metaHidricaMl), 10) || 2500 }
          : {}),
        ...(avatarUrl !== undefined
          ? { avatarUrl: avatarUrl || null, photoUrl: avatarUrl || null }
          : {}),
        ...(photoUrl !== undefined && avatarUrl === undefined
          ? { photoUrl: photoUrl || null, avatarUrl: photoUrl || null }
          : {}),
        ...(objetivoInformado !== undefined
          ? {
              treatmentObjective: objetivoInformado,
              clinicalFocus: objetivoInformado,
            }
          : {}),
        ...(workoutType !== undefined
          ? { workoutType: workoutType ? String(workoutType).trim() : null }
          : {}),
        ...(workoutFrequency !== undefined
          ? {
              workoutFrequency: workoutFrequency
                ? parseInt(String(workoutFrequency), 10)
                : null,
            }
          : {}),
        ...(workoutDuration !== undefined
          ? {
              workoutDuration: workoutDuration
                ? parseInt(String(workoutDuration), 10)
                : null,
            }
          : {}),
        ...(workoutRestrictions !== undefined
          ? {
              workoutRestrictions: workoutRestrictions
                ? String(workoutRestrictions).trim()
                : null,
            }
          : {}),
        ...(resolvedPrimaryDoctorId !== undefined
          ? { primaryDoctorId: resolvedPrimaryDoctorId }
          : {}),
      },
    );

    // Sincroniza PRONTUARIOS_PACIENTES.OBJETIVO quando o objetivo for atualizado pela rota de paciente
    if (objetivoInformado !== undefined) {
      const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
      const existingProntuario = await prontuarioRepo.findOne({
        where: { pacienteId: id },
      });
      if (existingProntuario) {
        existingProntuario.objetivo = objetivoInformado;
        await prontuarioRepo.save(existingProntuario);
      }
    }

    const pacienteAtualizado = await patientRepo.findOne({ where: { id } });
    const medicoResponsavelAtualizado = pacienteAtualizado
      ? await resolverMedicoResponsavel(pacienteAtualizado.id, {
          primaryDoctorId: pacienteAtualizado.primaryDoctorId,
          organizationId: pacienteAtualizado.organizationId,
        })
      : null;

    return NextResponse.json({
      sucesso: true,
      mensagem: "Paciente alterado com sucesso!",
      paciente: pacienteAtualizado
        ? {
            ...pacienteAtualizado,
            medicoResponsavelId: pacienteAtualizado.primaryDoctorId || null,
            medicoResponsavel: medicoResponsavelAtualizado,
          }
        : null,
    });
  } catch (error: unknown) {
    logOracleRouteError("UPDATE /api/pacientes/[id]", error, {
      pacienteId: pacienteIdLog || undefined,
    });
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "CPF já cadastrado para outro paciente." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Erro ao atualizar paciente." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pacientes/[id] — Excluir paciente e todos os registros filhos em transação única
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  let pacienteIdLog = "";
  try {
    const { id } = await params;
    pacienteIdLog = id;
    const sessao = await getSessao();

    if (!sessao || !podeExcluirPacientes(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Apenas a Diretoria Clínica ou Administrador podem excluir pacientes.",
          cargoAtual: sessao?.cargo || "NÃO_AUTENTICADO",
        },
        { status: 403 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);
    const paciente = await patientRepo.findOne({
      where: { id },
      select: { id: true, cpf: true, recordCode: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const idsVinculadosSet = new Set<string>([paciente.id]);
    if (paciente.cpf) {
      idsVinculadosSet.add(paciente.cpf);
      const cpfLimpo = paciente.cpf.replace(/\D/g, "");
      if (cpfLimpo) idsVinculadosSet.add(cpfLimpo);
    }
    if (paciente.recordCode) {
      idsVinculadosSet.add(paciente.recordCode);
    }
    const idsVinculados = Array.from(idsVinculadosSet);

    await withTransaction(async (manager) => {
      // 1. Check-ins sem FK rígida (podem referenciar ID, CPF ou código de prontuário)
      await manager.getRepository(CheckinIntestinalEntity).delete({
        pacienteId: In(idsVinculados),
      });
      await manager.getRepository(CheckinHidratacaoEntity).delete({
        pacienteId: In(idsVinculados),
      });

      // 2. Dieta estruturada (ordem folha -> raiz)
      await executarEtapaLimpezaOracle(
        manager,
        "DIET_SUBSTITUTIONS",
        `DELETE FROM "DIET_SUBSTITUTIONS" WHERE "PATIENT_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "CHECKINS_REFEICOES",
        `DELETE FROM "CHECKINS_REFEICOES" WHERE "PACIENTE_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "SUBSTITUICOES_ITENS_REFEICAO",
        `DELETE FROM "SUBSTITUICOES_ITENS_REFEICAO"
         WHERE "ITEM_REFEICAO_ID" IN (
           SELECT ir."ID"
           FROM "ITENS_REFEICOES" ir
           INNER JOIN "REFEICOES" r ON r."ID" = ir."REFEICAO_ID"
           INNER JOIN "VARIACOES_DIETA" v ON v."ID" = r."VARIACAO_DIETA_ID"
           INNER JOIN "PLANOS_ALIMENTARES" p ON p."ID" = v."PLANO_ALIMENTAR_ID"
           WHERE p."PACIENTE_ID" = :1
         )`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "ITENS_REFEICOES",
        `DELETE FROM "ITENS_REFEICOES"
         WHERE "REFEICAO_ID" IN (
           SELECT r."ID"
           FROM "REFEICOES" r
           INNER JOIN "VARIACOES_DIETA" v ON v."ID" = r."VARIACAO_DIETA_ID"
           INNER JOIN "PLANOS_ALIMENTARES" p ON p."ID" = v."PLANO_ALIMENTAR_ID"
           WHERE p."PACIENTE_ID" = :1
         )`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "REFEICOES",
        `DELETE FROM "REFEICOES"
         WHERE "VARIACAO_DIETA_ID" IN (
           SELECT v."ID"
           FROM "VARIACOES_DIETA" v
           INNER JOIN "PLANOS_ALIMENTARES" p ON p."ID" = v."PLANO_ALIMENTAR_ID"
           WHERE p."PACIENTE_ID" = :1
         )`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "VARIACOES_DIETA",
        `DELETE FROM "VARIACOES_DIETA"
         WHERE "PLANO_ALIMENTAR_ID" IN (
           SELECT "ID" FROM "PLANOS_ALIMENTARES" WHERE "PACIENTE_ID" = :1
         )`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "PLANOS_ALIMENTARES",
        `DELETE FROM "PLANOS_ALIMENTARES" WHERE "PACIENTE_ID" = :1`,
        [id],
      );

      // 3. Dieta legada (FKs com ON DELETE NO ACTION no Oracle)
      await executarEtapaLimpezaOracle(
        manager,
        "DIET_MEAL_ITEMS",
        `DELETE FROM "DIET_MEAL_ITEMS"
         WHERE "DIET_MEAL_ID" IN (
           SELECT dm."ID"
           FROM "DIET_MEALS" dm
           INNER JOIN "DIET_PLANS" dp ON dp."ID" = dm."DIET_PLAN_ID"
           WHERE dp."PATIENT_ID" = :1
         )`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "DIET_MEALS",
        `DELETE FROM "DIET_MEALS"
         WHERE "DIET_PLAN_ID" IN (
           SELECT "ID" FROM "DIET_PLANS" WHERE "PATIENT_ID" = :1
         )`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "DIET_PLANS:unlink-parent",
        `UPDATE "DIET_PLANS" SET "PARENT_DIET_PLAN_ID" = NULL
         WHERE "PATIENT_ID" = :1 AND "PARENT_DIET_PLAN_ID" IS NOT NULL`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "DIET_PLANS",
        `DELETE FROM "DIET_PLANS" WHERE "PATIENT_ID" = :1`,
        [id],
      );

      // 4. Metas e check-ins de metas (FKs FK_GCHECK_PATIENT, FK_GCHECK_GOAL e FK_GOALS_PATIENT com ON DELETE NO ACTION)
      await executarEtapaLimpezaOracle(
        manager,
        "GOAL_CHECKINS",
        `DELETE FROM "GOAL_CHECKINS"
         WHERE "PATIENT_ID" = :1
            OR "PATIENT_GOAL_ID" IN (
              SELECT "ID" FROM "PATIENT_GOALS" WHERE "PATIENT_ID" = :2
            )`,
        [id, id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "PATIENT_GOALS",
        `DELETE FROM "PATIENT_GOALS" WHERE "PATIENT_ID" = :1`,
        [id],
      );

      // 5. Módulo glicêmico e insulina
      await executarEtapaLimpezaOracle(
        manager,
        "REGISTROS_INSULINA",
        `DELETE FROM "REGISTROS_INSULINA" WHERE "PACIENTE_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "REGISTROS_GLICEMIA",
        `DELETE FROM "REGISTROS_GLICEMIA" WHERE "PACIENTE_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "PROTOCOLOS_GLICEMICOS",
        `DELETE FROM "PROTOCOLOS_GLICEMICOS" WHERE "PACIENTE_ID" = :1`,
        [id],
      );

      // 6. Sono, treinos, medidas e biometria (FK_BIOM_PATIENT com ON DELETE NO ACTION)
      await executarEtapaLimpezaOracle(
        manager,
        "CHECKINS_SONO",
        `DELETE FROM "CHECKINS_SONO" WHERE "PACIENTE_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "WORKOUT_LOGS",
        `DELETE FROM "WORKOUT_LOGS" WHERE "PATIENT_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "MEASUREMENTS",
        `DELETE FROM "MEASUREMENTS" WHERE "PATIENT_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "BIOMETRIC_MEASUREMENTS",
        `DELETE FROM "BIOMETRIC_MEASUREMENTS" WHERE "PATIENT_ID" = :1`,
        [id],
      );

      // 7. Pacotes (Plano FAAZ), agenda, evoluções e prontuário
      await executarEtapaLimpezaOracle(
        manager,
        "CONSULTAS_PACOTE",
        `DELETE FROM "CONSULTAS_PACOTE"
         WHERE "PACIENTE_ID" = :1
            OR "PACOTE_ID" IN (
              SELECT "ID" FROM "PACOTES_ACOMPANHAMENTO" WHERE "PACIENTE_ID" = :2
            )`,
        [id, id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "PACOTES_ACOMPANHAMENTO",
        `DELETE FROM "PACOTES_ACOMPANHAMENTO" WHERE "PACIENTE_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "AGENDAMENTOS",
        `DELETE FROM "AGENDAMENTOS" WHERE "PACIENTE_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "EVOLUCOES_CLINICAS",
        `DELETE FROM "EVOLUCOES_CLINICAS" WHERE "PACIENTE_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "PRONTUARIOS_PACIENTES",
        `DELETE FROM "PRONTUARIOS_PACIENTES" WHERE "PACIENTE_ID" = :1`,
        [id],
      );

      // 8. Tabelas clínicas legadas (FKs com ON DELETE NO ACTION)
      await executarEtapaLimpezaOracle(
        manager,
        "APPOINTMENTS",
        `DELETE FROM "APPOINTMENTS" WHERE "PATIENT_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "CONSULTATIONS:unlink-parent",
        `UPDATE "CONSULTATIONS" SET "PARENT_CONSULTATION_ID" = NULL
         WHERE "PATIENT_ID" = :1 AND "PARENT_CONSULTATION_ID" IS NOT NULL`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "CONSULTATIONS",
        `DELETE FROM "CONSULTATIONS" WHERE "PATIENT_ID" = :1`,
        [id],
      );
      await executarEtapaLimpezaOracle(
        manager,
        "CARE_PLANS",
        `DELETE FROM "CARE_PLANS" WHERE "PATIENT_ID" = :1`,
        [id],
      );

      // 9. Desvincula trilha de auditoria preservando logs históricos
      await executarEtapaLimpezaOracle(
        manager,
        "AUDIT_LOGS:unlink-patient",
        `UPDATE "AUDIT_LOGS" SET "PATIENT_ID" = NULL WHERE "PATIENT_ID" = :1`,
        [id],
      );

      // 10. Exclusão definitiva na tabela principal de pacientes
      await manager.getRepository(PatientEntity).delete({ id });
    });

    invalidarCacheMetricaPeso();

    return NextResponse.json({
      sucesso: true,
      mensagem: `Paciente '${paciente.fullName}' excluído com sucesso!`,
    });
  } catch (error: unknown) {
    logOracleRouteError("DELETE /api/pacientes/[id]", error, {
      pacienteId: pacienteIdLog || undefined,
    });
    return NextResponse.json(
      { error: "Erro ao excluir paciente." },
      { status: 500 },
    );
  }
}
