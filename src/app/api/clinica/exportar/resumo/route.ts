export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import {
  isDiretoriaExportacaoAutorizada,
  obterResumoExportacaoClinica,
  resolverContextoOrganizacao,
} from "@/lib/exportacao-lgpd";

/**
 * GET /api/clinica/exportar/resumo
 * Retorna contagens leves por categoria na organização autenticada.
 * Acesso estrito: SOMENTE DONO_CLINICA / CLINIC_ADMIN (Diretoria Clínica).
 */
export async function GET(req: NextRequest) {
  try {
    const sessao = await getSessao(req);
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado. Faça login para continuar." },
        { status: 401 },
      );
    }

    if (!isDiretoriaExportacaoAutorizada(sessao)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado (RBAC). A exportação completa de dados da clínica é restrita à Diretoria Clínica.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    const clinica = await resolverContextoOrganizacao(sessao);
    if (!clinica) {
      return NextResponse.json(
        { error: "Organização não vinculada à sessão autenticada." },
        { status: 403 },
      );
    }

    const contagens = await obterResumoExportacaoClinica(clinica.organizationId);
    const totalRegistros = Object.values(contagens).reduce(
      (acc, n) => acc + (Number.isFinite(n) ? n : 0),
      0,
    );

    return NextResponse.json(
      {
        sucesso: true,
        clinicaNome: clinica.clinicaNome,
        contagens,
        totalRegistros,
        atualizadoEm: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error: unknown) {
    logOracleRouteError("GET /api/clinica/exportar/resumo", error);
    return NextResponse.json(
      { error: "Erro interno ao consultar o resumo de exportação da clínica." },
      { status: 500 },
    );
  }
}
