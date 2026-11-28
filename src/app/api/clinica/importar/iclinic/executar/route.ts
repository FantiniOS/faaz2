export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import {
  extrairClientIp,
  isDiretoriaExportacaoAutorizada,
  resolverContextoOrganizacao,
} from "@/lib/exportacao-lgpd";
import {
  ImportacaoValidationError,
  executarImportacaoIClinic,
  type UploadedFileInput,
} from "@/lib/importacao-iclinic";
import {
  LIMITE_UPLOAD_ICLINIC_BYTES,
  type ModoDuplicadosImportacao,
} from "@/lib/importacao-iclinic-types";

/**
 * POST /api/clinica/importar/iclinic/executar
 * Execução transacional e idempotente da importação padrão iClinic.
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
            "Acesso negado (RBAC). A importação de dados do iClinic é restrita à Diretoria Clínica.",
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

    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > LIMITE_UPLOAD_ICLINIC_BYTES + 1024 * 1024) {
      return NextResponse.json(
        { error: "O tamanho do envio excede o limite de segurança de 25 MB." },
        { status: 413 },
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            "Envio inválido. Utilize multipart/form-data com os arquivos e parâmetros.",
        },
        { status: 400 },
      );
    }

    const files: UploadedFileInput[] = [];
    let totalBytes = 0;

    for (const entry of formData.values()) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "arrayBuffer" in entry &&
        "name" in entry
      ) {
        const f = entry as File;
        if (f.size <= 0) continue;
        totalBytes += f.size;
        if (totalBytes > LIMITE_UPLOAD_ICLINIC_BYTES) {
          return NextResponse.json(
            { error: "O tamanho total dos arquivos excede o limite de 25 MB." },
            { status: 413 },
          );
        }
        const ab = await f.arrayBuffer();
        files.push({
          name: f.name,
          size: f.size,
          buffer: Buffer.from(ab),
        });
      }
    }

    const rawMapeamento = formData.get("mapeamentoMedicos");
    const mapeamentoMedicos: Record<string, string> = {};
    if (typeof rawMapeamento === "string" && rawMapeamento.trim()) {
      try {
        const parsed = JSON.parse(rawMapeamento);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(
            parsed as Record<string, unknown>,
          )) {
            if (typeof v === "string" && v.trim()) {
              mapeamentoMedicos[k.trim()] = v.trim();
            }
          }
        }
      } catch {
        return NextResponse.json(
          { error: "Formato inválido em 'mapeamentoMedicos'." },
          { status: 400 },
        );
      }
    }

    const rawMedicoPadrao = formData.get("medicoPadraoId");
    const medicoPadraoId =
      typeof rawMedicoPadrao === "string" ? rawMedicoPadrao.trim() : "";

    const rawModo = formData.get("modoDuplicados");
    const modoDuplicados: ModoDuplicadosImportacao =
      rawModo === "atualizar_vazios" ? "atualizar_vazios" : "ignorar";

    const clientIp = extrairClientIp(req.headers);
    const userAgent = req.headers.get("user-agent");

    const relatorio = await executarImportacaoIClinic({
      clinica,
      sessao,
      files,
      mapeamentoMedicos,
      medicoPadraoId,
      modoDuplicados,
      clientIp,
      userAgent,
    });

    return NextResponse.json(relatorio, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: unknown) {
    if (error instanceof ImportacaoValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    logOracleRouteError("POST /api/clinica/importar/iclinic/executar", error);
    return NextResponse.json(
      { error: "Erro interno ao executar a importação dos dados do iClinic." },
      { status: 500 },
    );
  }
}
