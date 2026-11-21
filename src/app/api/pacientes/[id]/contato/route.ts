export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { withRepositoryRetry } from "@/lib/db/data-source";
import { PatientEntity } from "@/lib/db/entities";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") || "*";
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, paciente-id",
    "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * Normaliza e valida telefone brasileiro (10 ou 11 dígitos com DDD)
 * no mesmo formato padrão do cadastro Web: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX.
 */
function normalizarTelefoneBR(raw: unknown): {
  valid: boolean;
  formatted: string;
} {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { valid: false, formatted: "" };
  }
  let digits = String(raw).replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return {
      valid: true,
      formatted: `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`,
    };
  }
  if (digits.length === 10) {
    return {
      valid: true,
      formatted: `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`,
    };
  }
  return { valid: false, formatted: "" };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req),
  });
}

/**
 * PATCH /api/pacientes/[id]/contato
 * Rota dedicada e estritamente restrita para o paciente atualizar APENAS
 * o próprio WhatsApp/telefone (PHONE_WHATSAPP) e e-mail (EMAIL).
 * Qualquer outro campo enviado no body (nome, cpf, status, medico, etc.) é descartado.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Corpo da requisição inválido." },
        { status: 400, headers },
      );
    }

    // Extrai EXCLUSIVAMENTE telefone e email — descarta qualquer outro campo
    const hasTelefone = Object.prototype.hasOwnProperty.call(body, "telefone");
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");

    if (!hasTelefone && !hasEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Informe ao menos o telefone/WhatsApp ou o e-mail para atualizar.",
        },
        { status: 400, headers },
      );
    }

    let nextTelefone: string | undefined = undefined;
    if (hasTelefone) {
      const telCheck = normalizarTelefoneBR(
        (body as { telefone?: unknown }).telefone,
      );
      if (!telCheck.valid) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Informe um número de WhatsApp/telefone válido com DDD (10 ou 11 dígitos).",
          },
          { status: 400, headers },
        );
      }
      nextTelefone = telCheck.formatted;
    }

    let nextEmail: string | null | undefined = undefined;
    if (hasEmail) {
      const rawEmail = (body as { email?: unknown }).email;
      if (rawEmail === null || rawEmail === "") {
        nextEmail = null;
      } else if (typeof rawEmail === "string") {
        const cleanEmail = rawEmail.trim().toLowerCase();
        if (!cleanEmail) {
          nextEmail = null;
        } else if (cleanEmail.length > 160 || !EMAIL_REGEX.test(cleanEmail)) {
          return NextResponse.json(
            {
              success: false,
              error: "Informe um endereço de e-mail válido.",
            },
            { status: 400, headers },
          );
        } else {
          nextEmail = cleanEmail;
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "Informe um endereço de e-mail válido.",
          },
          { status: 400, headers },
        );
      }
    }

    // Localiza paciente com projeção mínima (sem CLOBs) e valida status ativo
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
            phoneWhatsapp: true,
            email: true,
          },
        }),
      { label: "paciente-contato:find" },
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
            "Seu cadastro não está ativo no momento. Entre em contato com a recepção da Clínica FAAZ.",
        },
        { status: 403, headers },
      );
    }

    // Trava adicional: se o header paciente-id foi enviado pelo App Mobile, deve coincidir com o paciente alvo
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

    const finalTelefone =
      nextTelefone !== undefined ? nextTelefone : paciente.phoneWhatsapp || "";
    const finalEmail =
      nextEmail !== undefined ? nextEmail : paciente.email ?? null;

    // UPDATE direto em 1 query leve (apenas PHONE_WHATSAPP, EMAIL e UPDATED_AT)
    await withRepositoryRetry(
      PatientEntity,
      (repo) =>
        repo.update(
          { id: paciente.id },
          {
            ...(nextTelefone !== undefined
              ? { phoneWhatsapp: nextTelefone }
              : {}),
            ...(nextEmail !== undefined ? { email: nextEmail } : {}),
            updatedAt: new Date(),
          },
        ),
      { label: "paciente-contato:update" },
    );

    return NextResponse.json(
      {
        success: true,
        telefone: finalTelefone,
        email: finalEmail,
      },
      { status: 200, headers },
    );
  } catch (error: unknown) {
    console.error("[API_PACIENTE_CONTATO_PATCH_ERROR]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Não foi possível atualizar seus dados de contato.",
      },
      { status: 500, headers },
    );
  }
}
