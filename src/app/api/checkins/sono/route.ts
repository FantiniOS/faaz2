export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { IsNull, Raw } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckInSonoEntity,
  GoalCheckinEntity,
  PatientEntity,
  PatientGoalEntity,
} from "@/lib/db/entities";

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

    const horasValor =
      parseFloat(String(horas !== undefined ? horas : horasDormidas)) || 8.0;
    const qualidadeStr = String(qualidade || "BOM").toUpperCase();
    const observacaoStr = observacao
      ? String(observacao).trim().toUpperCase()
      : null;

    const patientRepo = await getRepository(PatientEntity);
    const sonoRepo = await getRepository(CheckInSonoEntity);

    let targetPatientId = pacienteId;
    if (!targetPatientId) {
      const primeiro = await patientRepo.findOne({
        where: { deletedAt: IsNull() },
        select: { id: true, organizationId: true },
      });
      if (primeiro) {
        targetPatientId = primeiro.id;
      }
    }

    if (!targetPatientId) {
      return NextResponse.json(
        { error: "Paciente não identificado para o registro." },
        { status: 400 },
      );
    }

    const paciente = await patientRepo.findOne({
      where: { id: targetPatientId },
      select: { id: true, organizationId: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado no sistema." },
        { status: 404 },
      );
    }

    const checkin = await sonoRepo.save(
      sonoRepo.create({
        pacienteId: paciente.id,
        horas: horasValor,
        qualidade: qualidadeStr,
        observacao: observacaoStr,
      }),
    );

    try {
      const goalRepo = await getRepository(PatientGoalEntity);
      const goalCheckinRepo = await getRepository(GoalCheckinEntity);

      let sleepGoal = await goalRepo.findOne({
        where: {
          patientId: paciente.id,
          category: "SYMPTOM_DIARY",
          title: Raw((alias) => `LOWER(${alias}) LIKE :t`, { t: "%sono%" }),
        },
      });

      if (!sleepGoal) {
        sleepGoal = await goalRepo.save(
          goalRepo.create({
            organizationId: paciente.organizationId,
            patientId: paciente.id,
            category: "SYMPTOM_DIARY",
            title: "QUALIDADE DO SONO",
            targetValue: 8.0,
            unit: "h",
            frequency: "DAILY",
            isEnabledInApp: true,
            status: "ACTIVE",
          }),
        );
      }

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);

      await goalCheckinRepo.save(
        goalCheckinRepo.create({
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
        }),
      );
    } catch (metricError) {
      console.warn(
        "[CHECKIN/SONO] Aviso ao sincronizar GoalCheckin:",
        metricError,
      );
    }

    try {
      revalidatePath(`/pacientes/${paciente.id}`);
      revalidatePath("/pacientes/[id]");
      revalidatePath("/dashboard/pacientes");
      revalidatePath(`/api/pacientes/${paciente.id}/metas`);
    } catch (revalidateError) {
      console.warn(
        "[CHECKIN/SONO] Aviso ao revalidar caminhos de cache:",
        revalidateError,
      );
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
  } catch (error: unknown) {
    console.error("[CHECKIN/SONO] Erro ao registrar sono:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro interno ao processar check-in de sono.", details },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");

    const sonoRepo = await getRepository(CheckInSonoEntity);
    const checkins = await sonoRepo.find({
      where: pacienteId ? { pacienteId } : {},
      order: { data: "DESC" },
      take: 20,
      relations: { paciente: true },
      select: {
        id: true,
        pacienteId: true,
        horas: true,
        qualidade: true,
        observacao: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        paciente: {
          id: true,
          fullName: true,
        },
      },
    });

    return NextResponse.json({
      sucesso: true,
      total: checkins.length,
      checkins,
    });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao buscar histórico de sono.", details },
      { status: 500 },
    );
  }
}
