export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { IsNull } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  BiometricMeasurementEntity,
  MeasurementEntity,
  PatientEntity,
} from "@/lib/db/entities";

const PATIENT_APP_CREATED_BY = "PATIENT_APP_SELF_REPORT";

function parseOptionalMetric(
  raw: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim().replace(",", ".");
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} deve estar entre ${min} e ${max}.`);
  }

  return Math.round(parsed * 100) / 100;
}

/**
 * GET /api/pacientes/[id]/medicoes
 * Retorna as medições biométricas (BIOMETRIC_MEASUREMENTS) e antropométricas/circunferências (MEASUREMENTS)
 * do paciente em ordem estritamente descendente (mais recentes primeiro).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [bioRepo, measurementRepo] = await Promise.all([
      getRepository(BiometricMeasurementEntity),
      getRepository(MeasurementEntity),
    ]);

    const [medicoes, measurementsRows] = await Promise.all([
      bioRepo.find({
        where: { patientId: id },
        order: {
          createdAt: "DESC",
        },
        take: 50,
      }),
      measurementRepo.find({
        where: { patientId: id },
        order: {
          measuredAt: "DESC",
          createdAt: "DESC",
        },
        take: 50,
      }),
    ]);

    const measurements = measurementsRows.map((m) => ({
      id: m.id,
      measuredAt: new Date(m.measuredAt).toISOString(),
      bodyFatPercentage: m.bodyFatPercentage ?? null,
      waist: m.waist ?? null,
      abdomen: m.abdomen ?? null,
      hips: m.hips ?? null,
      rightArm: m.rightArm ?? null,
      leftArm: m.leftArm ?? null,
      rightThigh: m.rightThigh ?? null,
      leftThigh: m.leftThigh ?? null,
      notes: m.notes ?? null,
      createdBy: m.createdBy ?? null,
    }));

    return NextResponse.json(
      {
        sucesso: true,
        total: medicoes.length,
        medicoes,
        measurements,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao buscar medições do paciente.", details },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pacientes/[id]/medicoes
 * Registra circunferências e composição corporal do paciente na tabela MEASUREMENTS (via App Mobile).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 },
      );
    }

    let bodyFatPercentage: number | null;
    let waist: number | null;
    let abdomen: number | null;
    let hips: number | null;
    let rightArm: number | null;
    let leftArm: number | null;
    let rightThigh: number | null;
    let leftThigh: number | null;

    try {
      bodyFatPercentage = parseOptionalMetric(
        body.bodyFatPercentage,
        "% de Gordura Corporal",
        1,
        80,
      );
      waist = parseOptionalMetric(body.waist, "Cintura", 15, 300);
      abdomen = parseOptionalMetric(body.abdomen, "Abdômen", 15, 300);
      hips = parseOptionalMetric(body.hips, "Quadril", 15, 300);
      rightArm = parseOptionalMetric(body.rightArm, "Braço Direito", 8, 120);
      leftArm = parseOptionalMetric(body.leftArm, "Braço Esquerdo", 8, 120);
      rightThigh = parseOptionalMetric(body.rightThigh, "Coxa Direita", 15, 200);
      leftThigh = parseOptionalMetric(body.leftThigh, "Coxa Esquerda", 15, 200);
    } catch (validationErr: unknown) {
      return NextResponse.json(
        {
          error:
            validationErr instanceof Error
              ? validationErr.message
              : "Valores de medidas inválidos.",
        },
        { status: 400 },
      );
    }

    const hasAnyMetric = [
      bodyFatPercentage,
      waist,
      abdomen,
      hips,
      rightArm,
      leftArm,
      rightThigh,
      leftThigh,
    ].some((val) => val !== null);

    if (!hasAnyMetric) {
      return NextResponse.json(
        {
          error:
            "Preencha pelo menos uma medida corporal ou o % de gordura antes de salvar.",
        },
        { status: 400 },
      );
    }

    let notes: string | null = null;
    if (body.notes !== undefined && body.notes !== null) {
      const trimmedNotes = String(body.notes).trim();
      if (trimmedNotes.length > 255) {
        return NextResponse.json(
          { error: "Observação deve ter no máximo 255 caracteres." },
          { status: 400 },
        );
      }
      notes = trimmedNotes || null;
    }

    let measuredAtDate = new Date();
    if (typeof body.measuredAt === "string" && body.measuredAt.trim()) {
      const rawDate = body.measuredAt.trim();
      const candidate = new Date(
        rawDate.includes("T") ? rawDate : `${rawDate}T12:00:00`,
      );
      if (Number.isNaN(candidate.getTime())) {
        return NextResponse.json(
          { error: "Data da medição inválida." },
          { status: 400 },
        );
      }
      measuredAtDate = candidate;
    }

    const [patientRepo, measurementRepo] = await Promise.all([
      getRepository(PatientEntity),
      getRepository(MeasurementEntity),
    ]);

    const paciente = await patientRepo.findOne({
      where: { id, deletedAt: IsNull() },
      select: { id: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const created = await measurementRepo.save(
      measurementRepo.create({
        patientId: paciente.id,
        measuredAt: measuredAtDate,
        bodyFatPercentage,
        waist,
        abdomen,
        hips,
        rightArm,
        leftArm,
        rightThigh,
        leftThigh,
        notes,
        createdBy: PATIENT_APP_CREATED_BY,
      }),
    );

    try {
      revalidatePath(`/pacientes/${id}`);
      revalidatePath("/dashboard/pacientes");
    } catch {
      // ignora revalidação fora do contexto RSC
    }

    return NextResponse.json(
      {
        sucesso: true,
        success: true,
        mensagem: "Medidas corporais registradas com sucesso!",
        measurement: {
          id: created.id,
          measuredAt: new Date(created.measuredAt).toISOString(),
          bodyFatPercentage: created.bodyFatPercentage ?? null,
          waist: created.waist ?? null,
          abdomen: created.abdomen ?? null,
          hips: created.hips ?? null,
          rightArm: created.rightArm ?? null,
          leftArm: created.leftArm ?? null,
          rightThigh: created.rightThigh ?? null,
          leftThigh: created.leftThigh ?? null,
          notes: created.notes ?? null,
          createdBy: created.createdBy ?? null,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[API_PACIENTES_MEDICOES_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro interno ao salvar medidas corporais.", details },
      { status: 500 },
    );
  }
}
