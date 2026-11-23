export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { listarMedicosClinica } from "@/lib/medico-responsavel";
import { ESPECIALIDADES_AGENDA_VALIDAS } from "@/lib/especialidades-clinica";

/**
 * GET /api/medicos
 * Retorna EXCLUSIVAMENTE os profissionais clínicos ativos (MEDICO e DONO_CLINICA)
 * cadastrados em Configurações & Gestão da Equipe (USERS).
 *
 * Aceita filtro opcional `?especialidade=ENDOCRINOLOGIA|CIRURGIA_PLASTICA`.
 * Nunca usa seed/mock de médicos fictícios nem lê registros órfãos da tabela legada MEDICOS.
 */
export async function GET(request: NextRequest) {
  try {
    const sessao = await getSessao(request);
    const { searchParams } = new URL(request.url);
    const especialidadeParam = searchParams
      .get("especialidade")
      ?.trim()
      .toUpperCase();

    const todosAtivos = await listarMedicosClinica(sessao?.organizationId);

    const medicosFiltrados =
      especialidadeParam &&
      (ESPECIALIDADES_AGENDA_VALIDAS as readonly string[]).includes(
        especialidadeParam,
      )
        ? todosAtivos.filter(
            (m) => m.especialidadeCodigo === especialidadeParam,
          )
        : todosAtivos;

    const medicos = medicosFiltrados.map((m) => ({
      id: m.id,
      nome: m.nome,
      especialidade: m.especialidade,
      especialidadeCodigo: m.especialidadeCodigo ?? null,
      especialidadePrincipal: m.especialidadePrincipal ?? null,
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
    console.error("[GET /api/medicos] Erro:", error);
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
