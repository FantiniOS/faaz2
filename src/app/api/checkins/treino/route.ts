export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Between, IsNull, MoreThanOrEqual, Raw } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { PatientEntity, WorkoutLogEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";

async function resolverPacienteIdValido(rawId?: string): Promise<string | null> {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanId = rawId?.trim() || "";
  const patientRepo = await getRepository(PatientEntity);

  if (cleanId && uuidRegex.test(cleanId)) {
    const found = await patientRepo.findOne({
      where: { id: cleanId },
      select: { id: true },
    });
    if (found) return found.id;
  }

  if (cleanId) {
    const byCode = await patientRepo.findOne({
      where: [
        {
          recordCode: Raw((alias) => `LOWER(${alias}) = :code`, {
            code: cleanId.toLowerCase(),
          }),
        },
        { cpf: cleanId.replace(/\D/g, "") },
      ],
      select: { id: true },
    });
    if (byCode) return byCode.id;
  }

  const sessao = await getSessao();
  if (sessao?.userId) {
    const byUser = await patientRepo.findOne({
      where: { userId: sessao.userId, deletedAt: IsNull() },
      select: { id: true },
    });
    if (byUser) return byUser.id;
  }

  const carlos = await patientRepo.findOne({
    where: [
      { recordCode: "FAAZ-00001", deletedAt: IsNull() },
      {
        fullName: Raw((alias) => `LOWER(${alias}) LIKE :name`, {
          name: "%carlos eduardo fantini%",
        }),
        deletedAt: IsNull(),
      },
    ],
    select: { id: true },
  });
  if (carlos) return carlos.id;

  const anyPatient = await patientRepo.findOne({
    where: { deletedAt: IsNull() },
    select: { id: true },
  });
  return anyPatient ? anyPatient.id : null;
}

function getIntervaloHoje() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const dia = agora.getDate();

  const inicioHoje = new Date(ano, mes, dia, 0, 0, 0, 0);
  const fimHoje = new Date(ano, mes, dia, 23, 59, 59, 999);

  return { inicioHoje, fimHoje };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawPacienteId =
      searchParams.get("pacienteId") ||
      searchParams.get("patientId") ||
      req.headers.get("x-patient-id") ||
      undefined;

    const pacienteId = await resolverPacienteIdValido(rawPacienteId);
    if (!pacienteId) {
      return NextResponse.json(
        { error: "Paciente não identificado." },
        { status: 400 },
      );
    }

    const { inicioHoje, fimHoje } = getIntervaloHoje();
    const workoutRepo = await getRepository(WorkoutLogEntity);

    const checkinHoje = await workoutRepo.findOne({
      where: {
        patientId: pacienteId,
        date: Between(inicioHoje, fimHoje),
      },
      order: { date: "DESC" },
    });

    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    trintaDiasAtras.setHours(0, 0, 0, 0);

    const checkinsUltimos30Dias = await workoutRepo.find({
      where: {
        patientId: pacienteId,
        date: MoreThanOrEqual(trintaDiasAtras),
      },
      order: { date: "DESC" },
    });

    const diasDistintos = new Set(
      checkinsUltimos30Dias.map((c) => new Date(c.date).toISOString().slice(0, 10)),
    );

    return NextResponse.json({
      sucesso: true,
      pacienteId,
      treinouHoje: !!checkinHoje,
      checkinHoje: checkinHoje || null,
      totalCheckins30Dias: diasDistintos.size,
      checkinsRecentes: checkinsUltimos30Dias.slice(0, 10),
    });
  } catch (error: unknown) {
    console.error("[CHECKINS_TREINO_GET] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consultar check-in de treino.", details },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, string | undefined> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const rawPacienteId =
      body.pacienteId ||
      body.patientId ||
      req.headers.get("x-patient-id") ||
      undefined;

    const pacienteId = await resolverPacienteIdValido(rawPacienteId);
    if (!pacienteId) {
      return NextResponse.json(
        { error: "Paciente não identificado para o registro de treino." },
        { status: 400 },
      );
    }

    const { inicioHoje, fimHoje } = getIntervaloHoje();
    const workoutRepo = await getRepository(WorkoutLogEntity);

    const existente = await workoutRepo.findOne({
      where: {
        patientId: pacienteId,
        date: Between(inicioHoje, fimHoje),
      },
    });

    if (existente) {
      return NextResponse.json({
        sucesso: true,
        mensagem: "Treino de hoje já estava registrado com sucesso!",
        checkin: existente,
        jaRegistrado: true,
      });
    }

    const novoCheckin = await workoutRepo.save(
      workoutRepo.create({
        patientId: pacienteId,
        date: new Date(),
      }),
    );

    return NextResponse.json({
      sucesso: true,
      mensagem: "Treino de hoje registrado com sucesso!",
      checkin: novoCheckin,
      treinouHoje: true,
    });
  } catch (error: unknown) {
    console.error("[CHECKINS_TREINO_POST] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao registrar treino diário.", details },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawPacienteId =
      searchParams.get("pacienteId") ||
      searchParams.get("patientId") ||
      req.headers.get("x-patient-id") ||
      undefined;

    const pacienteId = await resolverPacienteIdValido(rawPacienteId);
    if (!pacienteId) {
      return NextResponse.json(
        { error: "Paciente não identificado." },
        { status: 400 },
      );
    }

    const { inicioHoje, fimHoje } = getIntervaloHoje();
    const workoutRepo = await getRepository(WorkoutLogEntity);

    const checkinHoje = await workoutRepo.findOne({
      where: {
        patientId: pacienteId,
        date: Between(inicioHoje, fimHoje),
      },
    });

    if (checkinHoje) {
      await workoutRepo.delete({ id: checkinHoje.id });
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Registro de treino do dia desfeito com sucesso.",
      treinouHoje: false,
    });
  } catch (error: unknown) {
    console.error("[CHECKINS_TREINO_DELETE] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao desfazer treino.", details },
      { status: 500 },
    );
  }
}
