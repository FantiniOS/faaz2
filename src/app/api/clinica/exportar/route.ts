export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import {
  extrairClientIp,
  gerarPacoteExportacaoClinica,
  isDiretoriaExportacaoAutorizada,
  resolverContextoOrganizacao,
  validarCategoriasExportacao,
  validarPeriodoExportacao,
} from "@/lib/exportacao-lgpd";

/**
 * POST /api/clinica/exportar
 * Gera e entrega um pacote .ZIP em memória com arquivos .CSV (UTF-8 BOM, separador `;`)
 * compatíveis com Excel PT-BR + LEIA-ME.txt.
 *
 * Acesso estrito: SOMENTE DONO_CLINICA / CLINIC_ADMIN (Diretoria Clínica).
 */
export async function POST(req: NextRequest) {
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

    const rawBody = await req.json().catch(() => ({}));
    const body =
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {};

    const catResult = validarCategoriasExportacao(body.categorias);
    if (!catResult.ok) {
      return NextResponse.json({ error: catResult.error }, { status: 400 });
    }

    const periodoResult = validarPeriodoExportacao(
      body.dataInicio,
      body.dataFim,
    );
    if (!periodoResult.ok) {
      return NextResponse.json({ error: periodoResult.error }, { status: 400 });
    }

    const clientIp = extrairClientIp(req.headers);
    const userAgent = req.headers.get("user-agent");

    const { buffer, filename } = await gerarPacoteExportacaoClinica({
      clinica,
      sessao,
      categorias: catResult.categorias,
      periodo: periodoResult.periodo,
      clientIp,
      userAgent,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: unknown) {
    logOracleRouteError("POST /api/clinica/exportar", error);
    return NextResponse.json(
      { error: "Erro interno ao gerar o pacote de exportação da clínica." },
      { status: 500 },
    );
  }
}
