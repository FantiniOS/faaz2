export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import { ensureExamesLaboratoriaisSchema } from "@/lib/db/exames-bootstrap";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import { ExameLaboratorialEntity, PatientEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import {
  hasPatientAuthCredentials,
  isCorpoClinicoExamesAutorizado,
  resolverOrganizacaoSessao,
  sanitizeExamePayload,
  serializeExame,
} from "@/lib/exames-api-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/exames
 * Lista todos os lotes de exames laboratoriais e laudos do paciente (ordenados por DATA_COLETA DESC).
 * Sigilo médico estrito: SOMENTE DONO_CLINICA, CLINIC_ADMIN, MEDICO e DOCTOR.
 * Recepção/Secretária, Administradores e tokens de paciente recebem HTTP 403.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  let pacienteIdLog = "";
  try {
    const { id } = await params;
    pacienteIdLog = id;

    const sessao = await getSessao(req);
    if (!sessao) {
      if (hasPatientAuthCredentials(req)) {
        return NextResponse.json(
          {
            error:
              "Acesso negado (Sigilo Médico). Exames laboratoriais são restritos ao painel do corpo clínico.",
            bloqueado: true,
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "Não autenticado. Faça login para acessar exames laboratoriais." },
        { status: 401 },
      );
    }

    if (!isCorpoClinicoExamesAutorizado(sessao)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado (Sigilo Médico). Exames laboratoriais são restritos ao corpo clínico.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    await ensureExamesLaboratoriaisSchema();

    const [paciente, sessaoOrgId] = await Promise.all([
      withRepositoryRetry(
        PatientEntity,
        (repo) =>
          repo.findOne({
            where: { id },
            select: {
              id: true,
              organizationId: true,
              deletedAt: true,
            },
          }),
        { label: "exames:get-paciente" },
      ),
      resolverOrganizacaoSessao(sessao),
    ]);

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    if (sessaoOrgId && paciente.organizationId !== sessaoOrgId) {
      return NextResponse.json(
        { error: "Acesso negado ao prontuário de outra organização." },
        { status: 403 },
      );
    }

    const lotes = await withRepositoryRetry(
      ExameLaboratorialEntity,
      (repo) =>
        repo.find({
          where: {
            pacienteId: paciente.id,
            organizacaoId: paciente.organizationId,
          },
          order: { dataColeta: "DESC", createdAt: "DESC" },
        }),
      { label: "exames:list" },
    );

    return NextResponse.json(
      {
        success: true,
        exames: lotes.map(serializeExame),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error: unknown) {
    logOracleRouteError("GET /api/pacientes/[id]/exames", error, {
      pacienteId: pacienteIdLog || undefined,
    });
    return NextResponse.json(
      { error: "Erro ao carregar exames laboratoriais do paciente." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pacientes/[id]/exames
 * Registra um novo lote de exames laboratoriais / laudos de imagem.
 * Sigilo médico estrito: SOMENTE DONO_CLINICA, CLINIC_ADMIN, MEDICO e DOCTOR.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  let pacienteIdLog = "";
  try {
    const { id } = await params;
    pacienteIdLog = id;

    const sessao = await getSessao(req);
    if (!sessao) {
      if (hasPatientAuthCredentials(req)) {
        return NextResponse.json(
          {
            error:
              "Acesso negado (Sigilo Médico). Apenas o corpo clínico pode registrar exames laboratoriais.",
            bloqueado: true,
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "Não autenticado. Faça login para registrar exames." },
        { status: 401 },
      );
    }

    if (!isCorpoClinicoExamesAutorizado(sessao)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado (Sigilo Médico). Apenas médicos podem registrar exames laboratoriais.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    await ensureExamesLaboratoriaisSchema();

    const [paciente, sessaoOrgId] = await Promise.all([
      withRepositoryRetry(
        PatientEntity,
        (repo) =>
          repo.findOne({
            where: { id },
            select: {
              id: true,
              organizationId: true,
              deletedAt: true,
            },
          }),
        { label: "exames:post-paciente" },
      ),
      resolverOrganizacaoSessao(sessao),
    ]);

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    if (sessaoOrgId && paciente.organizationId !== sessaoOrgId) {
      return NextResponse.json(
        { error: "Acesso negado ao prontuário de outra organização." },
        { status: 403 },
      );
    }

    const rawBody = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 },
      );
    }

    const payload = sanitizeExamePayload(rawBody);
    if (!payload.dataColeta) {
      return NextResponse.json(
        { error: "Informe uma data de coleta válida (YYYY-MM-DD)." },
        { status: 400 },
      );
    }

    const hasAnyContent =
      Object.keys(payload.valores).length > 0 ||
      payload.examesPersonalizados.length > 0 ||
      Object.keys(payload.laudosImagem).length > 0 ||
      Boolean(payload.observacoes);

    if (!hasAnyContent) {
      return NextResponse.json(
        {
          error:
            "Adicione ao menos um exame laboratorial, exame personalizado, laudo ou observação antes de salvar.",
        },
        { status: 400 },
      );
    }

    const repo = await getRepository(ExameLaboratorialEntity);
    const created = repo.create({
      organizacaoId: paciente.organizationId,
      pacienteId: paciente.id,
      medicoId: sessao.userId || null,
      dataColeta: payload.dataColeta,
      laboratorio: payload.laboratorio,
      valores: payload.valores,
      examesPersonalizados: payload.examesPersonalizados,
      laudosImagem: payload.laudosImagem,
      observacoes: payload.observacoes,
    });

    const saved = await repo.save(created);

    return NextResponse.json(
      {
        success: true,
        exame: serializeExame(saved),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    logOracleRouteError("POST /api/pacientes/[id]/exames", error, {
      pacienteId: pacienteIdLog || undefined,
    });
    return NextResponse.json(
      { error: "Erro ao salvar lote de exames laboratoriais." },
      { status: 500 },
    );
  }
}
