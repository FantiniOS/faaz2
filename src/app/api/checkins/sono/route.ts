export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      pacienteId,
      horas,
      horasDormidas,
      qualidade = "BOM",
      observacao,
    } = body;

    const horasValor = parseFloat(String(horas !== undefined ? horas : horasDormidas)) || 8.0;
    const qualidadeStr = String(qualidade || "BOM").toUpperCase();
    const observacaoStr = observacao ? String(observacao).trim().toUpperCase() : null;

    // Busca paciente para associar (ou o primeiro paciente cadastrado caso ID não enviado)
    let targetPatientId = pacienteId;
    if (!targetPatientId) {
      const primeiro = await prisma.patient.findFirst({
        where: { deletedAt: null },
        select: { id: true, organizationId: true },
      });
      if (primeiro) {
        targetPatientId = primeiro.id;
      }
    }

    if (!targetPatientId) {
      return NextResponse.json(
        { error: "Paciente não identificado para o registro." },
        { status: 400 }
      );
    }

    const paciente = await prisma.patient.findUnique({
      where: { id: targetPatientId },
      select: { id: true, organizationId: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado no sistema." },
        { status: 404 }
      );
    }

    // 1. Criação no modelo CheckInSono dedicado com pacienteId rigoroso
    const checkin = await prisma.checkInSono.create({
      data: {
        pacienteId: paciente.id,
        horas: horasValor,
        qualidade: qualidadeStr,
        observacao: observacaoStr,
      },
    });

    // 2. Sincronização secundária com GoalCheckin (compatibilidade de métricas históricas)
    try {
      let sleepGoal = await prisma.patientGoal.findFirst({
        where: {
          patientId: paciente.id,
          category: "SYMPTOM_DIARY",
          title: { contains: "Sono", mode: "insensitive" },
        },
      });

      if (!sleepGoal) {
        sleepGoal = await prisma.patientGoal.create({
          data: {
            organizationId: paciente.organizationId,
            patientId: paciente.id,
            category: "SYMPTOM_DIARY",
            title: "QUALIDADE DO SONO",
            targetValue: 8.0,
            unit: "h",
            frequency: "DAILY",
          },
        });
      }

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);

      await prisma.goalCheckin.create({
        data: {
          patientId: paciente.id,
          patientGoalId: sleepGoal.id,
          referenceDate: todayDate,
          recordedValue: horasValor,
          symptomPayload: {
            qualidade: qualidadeStr,
            observacao: observacaoStr,
            origem: "App Mobile do Paciente",
          },
          origin: "PATIENT_ANDROID_APP",
        },
      });
    } catch (metricError) {
      console.warn("[CHECKIN/SONO] Aviso ao sincronizar GoalCheckin:", metricError);
    }

    // 3. Cache Invalidation direcionada e rigorosa do Prontuário do Paciente
    try {
      revalidatePath(`/pacientes/${paciente.id}`);
      revalidatePath('/pacientes/[id]');
      revalidatePath('/dashboard/pacientes');
      revalidatePath(`/api/pacientes/${paciente.id}/metas`);
    } catch (revalidateError) {
      console.warn("[CHECKIN/SONO] Aviso ao revalidar caminhos de cache:", revalidateError);
    }

    return NextResponse.json({
      sucesso: true,
      message: "Check-in de sono registrado com sucesso!",
      checkin: {
        id: checkin.id,
        pacienteId: paciente.id,
        paciente: paciente.fullName,
        horas: checkin.horas,
        horasDormidas: checkin.horas,
        qualidade: checkin.qualidade,
        observacao: checkin.observacao,
        data: checkin.data,
      },
    });
  } catch (error: any) {
    console.error("[CHECKIN/SONO] Erro ao registrar sono:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar check-in de sono.", details: error?.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");

    const whereClause: any = {};
    if (pacienteId) {
      whereClause.pacienteId = pacienteId;
    }

    const checkins = await prisma.checkInSono.findMany({
      where: whereClause,
      orderBy: { data: "desc" },
      take: 20,
      include: {
        paciente: {
          select: { id: true, fullName: true },
        },
      },
    });

    return NextResponse.json({
      sucesso: true,
      total: checkins.length,
      checkins,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Erro ao buscar histórico de sono.", details: error?.message },
      { status: 500 }
    );
  }
}
