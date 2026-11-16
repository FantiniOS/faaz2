import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawCpf = body?.cpf ? String(body.cpf).trim() : "";

    // Higieniza o CPF para considerar apenas dígitos numéricos
    const cleanCpf = rawCpf.replace(/\D/g, "");

    if (!cleanCpf) {
      return NextResponse.json(
        {
          sucesso: false,
          error: "O CPF do paciente é obrigatório para autenticação.",
        },
        { status: 400 }
      );
    }

    // Busca o paciente no banco de dados da Clínica FAAZ
    // Busca por dígitos limpos ou pelo valor com pontuação
    const paciente = await prisma.patient.findFirst({
      where: {
        OR: [
          { cpf: cleanCpf },
          { cpf: rawCpf },
        ],
        deletedAt: null,
      },
      include: {
        primaryDoctor: {
          select: {
            fullName: true,
            specialty: true,
          },
        },
      },
    });

    if (!paciente) {
      return NextResponse.json(
        {
          sucesso: false,
          error: "Paciente não cadastrado na Clínica FAAZ. Verifique o CPF digitado ou procure a recepção.",
        },
        { status: 404 }
      );
    }

    if (paciente.patientStatus !== "ACTIVE") {
      return NextResponse.json(
        {
          sucesso: false,
          error: "Prontuário inativo ou suspenso. Entre em contato com a equipe médica.",
        },
        { status: 403 }
      );
    }

    // Retorna os dados do paciente para salvar no estado global do app mobile
    return NextResponse.json(
      {
        sucesso: true,
        message: `Bem-vindo(a) à Clínica FAAZ, ${paciente.fullName}!`,
        paciente: {
          id: paciente.id,
          nome: paciente.fullName,
          socialName: paciente.socialName,
          cpf: paciente.cpf,
          metaDiariaMl: paciente.metaDiariaMl || 2500,
          recordCode: paciente.recordCode,
          medicoResponsavel: paciente.primaryDoctor?.fullName || "Dr. Carlos Fantini",
          especialidadeMedico: paciente.primaryDoctor?.specialty || "Endocrinologia & Nutrologia",
          focoClinico: paciente.treatmentObjective || paciente.clinicalFocus || "Otimização Metabólica & Saúde Integrativa",
          treatmentObjective: paciente.treatmentObjective || paciente.clinicalFocus || "Otimização Metabólica & Saúde Integrativa",
          avatarUrl: paciente.avatarUrl || paciente.photoUrl || null,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API_AUTH_PACIENTE_ERROR]", error);
    return NextResponse.json(
      {
        sucesso: false,
        error: "Erro interno no servidor ao autenticar paciente.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
