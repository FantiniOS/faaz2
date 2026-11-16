export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";
import { podeCadastrarPacientes, podeExcluirPacientes } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id] — Retorna os dados de um paciente específico
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    const paciente = await prisma.patient.findUnique({
      where: { id },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ paciente });
  } catch (error: any) {
    console.error("[PACIENTES/[ID]/GET] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao buscar paciente.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT/PATCH /api/pacientes/[id] — Alterar dados do paciente
 * Acesso: SECRETARIA, MEDICO, ADMINISTRADOR, DONO_CLINICA
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  return handleUpdate(req, params);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return handleUpdate(req, params);
}

async function handleUpdate(req: NextRequest, paramsPromise: Promise<{ id: string }>) {
  try {
    const { id } = await paramsPromise;
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado para alteração de pacientes." },
        { status: 403 }
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

    const cleanCpf = cpf ? String(cpf).replace(/\D/g, "") : undefined;

    const pacienteAtualizado = await prisma.patient.update({
      where: { id },
      data: {
        ...(nome ? { fullName: nome.trim().toUpperCase() } : {}),
        ...(cleanCpf !== undefined ? { cpf: cleanCpf || null } : {}),
        ...(rg !== undefined ? { rg: rg ? rg.trim().toUpperCase() : null } : {}),
        ...(dataNascimento !== undefined
          ? { birthDate: dataNascimento ? new Date(dataNascimento) : null }
          : {}),
        ...(sexo !== undefined
          ? {
              biologicalSex:
                sexo === "Masculino" || sexo === "MALE"
                  ? "MALE"
                  : sexo === "Feminino" || sexo === "FEMALE"
                  ? "FEMALE"
                  : "OTHER",
            }
          : {}),
        ...(estadoCivil !== undefined ? { estadoCivil: estadoCivil || null } : {}),
        ...(profissao !== undefined ? { profissao: profissao ? profissao.trim().toUpperCase() : null } : {}),
        ...(convenio !== undefined ? { convenio: convenio || "Particular" } : {}),
        ...(planoFaaz !== undefined ? { planoFaaz: Boolean(planoFaaz) } : {}),
        ...(status !== undefined
          ? { patientStatus: status === "Inativo" ? "INACTIVE" : "ACTIVE" }
          : {}),
        ...(telefoneWhatsapp !== undefined
          ? { phoneWhatsapp: telefoneWhatsapp.trim() }
          : {}),
        ...(telefoneSecundario !== undefined
          ? { telefoneSecundario: telefoneSecundario || null }
          : {}),
        ...(email !== undefined ? { email: email ? email.trim() : null } : {}),
        ...(contatoEmergenciaNome !== undefined
          ? { contatoEmergenciaNome: contatoEmergenciaNome ? contatoEmergenciaNome.trim().toUpperCase() : null }
          : {}),
        ...(contatoEmergenciaTelefone !== undefined
          ? { contatoEmergenciaTelefone: contatoEmergenciaTelefone || null }
          : {}),
        ...(cep !== undefined ? { zipCode: cep || null } : {}),
        ...(logradouro !== undefined ? { street: logradouro ? logradouro.trim().toUpperCase() : null } : {}),
        ...(numero !== undefined ? { number: numero || null } : {}),
        ...(complemento !== undefined ? { complement: complemento ? complemento.trim().toUpperCase() : null } : {}),
        ...(bairro !== undefined ? { neighborhood: bairro ? bairro.trim().toUpperCase() : null } : {}),
        ...(cidade !== undefined ? { city: cidade ? cidade.trim().toUpperCase() : null } : {}),
        ...(estado !== undefined ? { state: estado ? estado.trim().toUpperCase() : null } : {}),
        ...(metaHidricaMl !== undefined
          ? { metaDiariaMl: parseInt(metaHidricaMl) || 2500 }
          : {}),
        ...(avatarUrl !== undefined
          ? { avatarUrl: avatarUrl || null, photoUrl: avatarUrl || null }
          : {}),
        ...(photoUrl !== undefined && avatarUrl === undefined
          ? { photoUrl: photoUrl || null, avatarUrl: photoUrl || null }
          : {}),
        ...(treatmentObjective !== undefined
          ? {
              treatmentObjective: treatmentObjective ? String(treatmentObjective).trim() : null,
              clinicalFocus: treatmentObjective ? String(treatmentObjective).trim() : null,
            }
          : clinicalFocus !== undefined
          ? {
              clinicalFocus: clinicalFocus ? String(clinicalFocus).trim() : null,
              treatmentObjective: clinicalFocus ? String(clinicalFocus).trim() : null,
            }
          : {}),
        ...(workoutType !== undefined
          ? { workoutType: workoutType ? String(workoutType).trim() : null }
          : {}),
        ...(workoutFrequency !== undefined
          ? { workoutFrequency: workoutFrequency ? parseInt(String(workoutFrequency), 10) : null }
          : {}),
        ...(workoutDuration !== undefined
          ? { workoutDuration: workoutDuration ? parseInt(String(workoutDuration), 10) : null }
          : {}),
        ...(workoutRestrictions !== undefined
          ? { workoutRestrictions: workoutRestrictions ? String(workoutRestrictions).trim() : null }
          : {}),
      },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Paciente alterado com sucesso!",
      paciente: pacienteAtualizado,
    });
  } catch (error: any) {
    console.error("[PACIENTES/[ID]/UPDATE] Erro:", error);
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "CPF já cadastrado para outro paciente." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Erro ao atualizar paciente.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pacientes/[id] — Excluir paciente
 * Regra de Segurança (RBAC): SOMENTE DONO_CLINICA ou ADMINISTRADOR.
 * SECRETARIA ou MEDICO retornam 403 Forbidden.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    // Trava estrita de autorização RBAC
    if (!sessao || !podeExcluirPacientes(sessao.cargo)) {
      return NextResponse.json(
        {
          error: "Apenas o Dono da Clínica ou Administrador podem excluir pacientes.",
          cargoAtual: sessao?.cargo || "NÃO_AUTENTICADO",
        },
        { status: 403 }
      );
    }

    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, cpf: true, recordCode: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    // Exclusão em cascata: remove checkins vinculados para não violar chaves estrangeiras
    const idsVinculados = [paciente.id];
    if (paciente.cpf) idsVinculados.push(paciente.cpf, paciente.cpf.replace(/\D/g, ""));
    if (paciente.recordCode) idsVinculados.push(paciente.recordCode);

    await prisma.$transaction([
      prisma.checkinIntestinal.deleteMany({
        where: { pacienteId: { in: idsVinculados } },
      }),
      prisma.checkinHidratacao.deleteMany({
        where: { pacienteId: { in: idsVinculados } },
      }),
      prisma.patient.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({
      sucesso: true,
      mensagem: `Paciente '${paciente.fullName}' excluído com sucesso!`,
    });
  } catch (error: any) {
    console.error("[PACIENTES/[ID]/DELETE] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao excluir paciente.", details: error?.message },
      { status: 500 }
    );
  }
}
