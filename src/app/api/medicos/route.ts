export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { listarMedicosClinica } from "@/lib/medico-responsavel";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import { gerarCodigoEspecialidadeLegado } from "@/lib/especialidades-clinica";

/**
 * GET /api/medicos
 * Retorna EXCLUSIVAMENTE os profissionais clínicos ativos (MEDICO e DONO_CLINICA)
 * cadastrados em Configurações & Gestão da Equipe (USERS).
 *
 * Aceita filtro opcional `?especialidadeId=<uuid>` ou `?especialidade=<codigoLegado>`.
 * Nunca usa seed/mock de médicos fictícios nem lê registros órfãos da tabela legada MEDICOS.
 */
export async function GET(request: NextRequest) {
  try {
    const sessao = await getSessao(request);
    const { searchParams } = new URL(request.url);
    const especialidadeIdParam = searchParams.get("especialidadeId")?.trim();
    const especialidadeParam = searchParams
      .get("especialidade")
      ?.trim()
      .toUpperCase();

    const todosAtivos = await listarMedicosClinica(sessao?.organizationId);

    const medicosFiltrados = especialidadeIdParam
      ? todosAtivos.filter((m) => m.especialidadeId === especialidadeIdParam)
      : especialidadeParam && especialidadeParam !== "TODAS"
        ? todosAtivos.filter(
            (m) =>
              m.especialidadeCodigo === especialidadeParam ||
              gerarCodigoEspecialidadeLegado(m.especialidadeNome) ===
                especialidadeParam,
          )
        : todosAtivos;

    const medicos = medicosFiltrados.map((m) => ({
      id: m.id,
      nome: m.nome,
      especialidade: m.especialidade,
      especialidadeId: m.especialidadeId ?? null,
      especialidadeNome: m.especialidadeNome ?? null,
      especialidadeCor: m.especialidadeCor ?? "emerald",
      especialidadeCodigo: m.especialidadeCodigo ?? null,
      subespecialidade: m.subespecialidade ?? null,
      crm: m.crm,
      corHex: m.corHex || "#059669",
    }));

    return NextResponse.json(
      {
        success: true,
        medicos,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    logOracleRouteError("GET /api/medicos", error);
    return NextResponse.json(
      { success: false, error: "Erro ao listar médicos ativos da equipe." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/medicos
 * Desativado para evitar cadastros órfãos fora de Configurações & Gestão da Equipe.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Cadastre profissionais médicos exclusivamente em Configurações & Gestão da Equipe (/api/equipe).",
    },
    { status: 400 },
  );
}
