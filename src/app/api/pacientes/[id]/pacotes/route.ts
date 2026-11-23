export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { IsNull, type EntityManager } from "typeorm";
import { getRepository, withTransaction } from "@/lib/db/data-source";
import {
  ConsultaPacoteEntity,
  PacoteAcompanhamentoEntity,
  PatientEntity,
  type ConsultaPacote,
  type PacoteAcompanhamento,
  type StatusConsultaPacote,
  type StatusPacoteAcompanhamento,
  type TipoConsultaPacote,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import {
  podeAcessarDadosClinicos,
  podeGerenciarPacotes,
} from "@/lib/auth-rbac";
import { formatarHoraBR, getDataDiaBR, toIsoUtc } from "@/lib/date-br";
import {
  consultaDescontaSaldo,
  diffDiasIso,
  type ConsultaPacoteDTO,
  type PacoteResumoDTO,
  type PacotesPacienteResponse,
} from "@/lib/pacotes-faaz";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_RE = /^\d{2}:\d{2}$/;

const VALID_TIPOS_CONSULTA: readonly TipoConsultaPacote[] = [
  "PRESENCIAL",
  "ONLINE",
  "RETORNO",
  "AVALIACAO",
];

const VALID_STATUS_CONSULTA: readonly StatusConsultaPacote[] = [
  "REALIZADA",
  "FALTA_COBRADA",
  "BONIFICADA",
];

const VALID_STATUS_PACOTE: readonly StatusPacoteAcompanhamento[] = [
  "ATIVO",
  "CONCLUIDO",
  "RENOVADO",
  "CANCELADO",
];

function validarDataIso(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 10);
  return ISO_DATE_RE.test(trimmed) ? trimmed : null;
}

function validarHora(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 5);
  return TIME_HHMM_RE.test(trimmed) ? trimmed : null;
}

function validarTipoConsulta(raw: unknown): TipoConsultaPacote {
  const upper = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if ((VALID_TIPOS_CONSULTA as readonly string[]).includes(upper)) {
    return upper as TipoConsultaPacote;
  }
  return "PRESENCIAL";
}

function validarStatusConsulta(raw: unknown): StatusConsultaPacote {
  const upper = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if ((VALID_STATUS_CONSULTA as readonly string[]).includes(upper)) {
    return upper as StatusConsultaPacote;
  }
  return "REALIZADA";
}

function validarStatusPacote(raw: unknown): StatusPacoteAcompanhamento | null {
  const upper = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if ((VALID_STATUS_PACOTE as readonly string[]).includes(upper)) {
    return upper as StatusPacoteAcompanhamento;
  }
  return null;
}

function revalidarRotasPacientes() {
  try {
    revalidatePath("/dashboard/pacientes");
    revalidatePath("/pacientes");
  } catch {
    // ignora fora de contexto RSC
  }
}

