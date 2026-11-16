export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos, podeCadastrarPacientes } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/treinos
 * Retorna as diretrizes de treino do paciente e as métricas de adesão dos últimos 30 dias
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Apenas profissionais clínicos podem visualizar as diretrizes." },
        { status: 403 }
      );
    }

    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        workoutType: true,
        workoutFrequency: true,
        workoutDuration: true,
        workoutRestrictions: true,
      },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    // Calcula adesão dos últimos 30 dias no WorkoutLog
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    trintaDiasAtras.setHours(0, 0, 0, 0);

    const checkins30Dias = await prisma.workoutLog.findMany({
      where: {
        patientId: id,
        date: { gte: trintaDiasAtras },
      },
      orderBy: { date: "desc" },
    });

    // Agrupa por dias distintos
    const mapDias = new Map<string, Date>();
    checkins30Dias.forEach((c) => {
      const diaKey = c.date.toISOString().slice(0, 10);
      if (!mapDias.has(diaKey)) {
        mapDias.set(diaKey, c.date);
      }
    });

    const diasAtivosCount = mapDias.size;
    const frequenciaSemanal = paciente.workoutFrequency ?? 3;
    // Meta esperada em 30 dias (~4.28 semanas)
    const metaEsperada30Dias = Math.max(1, Math.round((frequenciaSemanal / 7) * 30));
    const porcentagemAdesao = Math.min(100, Math.round((diasAtivosCount / metaEsperada30Dias) * 100));

    return NextResponse.json({
      sucesso: true,
      paciente: {
        id: paciente.id,
        nome: paciente.fullName,
      },
      diretrizes: {
        workoutType: paciente.workoutType || "Musculação",
        workoutFrequency: paciente.workoutFrequency ?? 3,
        workoutDuration: paciente.workoutDuration ?? 45,
        workoutRestrictions: paciente.workoutRestrictions || "",
      },
      adesao: {
        diasAtivosUltimos30Dias: diasAtivosCount,
        metaEsperada30Dias,
        porcentagemAdesao,
        frequenciaSemanal,
        totalLogs: checkins30Dias.length,
        historicoCheckins: checkins30Dias.map((c) => ({
          id: c.id,
          data: c.date,
        })),
      },
    });
  } catch (error: any) {
    console.error("[PACIENTES_TREINOS_GET] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao consultar diretrizes de treinos.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT / PATCH /api/pacientes/[id]/treinos
 * Atualiza as diretrizes de atividade física do paciente prescritas pela médica
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  return handleSalvarDiretrizes(req, params);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return handleSalvarDiretrizes(req, params);
}

async function handleSalvarDiretrizes(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  try {
    const { id } = await paramsPromise;
    const sessao = await getSessao();

    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado para alteração de diretrizes médicas." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      workoutType,
      workoutFrequency,
      workoutDuration,
      workoutRestrictions,
    } = body;

    const freqNumber =
      workoutFrequency !== undefined && workoutFrequency !== null
        ? Math.min(7, Math.max(1, parseInt(String(workoutFrequency), 10) || 3))
        : undefined;

    const durNumber =
      workoutDuration !== undefined && workoutDuration !== null
        ? Math.max(5, parseInt(String(workoutDuration), 10) || 45)
        : undefined;

    const pacienteAtualizado = await prisma.patient.update({
      where: { id },
      data: {
        ...(workoutType !== undefined
          ? { workoutType: workoutType ? String(workoutType).trim() : null }
          : {}),
        ...(freqNumber !== undefined ? { workoutFrequency: freqNumber } : {}),
        ...(durNumber !== undefined ? { workoutDuration: durNumber } : {}),
        ...(workoutRestrictions !== undefined
          ? {
              workoutRestrictions: workoutRestrictions
                ? String(workoutRestrictions).trim()
                : null,
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        workoutType: true,
        workoutFrequency: true,
        workoutDuration: true,
        workoutRestrictions: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Diretrizes de treino atualizadas com sucesso!",
      diretrizes: {
        workoutType: pacienteAtualizado.workoutType,
        workoutFrequency: pacienteAtualizado.workoutFrequency,
        workoutDuration: pacienteAtualizado.workoutDuration,
        workoutRestrictions: pacienteAtualizado.workoutRestrictions,
      },
    });
  } catch (error: any) {
    console.error("[PACIENTES_TREINOS_UPDATE] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao salvar diretrizes de treinos.", details: error?.message },
      { status: 500 }
    );
  }
}
