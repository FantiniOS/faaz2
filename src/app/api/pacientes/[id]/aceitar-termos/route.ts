export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { withRepositoryRetry } from "@/lib/db/data-source";
import { PatientEntity } from "@/lib/db/entities";
import { toIsoUtc } from "@/lib/date-br";
import { VERSAO_ATUAL_TERMOS } from "@/lib/termos-privacidade";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, paciente-id",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req),
  });
}

/**
 * POST /api/pacientes/[id]/aceitar-termos
 * Registra o aceite único da versão vigente dos Termos de Uso e Privacidade (LGPD/CFM).
 * Executa 1 UPDATE leve em PATIENTS (TERMOS_VERSAO_ACEITA e TERMOS_ACEITO_EM = CURRENT_TIMESTAMP).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const headers = buildCorsHeaders(req);

  try {
    const { id } = await params;
    const rawId = decodeURIComponent(id || "").trim();

    if (!rawId) {
      return NextResponse.json(
        { success: false, error: "ID do paciente é obrigatório." },
        { status: 400, headers },
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawVersao =
      body && typeof body === "object" && "versao" in body
        ? String((body as { versao?: unknown }).versao ?? "").trim()
        : VERSAO_ATUAL_TERMOS;

    const versao = rawVersao || VERSAO_ATUAL_TERMOS;
    if (versao !== VERSAO_ATUAL_TERMOS) {
      return NextResponse.json(
        {
          success: false,
          error: `Versão de termos inválida. Versão vigente: ${VERSAO_ATUAL_TERMOS}.`,
          versaoAtualTermos: VERSAO_ATUAL_TERMOS,
        },
        { status: 400, headers },
      );
    }

    const cleanDigitsId = rawId.replace(/\D/g, "");
    const paciente = await withRepositoryRetry(
      PatientEntity,
      (repo) =>
        repo.findOne({
          where: UUID_REGEX.test(rawId)
            ? { id: rawId, deletedAt: IsNull() }
            : [
                { recordCode: rawId, deletedAt: IsNull() },
                ...(cleanDigitsId.length > 0
                  ? [
                      { cpf: cleanDigitsId, deletedAt: IsNull() },
                      { cpf: rawId, deletedAt: IsNull() },
                    ]
                  : []),
              ],
          select: {
            id: true,
            patientStatus: true,
          },
        }),
      { label: "aceitar-termos:find-paciente" },
    );

    if (!paciente) {
      return NextResponse.json(
        { success: false, error: "Paciente não encontrado." },
        { status: 404, headers },
      );
    }

    if (paciente.patientStatus !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Seu cadastro não está ativo. Entre em contato com a recepção da Clínica FAAZ.",
        },
        { status: 403, headers },
      );
    }

    const headerPacienteId = req.headers.get("paciente-id")?.trim();
    if (headerPacienteId && headerPacienteId !== paciente.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Operação não autorizada para este cadastro.",
        },
        { status: 403, headers },
      );
    }

    const aceitoAgora = new Date();

    // 1 UPDATE leve direto em PATIENTS gravando CURRENT_TIMESTAMP no Oracle ADB
    await withRepositoryRetry(
      PatientEntity,
      (repo) =>
        repo
          .createQueryBuilder()
          .update(PatientEntity)
          .set({
            termosVersaoAceita: versao,
            termosAceitoEm: () => "CURRENT_TIMESTAMP",
            updatedAt: () => "CURRENT_TIMESTAMP",
          })
          .where("ID = :id", { id: paciente.id })
          .execute(),
      { label: "aceitar-termos:update" },
    );

    const aceitoEmIso = toIsoUtc(aceitoAgora) || aceitoAgora.toISOString();

    return NextResponse.json(
      {
        success: true,
        versao,
        aceitoEm: aceitoEmIso,
      },
      { status: 200, headers },
    );
  } catch (error: unknown) {
    console.error("[API_ACEITAR_TERMOS_POST_ERROR]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Não foi possível registrar o aceite dos termos.",
      },
      { status: 500, headers },
    );
  }
}