async function sincronizarConsultasRealizadas(
  manager: EntityManager,
  pacote: PacoteAcompanhamento,
  qtdDesejada: number,
  profissionalNome: string,
  dataReferencia: string,
  motivo: string,
): Promise<void> {
  const consultaRepo = manager.getRepository(ConsultaPacoteEntity);
  const existentes = await consultaRepo.find({
    where: { pacoteId: pacote.id },
    order: { createdAt: "DESC" },
  });

  const descontam = existentes.filter((c) => consultaDescontaSaldo(c.status));
  const qtdAtual = descontam.length;

  if (qtdDesejada > qtdAtual) {
    const diferenca = qtdDesejada - qtdAtual;
    const novas = Array.from({ length: diferenca }).map(() =>
      consultaRepo.create({
        pacoteId: pacote.id,
        pacienteId: pacote.pacienteId,
        dataConsulta: dataReferencia,
        horaConsulta: null,
        tipo: "PRESENCIAL",
        status: "REALIZADA",
        profissionalNome: profissionalNome.slice(0, 120),
        evolucaoId: null,
        observacao: motivo.slice(0, 400),
      }),
    );
    await consultaRepo.save(novas);
  } else if (qtdDesejada < qtdAtual) {
    const removerQtd = qtdAtual - qtdDesejada;
    // Prioriza remover lançamentos administrativos (sem vínculo a evolução médica) mais recentes
    const ordenadasParaRemocao = [...descontam].sort((a, b) => {
      const aSemVinculo = a.evolucaoId ? 1 : 0;
      const bSemVinculo = b.evolucaoId ? 1 : 0;
      if (aSemVinculo !== bSemVinculo) return aSemVinculo - bSemVinculo;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const paraRemover = ordenadasParaRemocao.slice(0, removerQtd);
    if (paraRemover.length > 0) {
      await consultaRepo.remove(paraRemover);
    }
  }
}

function montarResumoPacote(
  pacote: PacoteAcompanhamento,
  consultasBrutas: ConsultaPacote[],
  hojeIso: string,
  incluirVinculoClinico: boolean,
): PacoteResumoDTO {
  const ordenadas = [...consultasBrutas].sort((a, b) => {
    const cmpData = a.dataConsulta.localeCompare(b.dataConsulta);
    if (cmpData !== 0) return cmpData;
    const cmpHora = (a.horaConsulta || "00:00").localeCompare(
      b.horaConsulta || "00:00",
    );
    if (cmpHora !== 0) return cmpHora;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const consultasDTO: ConsultaPacoteDTO[] = ordenadas.map((c, idx) => ({
    id: c.id,
    pacoteId: c.pacoteId,
    pacienteId: c.pacienteId,
    numeroSequencial: idx + 1,
    descontaSaldo: consultaDescontaSaldo(c.status),
    dataConsulta: c.dataConsulta,
    horaConsulta: c.horaConsulta ?? null,
    tipo: c.tipo,
    status: c.status,
    profissionalNome: c.profissionalNome ?? null,
    evolucaoId: incluirVinculoClinico ? (c.evolucaoId ?? null) : null,
    observacao: c.observacao ?? null,
    createdAt: toIsoUtc(c.createdAt) ?? new Date(c.createdAt).toISOString(),
  }));

  const qtdTotal = Math.max(1, Number(pacote.qtdTotalConsultas) || 1);
  const consultasRealizadas = consultasDTO.filter((c) => c.descontaSaldo).length;
  const consultasBonificadas = consultasDTO.filter((c) => !c.descontaSaldo).length;
  const consultasRestantes = Math.max(0, qtdTotal - consultasRealizadas);
  const percentualUso = Math.min(
    100,
    Math.round((consultasRealizadas / qtdTotal) * 100),
  );

  const diasParaVencer = pacote.dataValidade
    ? diffDiasIso(hojeIso, pacote.dataValidade)
    : null;
  const vencido = diasParaVencer !== null && diasParaVencer < 0;

  const alertaRenovacao =
    pacote.status === "ATIVO" &&
    (consultasRestantes <= 1 || (diasParaVencer !== null && diasParaVencer <= 15));

  let motivoAlerta: string | null = null;
  if (pacote.status === "CONCLUIDO" || consultasRestantes === 0) {
    motivoAlerta = "Ciclo concluído · pronto para renovação";
  } else if (vencido) {
    motivoAlerta = `Validade expirada há ${Math.abs(diasParaVencer ?? 0)} dia(s)`;
  } else if (consultasRestantes === 1) {
    motivoAlerta = "Última consulta disponível no pacote";
  } else if (diasParaVencer !== null && diasParaVencer <= 15) {
    motivoAlerta =
      diasParaVencer === 0
        ? "Validade vence hoje"
        : `Vence em ${diasParaVencer} dia(s)`;
  }

  return {
    id: pacote.id,
    pacienteId: pacote.pacienteId,
    nomePlano: pacote.nomePlano,
    qtdTotalConsultas: qtdTotal,
    dataInicio: pacote.dataInicio,
    dataValidade: pacote.dataValidade ?? null,
    status: pacote.status,
    observacoes: pacote.observacoes ?? null,
    createdBy: pacote.createdBy ?? null,
    createdAt: toIsoUtc(pacote.createdAt) ?? new Date(pacote.createdAt).toISOString(),
    updatedAt: toIsoUtc(pacote.updatedAt) ?? new Date(pacote.updatedAt).toISOString(),
    consultasRealizadas,
    consultasBonificadas,
    consultasRestantes,
    percentualUso,
    diasParaVencer,
    vencido,
    alertaRenovacao,
    motivoAlerta,
    consultas: consultasDTO,
  };
}

async function montarRespostaPacotes(
  pacienteId: string,
  manager?: EntityManager,
  incluirVinculoClinico = false,
): Promise<PacotesPacienteResponse | null> {
  const patientRepo = manager
    ? manager.getRepository(PatientEntity)
    : await getRepository(PatientEntity);
  const pacoteRepo = manager
    ? manager.getRepository(PacoteAcompanhamentoEntity)
    : await getRepository(PacoteAcompanhamentoEntity);
  const consultaRepo = manager
    ? manager.getRepository(ConsultaPacoteEntity)
    : await getRepository(ConsultaPacoteEntity);

  const [paciente, pacotes, consultas] = await Promise.all([
    patientRepo.findOne({
      where: { id: pacienteId, deletedAt: IsNull() },
      select: { id: true, planoFaaz: true },
    }),
    pacoteRepo.find({
      where: { pacienteId },
      order: { createdAt: "DESC" },
    }),
    consultaRepo.find({
      where: { pacienteId },
      order: { dataConsulta: "ASC", createdAt: "ASC" },
    }),
  ]);

  if (!paciente) return null;

  const hojeIso = getDataDiaBR();
  const consultasPorPacote = new Map<string, ConsultaPacote[]>();
  for (const c of consultas) {
    const arr = consultasPorPacote.get(c.pacoteId) || [];
    arr.push(c);
    consultasPorPacote.set(c.pacoteId, arr);
  }

  const resumos = pacotes.map((p) =>
    montarResumoPacote(
      p,
      consultasPorPacote.get(p.id) || [],
      hojeIso,
      incluirVinculoClinico,
    ),
  );

  const pacoteAtivo = resumos.find((p) => p.status === "ATIVO") ?? null;
  const historicoPacotes = resumos.filter((p) => p.id !== pacoteAtivo?.id);
  const ultimoPacoteConcluido =
    !pacoteAtivo
      ? historicoPacotes.find((p) => p.status === "CONCLUIDO") ?? null
      : null;

  return {
    success: true,
    membroPlanoFaaz: Boolean(paciente.planoFaaz),
    pacoteAtivo,
    ultimoPacoteConcluido,
    historicoPacotes,
  };
}

async function recalcularStatusAutomaticoPacote(
  manager: EntityManager,
  pacote: PacoteAcompanhamento,
): Promise<void> {
  if (pacote.status === "RENOVADO" || pacote.status === "CANCELADO") {
    return;
  }

  const pacoteRepo = manager.getRepository(PacoteAcompanhamentoEntity);
  const consultaRepo = manager.getRepository(ConsultaPacoteEntity);

  const todasConsultas = await consultaRepo.find({
    where: { pacoteId: pacote.id },
    select: { id: true, status: true },
  });

  const realizadas = todasConsultas.filter((c) =>
    consultaDescontaSaldo(c.status),
  ).length;
  const qtdTotal = Math.max(1, Number(pacote.qtdTotalConsultas) || 1);

  if (realizadas >= qtdTotal && pacote.status === "ATIVO") {
    pacote.status = "CONCLUIDO";
    await pacoteRepo.save(pacote);
  } else if (realizadas < qtdTotal && pacote.status === "CONCLUIDO") {
    // Só reabre para ATIVO se não houver outro pacote ATIVO mais recente
    const outroAtivo = await pacoteRepo.findOne({
      where: { pacienteId: pacote.pacienteId, status: "ATIVO" },
      select: { id: true },
    });
    if (!outroAtivo || outroAtivo.id === pacote.id) {
      pacote.status = "ATIVO";
      await pacoteRepo.save(pacote);
    }
  }
}

async function verificarAcesso(req: NextRequest) {
  const sessao = await getSessao(req);
  if (!sessao) {
    return {
      error: NextResponse.json(
        { error: "Não autenticado. Faça login para acessar os pacotes." },
        { status: 401 },
      ),
      sessao: null,
      incluirVinculoClinico: false,
    };
  }
  if (!podeGerenciarPacotes(sessao.cargo)) {
    return {
      error: NextResponse.json(
        {
          error:
            "Acesso negado. Perfil sem permissão para gerenciar pacotes do Plano FAAZ.",
        },
        { status: 403 },
      ),
      sessao: null,
      incluirVinculoClinico: false,
    };
  }
  return {
    error: null,
    sessao,
    incluirVinculoClinico: podeAcessarDadosClinicos(sessao.cargo),
  };
}

/**
 * GET /api/pacientes/[id]/pacotes
 * Retorna estritamente dados administrativos de pacotes/programas de consultas
 * (nunca retorna evoluções clínicas, dieta, medicações ou glicemia).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { error, incluirVinculoClinico } = await verificarAcesso(req);
    if (error) return error;

    const { id } = await params;
    const resposta = await montarRespostaPacotes(
      id,
      undefined,
      incluirVinculoClinico,
    );
    if (!resposta) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(resposta, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (err: unknown) {
    console.error("[PACOTES/GET] Erro:", err);
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Erro ao consultar pacotes do Plano FAAZ.", details },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pacientes/[id]/pacotes
 * Ações suportadas via `acao`:
 *  - `criar_pacote` | `renovar_pacote`
 *  - `registrar_consulta`
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { error, sessao, incluirVinculoClinico } = await verificarAcesso(req);
    if (error || !sessao) return error!;

    const { id } = await params;
    const body = await req.json();
    const acao = typeof body?.acao === "string" ? body.acao.trim().toLowerCase() : "";

    if (acao === "criar_pacote" || acao === "renovar_pacote") {
      const nomePlano =
        typeof body.nomePlano === "string" ? body.nomePlano.trim() : "";
      const qtdTotal = Number.parseInt(String(body.qtdTotalConsultas ?? ""), 10);
      const consultasRealizadasIniciais =
        body.consultasRealizadas !== undefined &&
        body.consultasRealizadas !== null &&
        body.consultasRealizadas !== ""
          ? Number.parseInt(String(body.consultasRealizadas), 10)
          : 0;
      const statusExplicito =
        body.status !== undefined && body.status !== null && body.status !== ""
          ? validarStatusPacote(body.status)
          : null;
      const dataInicio = validarDataIso(body.dataInicio) || getDataDiaBR();
      const dataValidade = body.dataValidade
        ? validarDataIso(body.dataValidade)
        : null;
      const observacoes =
        typeof body.observacoes === "string" && body.observacoes.trim()
          ? body.observacoes.trim().slice(0, 500)
          : null;

      if (!nomePlano || nomePlano.length > 120) {
        return NextResponse.json(
          { error: "Informe o nome do plano (até 120 caracteres)." },
          { status: 400 },
        );
      }
      if (!Number.isFinite(qtdTotal) || qtdTotal < 1 || qtdTotal > 999) {
        return NextResponse.json(
          { error: "A quantidade total de consultas deve estar entre 1 e 999." },
          { status: 400 },
        );
      }
      if (
        !Number.isFinite(consultasRealizadasIniciais) ||
        consultasRealizadasIniciais < 0 ||
        consultasRealizadasIniciais > qtdTotal
      ) {
        return NextResponse.json(
          {
            error:
              "A quantidade de consultas já realizadas deve estar entre 0 e o total do pacote.",
          },
          { status: 400 },
        );
      }
      if (
        body.status !== undefined &&
        body.status !== null &&
        body.status !== "" &&
        !statusExplicito
      ) {
        return NextResponse.json(
          { error: "Status do pacote inválido." },
          { status: 400 },
        );
      }
      if (body.dataValidade && !dataValidade) {
        return NextResponse.json(
          { error: "Data de validade inválida. Use o formato YYYY-MM-DD." },
          { status: 400 },
        );
      }
      if (dataValidade && dataValidade < dataInicio) {
        return NextResponse.json(
          { error: "A data de validade não pode ser anterior à data de início." },
          { status: 400 },
        );
      }

      const txRes = await withTransaction(async (manager) => {
        const patientRepo = manager.getRepository(PatientEntity);
        const pacoteRepo = manager.getRepository(PacoteAcompanhamentoEntity);
        const consultaRepo = manager.getRepository(ConsultaPacoteEntity);

        const paciente = await patientRepo.findOne({
          where: { id, deletedAt: IsNull() },
        });
        if (!paciente) return null;

        const statusInicial: StatusPacoteAcompanhamento =
          statusExplicito ?? "ATIVO";

        // Encerra pacotes ATIVO anteriores ao criar/renovar um pacote ATIVO
        if (statusInicial === "ATIVO") {
          const ativosAnteriores = await pacoteRepo.find({
            where: { pacienteId: id, status: "ATIVO" },
          });

          for (const anterior of ativosAnteriores) {
            if (acao === "renovar_pacote") {
              anterior.status = "RENOVADO";
            } else {
              const consAnt = await consultaRepo.find({
                where: { pacoteId: anterior.id },
                select: { id: true, status: true },
              });
              const realizadasAnt = consAnt.filter((c) =>
                consultaDescontaSaldo(c.status),
              ).length;
              anterior.status =
                realizadasAnt >= anterior.qtdTotalConsultas
                  ? "CONCLUIDO"
                  : "RENOVADO";
            }
            await pacoteRepo.save(anterior);
          }
        }

        const criado = await pacoteRepo.save(
          pacoteRepo.create({
            pacienteId: id,
            nomePlano,
            qtdTotalConsultas: qtdTotal,
            dataInicio,
            dataValidade,
            status: statusInicial,
            observacoes,
            createdBy: sessao.nome || sessao.userId,
          }),
        );

        if (consultasRealizadasIniciais > 0) {
          await sincronizarConsultasRealizadas(
            manager,
            criado,
            consultasRealizadasIniciais,
            sessao.nome || "Equipe Administrativa FAAZ",
            dataInicio,
            "Consulta já realizada informada na configuração inicial do pacote.",
          );
          if (!statusExplicito) {
            await recalcularStatusAutomaticoPacote(manager, criado);
          }
        }

        // Ativa automaticamente a flag de Membro Plano FAAZ em PATIENTS
        if (!paciente.planoFaaz) {
          paciente.planoFaaz = true;
          if (sessao.userId) paciente.updatedBy = sessao.userId;
          await patientRepo.save(paciente);
        }

        const resposta = await montarRespostaPacotes(
          id,
          manager,
          incluirVinculoClinico,
        );
        return { criado, resposta };
      });

      if (!txRes || !txRes.resposta) {
        return NextResponse.json(
          { error: "Paciente não encontrado." },
          { status: 404 },
        );
      }

      revalidarRotasPacientes();

      return NextResponse.json(
        {
          ...txRes.resposta,
          message:
            acao === "renovar_pacote"
              ? "Pacote renovado com sucesso!"
              : "Pacote de acompanhamento criado com sucesso!",
          pacoteCriadoId: txRes.criado.id,
        },
        { status: 201 },
      );
    }

    if (acao === "registrar_consulta") {
      const dataConsulta = validarDataIso(body.dataConsulta) || getDataDiaBR();
      const horaConsulta =
        body.horaConsulta !== undefined && body.horaConsulta !== null && body.horaConsulta !== ""
          ? validarHora(body.horaConsulta)
          : formatarHoraBR(new Date());
      const tipo = validarTipoConsulta(body.tipo);
      const status = validarStatusConsulta(body.status);
      const profissionalNome =
        typeof body.profissionalNome === "string" && body.profissionalNome.trim()
          ? body.profissionalNome.trim().slice(0, 120)
          : sessao.nome || "Equipe Clínica FAAZ";
      const evolucaoId =
        incluirVinculoClinico &&
        typeof body.evolucaoId === "string" &&
        body.evolucaoId.trim()
          ? body.evolucaoId.trim().slice(0, 36)
          : null;
      const observacao =
        typeof body.observacao === "string" && body.observacao.trim()
          ? body.observacao.trim().slice(0, 400)
          : null;
      const pacoteIdParam =
        typeof body.pacoteId === "string" && body.pacoteId.trim()
          ? body.pacoteId.trim()
          : null;

      if (body.horaConsulta && !horaConsulta) {
        return NextResponse.json(
          { error: "Horário inválido. Use o formato HH:MM." },
          { status: 400 },
        );
      }

      const txRes = await withTransaction(async (manager) => {
        const pacoteRepo = manager.getRepository(PacoteAcompanhamentoEntity);
        const consultaRepo = manager.getRepository(ConsultaPacoteEntity);

        const pacoteAlvo = pacoteIdParam
          ? await pacoteRepo.findOne({
              where: { id: pacoteIdParam, pacienteId: id },
            })
          : await pacoteRepo.findOne({
              where: { pacienteId: id, status: "ATIVO" },
              order: { createdAt: "DESC" },
            });

        if (!pacoteAlvo) {
          return { erro: "Nenhum pacote ativo encontrado para registrar a consulta.", statusCode: 404 as const };
        }

        if (pacoteAlvo.status === "CANCELADO") {
          return { erro: "Não é possível registrar consulta em um pacote cancelado.", statusCode: 400 as const };
        }

        const consultaCriada = await consultaRepo.save(
          consultaRepo.create({
            pacoteId: pacoteAlvo.id,
            pacienteId: id,
            dataConsulta,
            horaConsulta,
            tipo,
            status,
            profissionalNome,
            evolucaoId,
            observacao,
          }),
        );

        await recalcularStatusAutomaticoPacote(manager, pacoteAlvo);

        const resposta = await montarRespostaPacotes(
          id,
          manager,
          incluirVinculoClinico,
        );
        return { consultaCriada, resposta, erro: null, statusCode: 201 as const };
      });

      if (txRes.erro || !txRes.resposta) {
        return NextResponse.json(
          { error: txRes.erro || "Erro ao registrar consulta." },
          { status: txRes.statusCode },
        );
      }

      revalidarRotasPacientes();

      return NextResponse.json(
        {
          ...txRes.resposta,
          message: "Consulta registrada no pacote com sucesso!",
          consultaCriadaId: txRes.consultaCriada?.id ?? null,
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Ação inválida. Use 'criar_pacote', 'renovar_pacote' ou 'registrar_consulta'.",
      },
      { status: 400 },
    );
  } catch (err: unknown) {
    console.error("[PACOTES/POST] Erro:", err);
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Erro ao salvar operação no pacote do Plano FAAZ.", details },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/pacientes/[id]/pacotes
 * Alias administrativo para PATCH (atualização de pacote ou consulta do pacote).
 */
export async function PUT(req: NextRequest, ctx: RouteParams) {
  return PATCH(req, ctx);
}

/**
 * PATCH /api/pacientes/[id]/pacotes
 * Edita um pacote (`pacoteId`) OU uma consulta específica (`consultaId`).
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { error, sessao, incluirVinculoClinico } = await verificarAcesso(req);
    if (error || !sessao) return error!;

    const { id } = await params;
    const body = await req.json();

    // Modo 1: editar consulta específica do extrato
    if (typeof body?.consultaId === "string" && body.consultaId.trim()) {
      const consultaId = body.consultaId.trim();

      const txRes = await withTransaction(async (manager) => {
        const consultaRepo = manager.getRepository(ConsultaPacoteEntity);
        const pacoteRepo = manager.getRepository(PacoteAcompanhamentoEntity);

        const consulta = await consultaRepo.findOne({
          where: { id: consultaId, pacienteId: id },
        });
        if (!consulta) {
          return { erro: "Consulta do pacote não encontrada.", statusCode: 404 as const };
        }

        if (body.dataConsulta !== undefined) {
          const d = validarDataIso(body.dataConsulta);
          if (!d) {
            return { erro: "Data da consulta inválida (YYYY-MM-DD).", statusCode: 400 as const };
          }
          consulta.dataConsulta = d;
        }
        if (body.horaConsulta !== undefined) {
          if (body.horaConsulta === null || body.horaConsulta === "") {
            consulta.horaConsulta = null;
          } else {
            const h = validarHora(body.horaConsulta);
            if (!h) {
              return { erro: "Hora da consulta inválida (HH:MM).", statusCode: 400 as const };
            }
            consulta.horaConsulta = h;
          }
        }
        if (body.tipo !== undefined) {
          consulta.tipo = validarTipoConsulta(body.tipo);
        }
        if (body.status !== undefined) {
          consulta.status = validarStatusConsulta(body.status);
        }
        if (body.profissionalNome !== undefined) {
          consulta.profissionalNome =
            typeof body.profissionalNome === "string" && body.profissionalNome.trim()
              ? body.profissionalNome.trim().slice(0, 120)
              : null;
        }
        if (body.observacao !== undefined) {
          consulta.observacao =
            typeof body.observacao === "string" && body.observacao.trim()
              ? body.observacao.trim().slice(0, 400)
              : null;
        }

        await consultaRepo.save(consulta);

        const pacotePai = await pacoteRepo.findOne({
          where: { id: consulta.pacoteId, pacienteId: id },
        });
        if (pacotePai) {
          await recalcularStatusAutomaticoPacote(manager, pacotePai);
        }

        const resposta = await montarRespostaPacotes(
          id,
          manager,
          incluirVinculoClinico,
        );
        return { resposta, erro: null, statusCode: 200 as const };
      });

      if (txRes.erro || !txRes.resposta) {
        return NextResponse.json(
          { error: txRes.erro || "Erro ao editar consulta." },
          { status: txRes.statusCode },
        );
      }

      revalidarRotasPacientes();

      return NextResponse.json({
        ...txRes.resposta,
        message: "Consulta atualizada com sucesso!",
      });
    }

    // Modo 2: editar pacote de acompanhamento
    if (typeof body?.pacoteId === "string" && body.pacoteId.trim()) {
      const pacoteId = body.pacoteId.trim();

      const txRes = await withTransaction(async (manager) => {
        const patientRepo = manager.getRepository(PatientEntity);
        const pacoteRepo = manager.getRepository(PacoteAcompanhamentoEntity);
        const pacote = await pacoteRepo.findOne({
          where: { id: pacoteId, pacienteId: id },
        });
        if (!pacote) {
          return { erro: "Pacote não encontrado.", statusCode: 404 as const };
        }

        if (body.nomePlano !== undefined) {
          const nome = typeof body.nomePlano === "string" ? body.nomePlano.trim() : "";
          if (!nome || nome.length > 120) {
            return { erro: "Nome do plano inválido (1 a 120 caracteres).", statusCode: 400 as const };
          }
          pacote.nomePlano = nome;
        }

        if (body.qtdTotalConsultas !== undefined) {
          const qtd = Number.parseInt(String(body.qtdTotalConsultas), 10);
          if (!Number.isFinite(qtd) || qtd < 1 || qtd > 999) {
            return { erro: "Quantidade de consultas deve estar entre 1 e 999.", statusCode: 400 as const };
          }
          pacote.qtdTotalConsultas = qtd;
        }

        let consultasRealizadasAlvo: number | null = null;
        if (
          body.consultasRealizadas !== undefined &&
          body.consultasRealizadas !== null &&
          body.consultasRealizadas !== ""
        ) {
          const qtdRealizadas = Number.parseInt(
            String(body.consultasRealizadas),
            10,
          );
          if (
            !Number.isFinite(qtdRealizadas) ||
            qtdRealizadas < 0 ||
            qtdRealizadas > pacote.qtdTotalConsultas
          ) {
            return {
              erro: "Consultas realizadas deve estar entre 0 e a quantidade total do pacote.",
              statusCode: 400 as const,
            };
          }
          consultasRealizadasAlvo = qtdRealizadas;
        }

        if (body.dataInicio !== undefined) {
          const di = validarDataIso(body.dataInicio);
          if (!di) {
            return { erro: "Data de início inválida (YYYY-MM-DD).", statusCode: 400 as const };
          }
          pacote.dataInicio = di;
        }

        if (body.dataValidade !== undefined) {
          if (body.dataValidade === null || body.dataValidade === "") {
            pacote.dataValidade = null;
          } else {
            const dv = validarDataIso(body.dataValidade);
            if (!dv) {
              return { erro: "Data de validade inválida (YYYY-MM-DD).", statusCode: 400 as const };
            }
            pacote.dataValidade = dv;
          }
        }

        if (pacote.dataValidade && pacote.dataValidade < pacote.dataInicio) {
          return {
            erro: "A data de validade não pode ser anterior à data de início.",
            statusCode: 400 as const,
          };
        }

        if (body.observacoes !== undefined) {
          pacote.observacoes =
            typeof body.observacoes === "string" && body.observacoes.trim()
              ? body.observacoes.trim().slice(0, 500)
              : null;
        }

        let statusExplicitado = false;
        if (body.status !== undefined) {
          const st = validarStatusPacote(body.status);
          if (!st) {
            return { erro: "Status do pacote inválido.", statusCode: 400 as const };
          }
          if (st === "ATIVO" && pacote.status !== "ATIVO") {
            // Garante apenas um ciclo ATIVO por paciente
            const outrosAtivos = await pacoteRepo.find({
              where: { pacienteId: id, status: "ATIVO" },
            });
            for (const outro of outrosAtivos) {
              if (outro.id !== pacote.id) {
                outro.status = "RENOVADO";
                await pacoteRepo.save(outro);
              }
            }
            const paciente = await patientRepo.findOne({
              where: { id, deletedAt: IsNull() },
            });
            if (paciente && !paciente.planoFaaz) {
              paciente.planoFaaz = true;
              if (sessao.userId) paciente.updatedBy = sessao.userId;
              await patientRepo.save(paciente);
            }
          }
          pacote.status = st;
          statusExplicitado = true;
        }

        await pacoteRepo.save(pacote);

        if (consultasRealizadasAlvo !== null) {
          await sincronizarConsultasRealizadas(
            manager,
            pacote,
            consultasRealizadasAlvo,
            sessao.nome || "Equipe Administrativa FAAZ",
            getDataDiaBR(),
            "Ajuste administrativo de consultas realizadas no pacote.",
          );
        }

        if (!statusExplicitado) {
          await recalcularStatusAutomaticoPacote(manager, pacote);
        }

        const resposta = await montarRespostaPacotes(
          id,
          manager,
          incluirVinculoClinico,
        );
        return { resposta, erro: null, statusCode: 200 as const };
      });

      if (txRes.erro || !txRes.resposta) {
        return NextResponse.json(
          { error: txRes.erro || "Erro ao editar pacote." },
          { status: txRes.statusCode },
        );
      }

      revalidarRotasPacientes();

      return NextResponse.json({
        ...txRes.resposta,
        message: "Pacote atualizado com sucesso!",
      });
    }

    return NextResponse.json(
      { error: "Informe 'pacoteId' ou 'consultaId' para atualizar." },
      { status: 400 },
    );
  } catch (err: unknown) {
    console.error("[PACOTES/PATCH] Erro:", err);
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Erro ao editar pacote ou consulta.", details },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pacientes/[id]/pacotes?consultaId=... (estorna consulta e reabre pacote se houver saldo)
 * ou ?pacoteId=... (cancela o pacote preservando histórico)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { error, incluirVinculoClinico } = await verificarAcesso(req);
    if (error) return error;

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const consultaId = searchParams.get("consultaId")?.trim();
    const pacoteId = searchParams.get("pacoteId")?.trim();

    if (consultaId) {
      const txRes = await withTransaction(async (manager) => {
        const consultaRepo = manager.getRepository(ConsultaPacoteEntity);
        const pacoteRepo = manager.getRepository(PacoteAcompanhamentoEntity);

        const consulta = await consultaRepo.findOne({
          where: { id: consultaId, pacienteId: id },
        });
        if (!consulta) {
          return { erro: "Consulta não encontrada neste pacote.", statusCode: 404 as const };
        }

        const parentPacoteId = consulta.pacoteId;
        await consultaRepo.remove(consulta);

        const pacotePai = await pacoteRepo.findOne({
          where: { id: parentPacoteId, pacienteId: id },
        });
        if (pacotePai) {
          await recalcularStatusAutomaticoPacote(manager, pacotePai);
        }

        const resposta = await montarRespostaPacotes(
          id,
          manager,
          incluirVinculoClinico,
        );
        return { resposta, erro: null, statusCode: 200 as const };
      });

      if (txRes.erro || !txRes.resposta) {
        return NextResponse.json(
          { error: txRes.erro || "Erro ao estornar consulta." },
          { status: txRes.statusCode },
        );
      }

      revalidarRotasPacientes();

      return NextResponse.json({
        ...txRes.resposta,
        message: "Consulta estornada e saldo do pacote recalculado!",
      });
    }

    if (pacoteId) {
      const txRes = await withTransaction(async (manager) => {
        const pacoteRepo = manager.getRepository(PacoteAcompanhamentoEntity);
        const pacote = await pacoteRepo.findOne({
          where: { id: pacoteId, pacienteId: id },
        });
        if (!pacote) {
          return { erro: "Pacote não encontrado.", statusCode: 404 as const };
        }

        pacote.status = "CANCELADO";
        await pacoteRepo.save(pacote);

        const resposta = await montarRespostaPacotes(
          id,
          manager,
          incluirVinculoClinico,
        );
        return { resposta, erro: null, statusCode: 200 as const };
      });

      if (txRes.erro || !txRes.resposta) {
        return NextResponse.json(
          { error: txRes.erro || "Erro ao cancelar pacote." },
          { status: txRes.statusCode },
        );
      }

      revalidarRotasPacientes();

      return NextResponse.json({
        ...txRes.resposta,
        message: "Pacote cancelado com sucesso.",
      });
    }

    return NextResponse.json(
      { error: "Informe ?consultaId=... ou ?pacoteId=..." },
      { status: 400 },
    );
  } catch (err: unknown) {
    console.error("[PACOTES/DELETE] Erro:", err);
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Erro ao remover/estornar registro do pacote.", details },
      { status: 500 },
    );
  }
}
