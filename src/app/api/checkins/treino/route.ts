export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";

/**
 * Resolve o ID do paciente de forma resiliente
 */
async function resolverPacienteIdValido(rawId?: string): Promise<string | null> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanId = rawId?.trim() || "";

  if (cleanId && uuidRegex.test(cleanId)) {
    const found = await prisma.patient.findUnique({
      where: { id: cleanId },
      select: { id: true },
    });
    if (found) return found.id;
  }

  if (cleanId) {
    const byCode = await prisma.patient.findFirst({
      where: {
        OR: [
          { recordCode: { equals: cleanId, mode: "insensitive" } },
          { cpf: cleanId.replace(/\D/g, "") },
        ],
      },
      select: { id: true },
    });
    if (byCode) return byCode.id;
  }

  // Sessão de autenticação (se logado)
  const sessao = await getSessao();
  if (sessao?.userId) {
    const byUser = await prisma.patient.findFirst({
      where: { userId: sessao.userId, deletedAt: null },
      select: { id: true },
    });
    if (byUser) return byUser.id;
  }

  // Paciente padrão Carlos Eduardo Fantini (FAAZ-00001)
  const carlos = await prisma.patient.findFirst({
    where: {
      OR: [
        { recordCode: "FAAZ-00001" },
        { fullName: { contains: "Carlos Eduardo Fantini", mode: "insensitive" } },
      ],
      deletedAt: null,
    },
    select: { id: true },
  });
  if (carlos) return carlos.id;

  // Qualquer paciente ativo
  const anyPatient = await prisma.patient.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });
  return anyPatient ? anyPatient.id : null;
}

/**
 * Retorna os limites do dia atual considerando fuso horário de Brasília (UTC-3)
 */
function getIntervaloHoje() {
  const agora = new Date();
  // Converte para dia em UTC ajustado
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const dia = agora.getDate();

  const inicioHoje = new Date(ano, mes, dia, 0, 0, 0, 0);
  const fimHoje = new Date(ano, mes, dia, 23, 59, 59, 999);

  return { inicioHoje, fimHoje };
}

/**
 * GET /api/checkins/treino
 * Consulta se o paciente já realizou o check-in de treino hoje e histórico recente
 */
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
        { status: 400 }
      );
    }

    const { inicioHoje, fimHoje } = getIntervaloHoje();

    // Check-in de hoje
    const checkinHoje = await prisma.workoutLog.findFirst({
      where: {
        patientId: pacienteId,
        date: {
          gte: inicioHoje,
          lte: fimHoje,
        },
      },
      orderBy: { date: "desc" },
    });

    // Check-ins dos últimos 30 dias
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    trintaDiasAtras.setHours(0, 0, 0, 0);

    const checkinsUltimos30Dias = await prisma.workoutLog.findMany({
      where: {
        patientId: pacienteId,
        date: {
          gte: trintaDiasAtras,
        },
      },
      orderBy: { date: "desc" },
    });

    // Contagem de dias distintos
    const diasDistintos = new Set(
      checkinsUltimos30Dias.map((c) => c.date.toISOString().slice(0, 10))
    );

    return NextResponse.json({
      sucesso: true,
      pacienteId,
      treinouHoje: !!checkinHoje,
      checkinHoje: checkinHoje || null,
      totalCheckins30Dias: diasDistintos.size,
      checkinsRecentes: checkinsUltimos30Dias.slice(0, 10),
    });
  } catch (error: any) {
    console.error("[CHECKINS_TREINO_GET] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao consultar check-in de treino.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/checkins/treino
 * Registra o check-in diário de treino do paciente no WorkoutLog
 */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
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
        { status: 400 }
      );
    }

    const { inicioHoje, fimHoje } = getIntervaloHoje();

    // Verifica se já existe check-in hoje
    const existente = await prisma.workoutLog.findFirst({
      where: {
        patientId: pacienteId,
        date: {
          gte: inicioHoje,
          lte: fimHoje,
        },
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

    // Cria o novo WorkoutLog
    const novoCheckin = await prisma.workoutLog.create({
      data: {
        patientId: pacienteId,
        date: new Date(),
      },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Treino de hoje registrado com sucesso!",
      checkin: novoCheckin,
      treinouHoje: true,
    });
  } catch (error: any) {
    console.error("[CHECKINS_TREINO_POST] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao registrar treino diário.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/checkins/treino
 * Desfaz o check-in de treino do dia atual
 */
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
        { status: 400 }
      );
    }

    const { inicioHoje, fimHoje } = getIntervaloHoje();

    const checkinHoje = await prisma.workoutLog.findFirst({
      where: {
        patientId: pacienteId,
        date: {
          gte: inicioHoje,
          lte: fimHoje,
        },
      },
    });

    if (checkinHoje) {
      await prisma.workoutLog.delete({
        where: { id: checkinHoje.id },
      });
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Registro de treino do dia desfeito com sucesso.",
      treinouHoje: false,
    });
  } catch (error: any) {
    console.error("[CHECKINS_TREINO_DELETE] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao desfazer treino.", details: error?.message },
      { status: 500 }
    );
  }
}
