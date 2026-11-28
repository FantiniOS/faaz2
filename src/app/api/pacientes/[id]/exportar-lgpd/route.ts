export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import {
  extrairClientIp,
  gerarPacotePortabilidadePaciente,
  isCorpoClinicoExportacaoAutorizado,
  resolverContextoOrganizacao,
} from "@/lib/exportacao-lgpd";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/exportar-lgpd
 * Gera pacote individual .ZIP de Portabilidade de Dados (LGPD) contendo CSVs filtrados
 * apenas para o paciente + portabilidade_completa.json + LEIA-ME.txt.
 *
 * Acesso estrito ao corpo clínico: DONO_CLINICA, CLINIC_ADMIN, MEDICO, DOCTOR.
 * SECRETARIA / RECEPTIONIST, ADMINISTRADOR e tokens de paciente recebem HTTP 403.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  let pacienteIdLog = "";
  try {
    const { id } = await params;
    pacienteIdLog = (id || "").trim();

    const sessao = await getSessao(req);
    if (!sessao) {
      const hasPatientCreds =
        Boolean(
          req.headers
            .get("authorization")
            ?.trim()
            .toLowerCase()
            .startsWith("bearer "),
        ) || Boolean(req.headers.get("paciente-id")?.trim());
      if (hasPatientCreds) {
        return NextResponse.json(
          {
            error:
              "Acesso negado (Sigilo Médico / LGPD). A exportação da ficha clínica é restrita ao corpo clínico.",
            bloqueado: true,
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "Não autenticado. Faça login clínico para continuar." },
        { status: 401 },
      );
    }

    if (!isCorpoClinicoExportacaoAutorizado(sessao)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado (Sigilo Médico / LGPD). A exportação da ficha clínica do paciente é restrita ao corpo clínico.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    if (!pacienteIdLog) {
      return NextResponse.json(
        { error: "Identificador do paciente inválido." },
        { status: 400 },
      );
    }

    const clinica = await resolverContextoOrganizacao(sessao);
    if (!clinica) {
      return NextResponse.json(
        { error: "Organização não vinculada à sessão autenticada." },
        { status: 403 },
      );
    }

    const clientIp = extrairClientIp(req.headers);
    const userAgent = req.headers.get("user-agent");

    const result = await gerarPacotePortabilidadePaciente({
      clinica,
      sessao,
      pacienteId: pacienteIdLog,
      clientIp,
      userAgent,
    });

    if (result.status === "not_found") {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    if (result.status === "forbidden_org") {
      return NextResponse.json(
        { error: "Acesso negado ao prontuário de outra organização." },
        { status: 403 },
      );
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.buffer.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: unknown) {
    logOracleRouteError("GET /api/pacientes/[id]/exportar-lgpd", error, {
      pacienteId: pacienteIdLog || undefined,
    });
    return NextResponse.json(
      { error: "Erro interno ao gerar o pacote de portabilidade do paciente." },
      { status: 500 },
    );
  }
}
