export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { In } from "typeorm";
import { getRepository, withTransaction } from "@/lib/db/data-source";
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("ORA-00001") || msg.includes("UQ_PATIENTS");
}

/**
 * GET /api/pacientes/[id] — Retorna os dados de um paciente específico
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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
    if (!sessao || podeAcessarDadosClinicos(sessao.cargo)) {
      const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
      const prontuario = await prontuarioRepo.findOne({
        where: { pacienteId: paciente.id },
        select: { id: true, medicacoes: true },
      });
      medicacoes = prontuario?.medicacoes?.trim() || null;
    }

    return NextResponse.json({
      paciente: {
        ...paciente,
        medicacoes,
      },
    });
  } catch (error: unknown) {
    console.error("[PACIENTES/[ID]/GET] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao buscar paciente.", details },
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
  try {
    const { id } = await paramsPromise;
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

    const patientRepo = await getRepository(PatientEntity);

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
        ...(treatmentObjective !== undefined
          ? {
              treatmentObjective: treatmentObjective
                ? String(treatmentObjective).trim()
                : null,
              clinicalFocus: treatmentObjective
                ? String(treatmentObjective).trim()
                : null,
            }
          : clinicalFocus !== undefined
            ? {
                clinicalFocus: clinicalFocus
                  ? String(clinicalFocus).trim()
                  : null,
                treatmentObjective: clinicalFocus
                  ? String(clinicalFocus).trim()
                  : null,
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
      },
    );

    const pacienteAtualizado = await patientRepo.findOne({ where: { id } });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Paciente alterado com sucesso!",
      paciente: pacienteAtualizado,
    });
  } catch (error: unknown) {
    console.error("[PACIENTES/[ID]/UPDATE] Erro:", error);
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "CPF já cadastrado para outro paciente." },
        { status: 409 },
      );
    }
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao atualizar paciente.", details },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pacientes/[id] — Excluir paciente
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (!sessao || !podeExcluirPacientes(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Apenas o Dono da Clínica ou Administrador podem excluir pacientes.",
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

    const idsVinculados = [paciente.id];
    if (paciente.cpf)
      idsVinculados.push(paciente.cpf, paciente.cpf.replace(/\D/g, ""));
    if (paciente.recordCode) idsVinculados.push(paciente.recordCode);

    await withTransaction(async (manager) => {
      await manager.getRepository(CheckinIntestinalEntity).delete({
        pacienteId: In(idsVinculados),
      });
      await manager.getRepository(CheckinHidratacaoEntity).delete({
        pacienteId: In(idsVinculados),
      });
      await manager.getRepository(PatientEntity).delete({ id });
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: `Paciente '${paciente.fullName}' excluído com sucesso!`,
    });
  } catch (error: unknown) {
    console.error("[PACIENTES/[ID]/DELETE] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao excluir paciente.", details },
      { status: 500 },
    );
  }
}
