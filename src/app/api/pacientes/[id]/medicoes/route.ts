export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/pacientes/[id]/medicoes
 * Retorna as medições biométricas do paciente em ordem estritamente descendente (mais recentes primeiro)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const medicoes = await prisma.biometricMeasurement.findMany({
      where: { patientId: id },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return NextResponse.json({
      sucesso: true,
      total: medicoes.length,
      medicoes,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Erro ao buscar medições do paciente.", details: error?.message },
      { status: 500 }
    );
  }
}
