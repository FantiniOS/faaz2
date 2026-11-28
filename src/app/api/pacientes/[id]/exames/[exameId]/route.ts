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
  params: Promise<{ id: string; exameId: string }>;
}

/**
 * PUT /api/pacientes/[id]/exames/[exameId]
 * Atualiza um lote existente de exames laboratoriais do paciente.
 * Sigilo médico estrito: SOMENTE DONO_CLINICA, CLINIC_ADMIN, MEDICO e DOCTOR.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  let pacienteIdLog = "";
  let exameIdLog = "";
  try {
    const { id, exameId } = await params;
    pacienteIdLog = id;
    exameIdLog = exameId;

    const sessao = await getSessao(req);
    if (!sessao) {
      if (hasPatientAuthCredentials(req)) {
        return NextResponse.json(
          {
            error:
              "Acesso negado (Sigilo Médico). Apenas o corpo clínico pode alterar exames laboratoriais.",
            bloqueado: true,
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "Não autenticado. Faça login para editar exames." },
        { status: 401 },
      );
    }

    if (!isCorpoClinicoExamesAutorizado(sessao)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado (Sigilo Médico). Apenas médicos podem alterar exames laboratoriais.",
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
            select: { id: true, organizationId: true, deletedAt: true },
          }),
        { label: "exames:put-paciente" },
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

    const repo = await getRepository(ExameLaboratorialEntity);
    const existing = await repo.findOne({
      where: {
        id: exameId,
        pacienteId: paciente.id,
        organizacaoId: paciente.organizationId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Lote de exames não encontrado para este paciente." },
        { status: 404 },
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
            "O lote precisa conter ao menos um exame, laudo ou observação.",
        },
        { status: 400 },
      );
    }

    existing.dataColeta = payload.dataColeta;
    existing.laboratorio = payload.laboratorio;
    existing.valores = payload.valores;
    existing.examesPersonalizados = payload.examesPersonalizados;
    existing.laudosImagem = payload.laudosImagem;
    existing.observacoes = payload.observacoes;

    const saved = await repo.save(existing);

    return NextResponse.json({
      success: true,
      exame: serializeExame(saved),
    });
  } catch (error: unknown) {
    logOracleRouteError("PUT /api/pacientes/[id]/exames/[exameId]", error, {
      pacienteId: pacienteIdLog || undefined,
      exameId: exameIdLog || undefined,
    });
    return NextResponse.json(
      { error: "Erro ao atualizar lote de exames laboratoriais." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pacientes/[id]/exames/[exameId]
 * Exclui um lote de exames laboratoriais do paciente.
 * Sigilo médico estrito: SOMENTE DONO_CLINICA, CLINIC_ADMIN, MEDICO e DOCTOR.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  let pacienteIdLog = "";
  let exameIdLog = "";
  try {
    const { id, exameId } = await params;
    pacienteIdLog = id;
    exameIdLog = exameId;

    const sessao = await getSessao(req);
    if (!sessao) {
      if (hasPatientAuthCredentials(req)) {
        return NextResponse.json(
          {
            error:
              "Acesso negado (Sigilo Médico). Apenas o corpo clínico pode excluir exames laboratoriais.",
            bloqueado: true,
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "Não autenticado. Faça login para excluir exames." },
        { status: 401 },
      );
    }

    if (!isCorpoClinicoExamesAutorizado(sessao)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado (Sigilo Médico). Apenas médicos podem excluir exames laboratoriais.",
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
            select: { id: true, organizationId: true, deletedAt: true },
          }),
        { label: "exames:del-paciente" },
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

    const repo = await getRepository(ExameLaboratorialEntity);
    const existing = await repo.findOne({
      where: {
        id: exameId,
        pacienteId: paciente.id,
        organizacaoId: paciente.organizationId,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Lote de exames não encontrado para este paciente." },
        { status: 404 },
      );
    }

    await repo.delete({
      id: exameId,
      pacienteId: paciente.id,
      organizacaoId: paciente.organizationId,
    });

    return NextResponse.json({
      success: true,
      deletedId: exameId,
    });
  } catch (error: unknown) {
    logOracleRouteError("DELETE /api/pacientes/[id]/exames/[exameId]", error, {
      pacienteId: pacienteIdLog || undefined,
      exameId: exameIdLog || undefined,
    });
    return NextResponse.json(
      { error: "Erro ao excluir lote de exames laboratoriais." },
      { status: 500 },
    );
  }
}
