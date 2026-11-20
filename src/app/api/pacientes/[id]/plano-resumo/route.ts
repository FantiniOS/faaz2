export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import {
  runWithConcurrency,
  withRepositoryRetry,
} from "@/lib/db/data-source";
import {
  ConsultaPacoteEntity,
  PacoteAcompanhamentoEntity,
  PatientEntity,
  type ConsultaPacote,
  type PacoteAcompanhamento,
  type Patient,
} from "@/lib/db/entities";
import { getDataDiaBR } from "@/lib/date-br";
import { consultaDescontaSaldo, diffDiasIso } from "@/lib/pacotes-faaz";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/plano-resumo
 * Endpoint estritamente somente leitura e higienizado para a aba "Clínica" do App Mobile.
 * Nunca expõe observações administrativas internas nem CREATED_BY.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const loaded = {
      paciente: null as Patient | null,
      pacotes: [] as PacoteAcompanhamento[],
    };

    // Onda 1: 2 queries leves com projeção estrita (sem CLOBs)
    await runWithConcurrency(
      [
        async () => {
          loaded.paciente = await withRepositoryRetry(
            PatientEntity,
            (repo) =>
              repo.findOne({
                where: { id, deletedAt: IsNull() },
                select: {
                  id: true,
                  convenio: true,
                  planoFaaz: true,
                },
              }),
            { label: "plano-resumo:paciente" },
          );
        },
        async () => {
          loaded.pacotes = await withRepositoryRetry(
            PacoteAcompanhamentoEntity,
            (repo) =>
              repo.find({
                where: { pacienteId: id },
                select: {
                  id: true,
                  pacienteId: true,
                  nomePlano: true,
                  qtdTotalConsultas: true,
                  dataInicio: true,
                  dataValidade: true,
                  status: true,
                  createdAt: true,
                },
                order: { dataInicio: "DESC", createdAt: "DESC" },
              }),
            { label: "plano-resumo:pacotes" },
          );
        },
      ],
      2,
    );

    if (!loaded.paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const fallbackConvenio =
      loaded.paciente.convenio?.trim() ||
      (loaded.paciente.planoFaaz ? "Plano FAAZ" : "Particular");

    // Prioriza o pacote ATIVO mais recente; se não houver, usa o último CONCLUIDO
    const pacoteAtivo =
      loaded.pacotes.find((p) => p.status === "ATIVO") ?? null;
    const ultimoConcluido =
      loaded.pacotes.find((p) => p.status === "CONCLUIDO") ?? null;
    const pacoteAlvo = pacoteAtivo ?? ultimoConcluido;

    if (!pacoteAlvo) {
      return NextResponse.json({
        success: true,
        possuiPacote: false,
        planoLabel: fallbackConvenio,
        pacote: null,
      });
    }

    // Onda 2: 1 query leve buscando apenas colunas seguras de CONSULTAS_PACOTE
    const consultasBrutas: ConsultaPacote[] = await withRepositoryRetry(
      ConsultaPacoteEntity,
      (repo) =>
        repo.find({
          where: { pacoteId: pacoteAlvo.id },
          select: {
            id: true,
            pacoteId: true,
            pacienteId: true,
            dataConsulta: true,
            horaConsulta: true,
            tipo: true,
            status: true,
            createdAt: true,
          },
          order: { dataConsulta: "ASC", createdAt: "ASC" },
        }),
      { label: "plano-resumo:consultas" },
    );

    const ordenadas = [...consultasBrutas].sort((a, b) => {
      const cmpData = a.dataConsulta.localeCompare(b.dataConsulta);
      if (cmpData !== 0) return cmpData;
      const cmpHora = (a.horaConsulta || "00:00").localeCompare(
        b.horaConsulta || "00:00",
      );
      if (cmpHora !== 0) return cmpHora;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const consultasHigienizadas = ordenadas.map((c, idx) => ({
      numero: idx + 1,
      dataConsulta: c.dataConsulta,
      horaConsulta: c.horaConsulta ?? null,
      tipo: c.tipo,
      status: c.status,
    }));

    const qtdTotalConsultas = Math.max(
      1,
      Number(pacoteAlvo.qtdTotalConsultas) || 1,
    );
    const consultasRealizadas = ordenadas.filter((c) =>
      consultaDescontaSaldo(c.status),
    ).length;
    const consultasRestantes = Math.max(
      0,
      qtdTotalConsultas - consultasRealizadas,
    );
    const percentualUso = Math.min(
      100,
      Math.round((consultasRealizadas / qtdTotalConsultas) * 100),
    );

    const hojeIso = getDataDiaBR();
    const diasParaVencer = pacoteAlvo.dataValidade
      ? diffDiasIso(hojeIso, pacoteAlvo.dataValidade)
      : null;

    const statusNormalizado: "ATIVO" | "CONCLUIDO" =
      pacoteAlvo.status === "CONCLUIDO" || consultasRestantes === 0
        ? "CONCLUIDO"
        : "ATIVO";

    const alertaRenovacao =
      statusNormalizado === "CONCLUIDO" ||
      consultasRestantes <= 1 ||
      (diasParaVencer !== null && diasParaVencer <= 15);

    const nomePlanoLimpo =
      pacoteAlvo.nomePlano?.trim() || "Plano FAAZ Acompanhamento";

    return NextResponse.json({
      success: true,
      possuiPacote: true,
      planoLabel: nomePlanoLimpo,
      pacote: {
        nomePlano: nomePlanoLimpo,
        status: statusNormalizado,
        qtdTotalConsultas,
        consultasRealizadas,
        consultasRestantes,
        percentualUso,
        dataInicio: pacoteAlvo.dataInicio,
        dataValidade: pacoteAlvo.dataValidade ?? null,
        alertaRenovacao,
        consultas: consultasHigienizadas,
      },
    });
  } catch (error: unknown) {
    console.error("[API_PACIENTE_PLANO_RESUMO_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao carregar resumo do plano.", details },
      { status: 500 },
    );
  }
}
