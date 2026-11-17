export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db/data-source";
import { BiometricMeasurementEntity } from "@/lib/db/entities";

/**
 * GET /api/pacientes/[id]/medicoes
 * Retorna as medições biométricas do paciente em ordem estritamente descendente (mais recentes primeiro)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const bioRepo = await getRepository(BiometricMeasurementEntity);
    const medicoes = await bioRepo.find({
      where: { patientId: id },
      order: {
        createdAt: "DESC",
      },
      take: 50,
    });

    return NextResponse.json({
      sucesso: true,
      total: medicoes.length,
      medicoes,
    });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao buscar medições do paciente.", details },
      { status: 500 },
    );
  }
}
