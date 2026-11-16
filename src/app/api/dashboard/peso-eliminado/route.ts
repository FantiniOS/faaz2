export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { calcularMetricaPesoEliminado } from "@/lib/metrica-peso-eliminado";

/**
 * GET /api/dashboard/peso-eliminado
 * 
 * Retorna a Quantidade Total de Peso Eliminada pela Clínica FAAZ:
 * - Varre todos os pacientes ativos.
 * - Calcula a diferença entre o peso inicial e o peso atual.
 * - Soma apenas os valores positivos (perda real).
 * - Utiliza cache interno para garantir máxima performance.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    const metrica = await calcularMetricaPesoEliminado({ forceRefresh });

    return NextResponse.json(
      {
        success: true,
        data: metrica,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error: any) {
    console.error("[GET /api/dashboard/peso-eliminado] Erro:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao processar métrica global de peso eliminado.",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
