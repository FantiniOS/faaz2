export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { podeCadastrarPacientes } from "@/lib/auth-rbac";
import { listarMedicosClinica } from "@/lib/medico-responsavel";

/**
 * GET /api/medicos/responsaveis
 * Lista os médicos ativos da clínica (USERS) com especialidade e CRM reais
 * para o seletor de "Médico Responsável" no cadastro/edição de pacientes.
 */
export async function GET() {
  try {
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado para consultar médicos responsáveis." },
        { status: 403 },
      );
    }

    const medicos = await listarMedicosClinica(sessao?.organizationId);

    return NextResponse.json(
      {
        success: true,
        medicos,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error: unknown) {
    console.error("[GET /api/medicos/responsaveis] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao listar médicos responsáveis." },
      { status: 500 },
    );
  }
}
