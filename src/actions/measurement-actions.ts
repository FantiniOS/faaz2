"use server";

import { revalidatePath } from "next/cache";
import { IsNull } from "typeorm";
import { z } from "zod";
import { getRepository } from "@/lib/db/data-source";
import { MeasurementEntity, PatientEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

export interface MeasurementDTO {
  id: string;
  patientId: string;
  measuredAt: string;
  bodyFatPercentage: number | null;
  waist: number | null;
  abdomen: number | null;
  hips: number | null;
  rightArm: number | null;
  leftArm: number | null;
  rightThigh: number | null;
  leftThigh: number | null;
  notes: string | null;
}

export interface SaveMeasurementInput {
  patientId: string;
  measuredAt?: string;
  bodyFatPercentage?: string | number | null;
  waist?: string | number | null;
  abdomen?: string | number | null;
  hips?: string | number | null;
  rightArm?: string | number | null;
  leftArm?: string | number | null;
  rightThigh?: string | number | null;
  leftThigh?: string | number | null;
  notes?: string | null;
}

export interface SaveMeasurementResult {
  success: boolean;
  measurement?: MeasurementDTO;
  error?: string;
}

function parseOptionalFloat(
  raw: string | number | null | undefined,
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

const BaseInputSchema = z.object({
  patientId: z.string().uuid("Identificador do paciente inválido."),
  measuredAt: z.string().optional(),
  notes: z
    .string()
    .max(255, "Observação deve ter no máximo 255 caracteres.")
    .nullable()
    .optional(),
});

export async function saveAnthropometricMeasurement(
  input: SaveMeasurementInput,
): Promise<SaveMeasurementResult> {
  try {
    const sessao = await getSessao();
    if (!sessao) {
      return {
        success: false,
        error: "Sessão expirada. Faça login novamente para salvar medidas.",
      };
    }

    if (!podeAcessarDadosClinicos(sessao.cargo)) {
      return {
        success: false,
        error:
          "Acesso negado. Apenas profissionais clínicos podem registrar medidas antropométricas.",
      };
    }

    const parsedMeta = BaseInputSchema.safeParse({
      patientId: input.patientId,
      measuredAt: input.measuredAt,
      notes: input.notes ?? null,
    });

    if (!parsedMeta.success) {
      return {
        success: false,
        error: parsedMeta.error.issues[0]?.message || "Dados inválidos.",
      };
    }

    const bodyFatPercentage = parseOptionalFloat(
      input.bodyFatPercentage,
      "% de Gordura Corporal",
      1,
      80,
    );
    const waist = parseOptionalFloat(input.waist, "Cintura", 15, 300);
    const abdomen = parseOptionalFloat(input.abdomen, "Abdômen", 15, 300);
    const hips = parseOptionalFloat(input.hips, "Quadril", 15, 300);
    const rightArm = parseOptionalFloat(input.rightArm, "Braço Direito", 8, 120);
    const leftArm = parseOptionalFloat(input.leftArm, "Braço Esquerdo", 8, 120);
    const rightThigh = parseOptionalFloat(input.rightThigh, "Coxa Direita", 15, 200);
    const leftThigh = parseOptionalFloat(input.leftThigh, "Coxa Esquerda", 15, 200);

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
      return {
        success: false,
        error:
          "Preencha pelo menos uma medida corporal ou o % de gordura antes de salvar.",
      };
    }

    const patientRepo = await getRepository(PatientEntity);
    const patient = await patientRepo.findOne({
      where: {
        id: parsedMeta.data.patientId,
        deletedAt: IsNull(),
        ...(sessao.organizationId
          ? { organizationId: sessao.organizationId }
          : {}),
      },
      select: { id: true },
    });

    if (!patient) {
      return {
        success: false,
        error: "Paciente não encontrado para esta clínica.",
      };
    }

    let measuredAtDate = new Date();
    if (parsedMeta.data.measuredAt?.trim()) {
      const candidate = new Date(
        parsedMeta.data.measuredAt.includes("T")
          ? parsedMeta.data.measuredAt
          : `${parsedMeta.data.measuredAt}T12:00:00`,
      );
      if (!Number.isNaN(candidate.getTime())) {
        measuredAtDate = candidate;
      }
    }

    const measurementRepo = await getRepository(MeasurementEntity);
    const created = await measurementRepo.save(
      measurementRepo.create({
        patientId: patient.id,
        measuredAt: measuredAtDate,
        bodyFatPercentage,
        waist,
        abdomen,
        hips,
        rightArm,
        leftArm,
        rightThigh,
        leftThigh,
        notes: parsedMeta.data.notes?.trim() || null,
        createdBy: sessao.userId,
      }),
    );

    revalidatePath("/dashboard/pacientes");

    return {
      success: true,
      measurement: {
        id: created.id,
        patientId: created.patientId,
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
      },
    };
  } catch (err: unknown) {
    console.error("[MEASUREMENT/ACTION] Erro ao salvar medida:", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Erro inesperado ao salvar medidas antropométricas.",
    };
  }
}
