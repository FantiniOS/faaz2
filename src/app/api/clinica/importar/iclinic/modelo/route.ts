export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import { isDiretoriaExportacaoAutorizada } from "@/lib/exportacao-lgpd";
import { gerarPacoteModeloIClinic } from "@/lib/importacao-iclinic";

/**
 * GET /api/clinica/importar/iclinic/modelo
 * Gera em memória um pacote .zip de demonstração no formato oficial iClinic
 * (patient.csv, event_record.csv, event_scheduling.csv, event_attachment.csv).
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
            "Acesso negado (RBAC). O download do pacote modelo de importação é restrito à Diretoria Clínica.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    const buffer = await gerarPacoteModeloIClinic();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="modelo_teste_iclinic.zip"',
        "Content-Length": String(buffer.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: unknown) {
    logOracleRouteError("GET /api/clinica/importar/iclinic/modelo", error);
    return NextResponse.json(
      { error: "Erro interno ao gerar pacote de exemplo iClinic." },
      { status: 500 },
    );
  }
}
