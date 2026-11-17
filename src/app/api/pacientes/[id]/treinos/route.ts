export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { MoreThanOrEqual } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { PatientEntity, WorkoutLogEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos, podeCadastrarPacientes } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/treinos
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas profissionais clínicos podem visualizar as diretrizes.",
        },
        { status: 403 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);
    const workoutRepo = await getRepository(WorkoutLogEntity);

    const paciente = await patientRepo.findOne({
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
        { status: 404 },
      );
    }

    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    trintaDiasAtras.setHours(0, 0, 0, 0);

    const checkins30Dias = await workoutRepo.find({
      where: {
        patientId: id,
        date: MoreThanOrEqual(trintaDiasAtras),
      },
      order: { date: "DESC" },
    });

    const mapDias = new Map<string, Date>();
    checkins30Dias.forEach((c) => {
      const dt = new Date(c.date);
      const diaKey = dt.toISOString().slice(0, 10);
      if (!mapDias.has(diaKey)) {
        mapDias.set(diaKey, dt);
      }
    });

    const diasAtivosCount = mapDias.size;
    const frequenciaSemanal = paciente.workoutFrequency ?? 3;
    const metaEsperada30Dias = Math.max(
      1,
      Math.round((frequenciaSemanal / 7) * 30),
    );
    const porcentagemAdesao = Math.min(
      100,
      Math.round((diasAtivosCount / metaEsperada30Dias) * 100),
    );

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
  } catch (error: unknown) {
    console.error("[PACIENTES_TREINOS_GET] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consultar diretrizes de treinos.", details },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  return handleSalvarDiretrizes(req, params);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  return handleSalvarDiretrizes(req, params);
}

async function handleSalvarDiretrizes(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>,
) {
  try {
    const { id } = await paramsPromise;
    const sessao = await getSessao();

    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado para alteração de diretrizes médicas." },
        { status: 403 },
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

    const patientRepo = await getRepository(PatientEntity);

    await patientRepo.update(
      { id },
      {
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
    );

    const pacienteAtualizado = await patientRepo.findOne({
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

    return NextResponse.json({
      sucesso: true,
      mensagem: "Diretrizes de treino atualizadas com sucesso!",
      diretrizes: {
        workoutType: pacienteAtualizado?.workoutType ?? null,
        workoutFrequency: pacienteAtualizado?.workoutFrequency ?? null,
        workoutDuration: pacienteAtualizado?.workoutDuration ?? null,
        workoutRestrictions: pacienteAtualizado?.workoutRestrictions ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("[PACIENTES_TREINOS_UPDATE] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao salvar diretrizes de treinos.", details },
      { status: 500 },
    );
  }
}
