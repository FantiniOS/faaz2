export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { MoreThanOrEqual } from "typeorm";
import {
  runWithConcurrency,
  withRepositoryRetry,
} from "@/lib/db/data-source";
import {
  ProtocoloGlicemicoEntity,
  RegistroGlicemiaEntity,
  RegistroInsulinaEntity,
  type ProtocoloGlicemico,
  type RegistroGlicemia,
  type RegistroInsulina,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import {
  formatarHoraBR,
  getDataDiaBR,
  getIntervaloDiasBR,
  getPartesDataHoraBR,
  toIsoUtc,
} from "@/lib/date-br";
import {
  classificarGlicemiaMapa,
  inferirMomentoClinico,
  isSlotMapa,
  parseContextoTags,
  serializeProtocoloGlicemico,
  SLOTS_MAPA_ORDER,
  SLOT_META,
  type CelulaMapaGlicemicoDTO,
  type DoseBasalDiaDTO,
  type LinhaMapaGlicemicoDTO,
  type MapaGlicemicoResponseDTO,
  type MediasPorColunaMapa,
  type SlotMapaGlicemico,
} from "@/lib/mapa-glicemico";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function round1(valor: number): number {
  return Math.round(valor * 10) / 10;
}

function formatDataCurtaDiaSemana(dataDia: string): {
  dataLabel: string;
  diaSemanaCurto: string;
} {
  const parts = getPartesDataHoraBR(dataDia);
  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  return {
    dataLabel: `${dd}/${mm}`,
    diaSemanaCurto: DIAS_SEMANA_CURTO[parts.weekdayIndex] ?? "",
  };
}

/**
 * GET /api/pacientes/[id]/mapa-glicemico?dias=7|14|30
 * Consolida a grade clínica de leitura rápida, KPIs e aplicações de insulina
 * respeitando poolMax: 2 (ondas de no máximo 2 queries concorrentes) e America/Sao_Paulo.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const sessao = await getSessao(req);
    const sessaoRole = (sessao as { role?: string } | null)?.role;
    if (
      sessao &&
      (!podeAcessarDadosClinicos(sessao.cargo) ||
        sessao.cargo === "SECRETARIA" ||
        sessaoRole === "SECRETARIA" ||
        sessaoRole === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso negado (LGPD/RBAC).",
          motivo:
            "O Mapa Glicêmico contém dados clínicos sensíveis restritos ao corpo médico.",
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const diasRaw = parseInt(searchParams.get("dias") || "14", 10);
    const dias = Number.isFinite(diasRaw)
      ? Math.min(90, Math.max(1, diasRaw))
      : 14;

    const { dataInicioIso, dataFimIso, inicioUtc } = getIntervaloDiasBR(dias);

    const loaded = {
      protocoloRow: null as ProtocoloGlicemico | null,
      glicemias: [] as RegistroGlicemia[],
      insulinas: [] as RegistroInsulina[],
    };

    // Máximo de 2 queries paralelas por onda (compatível com poolMax: 2 do Oracle ADB)
    await runWithConcurrency(
      [
        async () => {
          loaded.protocoloRow = await withRepositoryRetry(
            ProtocoloGlicemicoEntity,
            (repo) => repo.findOne({ where: { pacienteId: id } }),
            { label: "mapa-glicemico:protocolo" },
          );
        },
        async () => {
          loaded.glicemias = await withRepositoryRetry(
            RegistroGlicemiaEntity,
            (repo) =>
              repo.find({
                where: {
                  pacienteId: id,
                  dataRegistro: MoreThanOrEqual(inicioUtc),
                },
                select: {
                  id: true,
                  valor: true,
                  momento: true,
                  momentoClinico: true,
                  contextoTags: true,
                  dataRegistro: true,
                },
                order: { dataRegistro: "DESC" },
                take: 400,
              }),
            { label: "mapa-glicemico:glicemias" },
          );
        },
        async () => {
          loaded.insulinas = await withRepositoryRetry(
            RegistroInsulinaEntity,
            (repo) =>
              repo.find({
                where: {
                  pacienteId: id,
                  dataDia: MoreThanOrEqual(dataInicioIso),
                },
                select: {
                  id: true,
                  registroGlicemiaId: true,
                  dataDia: true,
                  aplicadoEm: true,
                  tipo: true,
                  nomeInsulina: true,
                  unidades: true,
                  momentoClinico: true,
                  observacao: true,
                },
                order: { aplicadoEm: "DESC" },
                take: 400,
              }),
            { label: "mapa-glicemico:insulinas" },
          );
        },
      ],
      2,
    );

    const protocolo = serializeProtocoloGlicemico(id, loaded.protocoloRow);
    const alvos = {
      alvoJejumMin: protocolo.alvoJejumMin,
      alvoJejumMax: protocolo.alvoJejumMax,
      alvoPosMax: protocolo.alvoPosMax,
    };

    // Indexação de doses de insulina rápida por REGISTRO_GLICEMIA_ID e por (DATA_DIA + MOMENTO_CLINICO)
    const rapidaPorGlicemiaId = new Map<
      string,
      { unidades: number; nome: string | null }
    >();
    const rapidaPorDiaSlot = new Map<
      string,
      { unidades: number; nome: string | null }
    >();
    const basalPorDia = new Map<string, DoseBasalDiaDTO[]>();

    const basalSomaPorDia = new Map<string, number>();
    const rapidaSomaPorDia = new Map<string, number>();

    for (const ins of loaded.insulinas) {
      const unidades = Number(ins.unidades) || 0;
      if (unidades <= 0) continue;

      const dataDia = ins.dataDia || getDataDiaBR(ins.aplicadoEm);
      const tipo = String(ins.tipo || "").trim().toUpperCase();
      const nome = ins.nomeInsulina?.trim() || null;

      if (tipo === "BASAL") {
        basalSomaPorDia.set(dataDia, (basalSomaPorDia.get(dataDia) || 0) + unidades);
        const list = basalPorDia.get(dataDia) || [];
        list.push({
          id: ins.id,
          unidades: round1(unidades),
          nome,
          hora: formatarHoraBR(ins.aplicadoEm),
          aplicadoEm: toIsoUtc(ins.aplicadoEm) ?? new Date(ins.aplicadoEm).toISOString(),
          observacao: ins.observacao?.trim() || null,
        });
        basalPorDia.set(dataDia, list);
      } else {
        rapidaSomaPorDia.set(dataDia, (rapidaSomaPorDia.get(dataDia) || 0) + unidades);
        if (ins.registroGlicemiaId) {
          const prev = rapidaPorGlicemiaId.get(ins.registroGlicemiaId);
          rapidaPorGlicemiaId.set(ins.registroGlicemiaId, {
            unidades: round1((prev?.unidades || 0) + unidades),
            nome: nome || prev?.nome || null,
          });
        } else if (ins.momentoClinico) {
          const slotKey = `${dataDia}|${ins.momentoClinico.trim().toUpperCase()}`;
          const prev = rapidaPorDiaSlot.get(slotKey);
          rapidaPorDiaSlot.set(slotKey, {
            unidades: round1((prev?.unidades || 0) + unidades),
            nome: nome || prev?.nome || null,
          });
        }
      }
    }

    // Consolidação por dia em America/Sao_Paulo e métricas por coluna
    const linhasMap = new Map<string, LinhaMapaGlicemicoDTO>();
    const garantirLinha = (dataDia: string): LinhaMapaGlicemicoDTO => {
      let existing = linhasMap.get(dataDia);
      if (!existing) {
        const { dataLabel, diaSemanaCurto } = formatDataCurtaDiaSemana(dataDia);
        existing = {
          dataDia,
          dataLabel,
          diaSemanaCurto,
          celulas: {},
          avulsos: [],
          basalDoses: [],
        };
        linhasMap.set(dataDia, existing);
      }
      return existing;
    };

    const somaColuna: Record<SlotMapaGlicemico, { soma: number; qtd: number }> = {
      JEJUM: { soma: 0, qtd: 0 },
      POS_CAFE: { soma: 0, qtd: 0 },
      PRE_ALMOCO: { soma: 0, qtd: 0 },
      POS_ALMOCO: { soma: 0, qtd: 0 },
      PRE_JANTAR: { soma: 0, qtd: 0 },
      POS_JANTAR: { soma: 0, qtd: 0 },
      AO_DEITAR: { soma: 0, qtd: 0 },
    };

    let somaGeral = 0;
    let totalMedicoes = 0;
    let somaJejum = 0;
    let qtdJejum = 0;
    let somaPos = 0;
    let qtdPos = 0;
    let noAlvoCount = 0;
    let episodiosHipo = 0;
    let episodiosHiper = 0;

    // Os registros já vêm ordenados por dataRegistro DESC (mais recente primeiro)
    const slotsVinculadosSemId = new Set<string>();

    for (const reg of loaded.glicemias) {
      const valor = Number(reg.valor);
      if (!Number.isFinite(valor) || valor <= 0) continue;

      const dt = new Date(reg.dataRegistro);
      const partes = getPartesDataHoraBR(dt);
      const dataDia = partes.isoDate;
      const momentoClinico = inferirMomentoClinico(
        reg.momentoClinico,
        reg.momento,
        partes.hour,
      );
      const status = classificarGlicemiaMapa(valor, momentoClinico, alvos);

      somaGeral += valor;
      totalMedicoes += 1;
      if (status === "ALVO") noAlvoCount += 1;
      if (status === "HIPO") episodiosHipo += 1;
      if (status === "HIPER") episodiosHiper += 1;

      if (momentoClinico === "JEJUM") {
        somaJejum += valor;
        qtdJejum += 1;
      } else if (
        momentoClinico === "POS_CAFE" ||
        momentoClinico === "POS_ALMOCO" ||
        momentoClinico === "POS_JANTAR"
      ) {
        somaPos += valor;
        qtdPos += 1;
      }

      // Insulina rápida vinculada
      let rapida = rapidaPorGlicemiaId.get(reg.id) ?? null;
      if (!rapida && isSlotMapa(momentoClinico)) {
        const slotKey = `${dataDia}|${momentoClinico}`;
        if (!slotsVinculadosSemId.has(slotKey) && rapidaPorDiaSlot.has(slotKey)) {
          rapida = rapidaPorDiaSlot.get(slotKey) ?? null;
          slotsVinculadosSemId.add(slotKey);
        }
      }

      const celula: CelulaMapaGlicemicoDTO = {
        id: reg.id,
        valor: Math.round(valor),
        status,
        hora: formatarHoraBR(dt),
        dataRegistro: dt.toISOString(),
        momentoClinico,
        insulinaUI: rapida ? rapida.unidades : null,
        insulinaNome: rapida ? rapida.nome : null,
        contextoTags: parseContextoTags(reg.contextoTags),
      };

      const linha = garantirLinha(dataDia);
      if (isSlotMapa(momentoClinico)) {
        somaColuna[momentoClinico].soma += valor;
        somaColuna[momentoClinico].qtd += 1;

        // Mantém a medição mais recente do dia na célula principal e preserva duplicatas em avulsos
        if (!linha.celulas[momentoClinico]) {
          linha.celulas[momentoClinico] = celula;
        } else {
          linha.avulsos.push(celula);
        }
      } else {
        linha.avulsos.push(celula);
      }
    }

    // Injeta doses basais nos dias correspondentes (inclusive dias só com basal)
    for (const [dataDia, doses] of basalPorDia.entries()) {
      const linha = garantirLinha(dataDia);
      linha.basalDoses = doses;
    }

    const linhas = Array.from(linhasMap.values()).sort((a, b) =>
      b.dataDia.localeCompare(a.dataDia),
    );

    const mediasPorColuna = SLOTS_MAPA_ORDER.reduce<MediasPorColunaMapa>(
      (acc, slot) => {
        const info = somaColuna[slot];
        acc[slot] = info.qtd > 0 ? Math.round(info.soma / info.qtd) : null;
        return acc;
      },
      {
        JEJUM: null,
        POS_CAFE: null,
        PRE_ALMOCO: null,
        POS_ALMOCO: null,
        PRE_JANTAR: null,
        POS_JANTAR: null,
        AO_DEITAR: null,
      },
    );

    const mediaDiariaBasalUI =
      basalSomaPorDia.size > 0
        ? round1(
            Array.from(basalSomaPorDia.values()).reduce((s, v) => s + v, 0) /
              basalSomaPorDia.size,
          )
        : null;

    const mediaDiariaRapidaUI =
      rapidaSomaPorDia.size > 0
        ? round1(
            Array.from(rapidaSomaPorDia.values()).reduce((s, v) => s + v, 0) /
              rapidaSomaPorDia.size,
          )
        : null;

    const payload: MapaGlicemicoResponseDTO = {
      success: true,
      dias,
      hojeDataDia: dataFimIso,
      protocolo,
      resumo: {
        mediaGeral: totalMedicoes > 0 ? Math.round(somaGeral / totalMedicoes) : null,
        mediaJejum: qtdJejum > 0 ? Math.round(somaJejum / qtdJejum) : null,
        mediaPosPrandial: qtdPos > 0 ? Math.round(somaPos / qtdPos) : null,
        percentualNoAlvo:
          totalMedicoes > 0 ? Math.round((noAlvoCount / totalMedicoes) * 100) : null,
        episodiosHipo,
        episodiosHiper,
        totalMedicoes,
        totalAplicacoesInsulina: loaded.insulinas.length,
        mediaDiariaBasalUI,
        mediaDiariaRapidaUI,
      },
      linhas,
      mediasPorColuna,
    };

    // Referência silenciosa a SLOT_META evita tree-shake indevido caso usado no futuro
    void SLOT_META;

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("[API_MAPA_GLICEMICO_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consolidar o mapa glicêmico.", details },
      { status: 500 },
    );
  }
}
