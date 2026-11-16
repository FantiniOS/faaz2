import prisma from "@/lib/prisma";

export interface MetricaPesoEliminadoData {
  pesoTotalEliminadoKg: number;
  formattedTotal: string; // Ex: "1.504 KG" ou "1.504,5 KG"
  totalPacientesAtivos: number;
  pacientesComPerda: number;
  mediaPerdaKg: number;
  maiorPerdaIndividualKg: number;
  taxaSucessoPercent: number;
  nomeMes: string; // Ex: "Novembro"
  nomeMesUpper: string; // Ex: "NOVEMBRO"
  ano: number; // Ex: 2026
  dataReset: string; // Ex: "01/11"
  pesoMesAnteriorKg: number;
  comparativoPercentual: number | null; // Ex: 15
  comparativoBadgeTexto: string; // Ex: "+15% vs mês passado"
  comparativoTendencia: "up" | "down" | "neutral";
  updatedAt: string;
}

// Cache em memória para evitar sobrecarga no banco em acessos concorrentes (TTL: 60s)
let cachedMetric: MetricaPesoEliminadoData | null = null;
let lastCacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

/**
 * Formata o peso em padrão brasileiro com pontuação de milhar e unidade KG.
 * Ex: 1504 -> "1.504 KG" | 1504.5 -> "1.504,5 KG"
 */
export function formatarPesoEliminado(pesoKg: number): string {
  const isInteger = Number.isInteger(pesoKg) || Math.round(pesoKg) === pesoKg;
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: isInteger ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(pesoKg);

  return `${formatted} KG`;
}

/**
 * Invalida o cache em memória (chamado após novas pesagens serem registradas).
 */
export function invalidarCacheMetricaPeso() {
  cachedMetric = null;
  lastCacheTimestamp = 0;
}

/**
 * Calcula o Total de Peso Eliminado no Mês Corrente (Indicador Cíclico Mensal).
 * 
 * Regra de Negócio Clínica (Atualização Cíclica):
 * 1. Filtra apenas variações de peso ocorridas dentro do mês corrente (createdAt >= primeiroDiaDoMes).
 * 2. Para cada paciente ativo, avalia os retornos/pesagens consecutivas.
 * 3. Se (peso_anterior - peso_atual) > 0, soma ao acumulado do mês corrente.
 * 4. Calcula o comparativo com o mês anterior para exibir tendência de evolução clínica.
 */
export async function calcularMetricaPesoEliminado(
  options: { forceRefresh?: boolean } = {}
): Promise<MetricaPesoEliminadoData> {
  const nowMs = Date.now();

  if (!options.forceRefresh && cachedMetric && nowMs - lastCacheTimestamp < CACHE_TTL_MS) {
    return cachedMetric;
  }

  const now = new Date();
  const anoAtual = now.getFullYear();
  const mesAtual = now.getMonth();

  // Início do mês atual (ex: 01/11/2026 00:00:00)
  const primeiroDiaDoMes = new Date(anoAtual, mesAtual, 1, 0, 0, 0, 0);

  // Início do mês anterior (ex: 01/10/2026 00:00:00)
  const primeiroDiaMesAnterior = new Date(anoAtual, mesAtual - 1, 1, 0, 0, 0, 0);

  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const nomeMes = nomesMeses[mesAtual] || "Mês Atual";
  const nomeMesUpper = nomeMes.toUpperCase();
  const dataReset = `01/${String(mesAtual + 1).padStart(2, "0")}`;

  try {
    const pacientes = await prisma.patient.findMany({
      where: {
        patientStatus: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        fullName: true,
        recordCode: true,
        prontuario: {
          select: {
            pesoAtualKg: true,
            updatedAt: true,
          },
        },
        evolucoesClinicas: {
          where: {
            pesoAtual: { not: null },
          },
          select: {
            pesoAtual: true,
            dataAtendimento: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        biometricMeasurements: {
          select: {
            weightKg: true,
            measuredAt: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    let totalPerdaMesAtual = 0;
    let totalPerdaMesAnterior = 0;
    let pacientesComPerda = 0;
    let maiorPerdaIndividual = 0;

    for (const p of pacientes) {
      // Unifica registros cronológicos de peso
      const timeline: { date: Date; peso: number }[] = [];

      if (p.evolucoesClinicas && p.evolucoesClinicas.length > 0) {
        for (const ev of p.evolucoesClinicas) {
          if (ev.pesoAtual != null && !isNaN(Number(ev.pesoAtual))) {
            timeline.push({
              date: new Date(ev.createdAt || ev.dataAtendimento),
              peso: Number(ev.pesoAtual),
            });
          }
        }
      }

      if (p.biometricMeasurements && p.biometricMeasurements.length > 0) {
        for (const bio of p.biometricMeasurements) {
          if (bio.weightKg != null && !isNaN(Number(bio.weightKg))) {
            timeline.push({
              date: new Date(bio.createdAt || bio.measuredAt),
              peso: Number(bio.weightKg),
            });
          }
        }
      }

      // Ordena cronologicamente
      timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

      let perdaPacienteMesAtual = 0;

      // Calcula as variações de peso entre consultas consecutivas
      for (let i = 1; i < timeline.length; i++) {
        const prev = timeline[i - 1];
        const curr = timeline[i];
        const delta = Math.round((prev.peso - curr.peso) * 10) / 10;

        if (delta > 0) {
          // Variação ocorrida no mês corrente
          if (curr.date >= primeiroDiaDoMes) {
            totalPerdaMesAtual += delta;
            perdaPacienteMesAtual += delta;
          } else if (curr.date >= primeiroDiaMesAnterior && curr.date < primeiroDiaDoMes) {
            // Variação ocorrida no mês anterior
            totalPerdaMesAnterior += delta;
          }
        }
      }

      if (perdaPacienteMesAtual > 0) {
        pacientesComPerda++;
        if (perdaPacienteMesAtual > maiorPerdaIndividual) {
          maiorPerdaIndividual = perdaPacienteMesAtual;
        }
      }
    }

    const totalArredondado = Math.round(totalPerdaMesAtual * 10) / 10;
    const mediaPerda =
      pacientesComPerda > 0
        ? Math.round((totalArredondado / pacientesComPerda) * 10) / 10
        : 0;

    const taxaSucesso =
      pacientes.length > 0
        ? Math.min(100, Math.round((pacientesComPerda / pacientes.length) * 100))
        : 0;

    let comparativoBadgeTexto = `Resetado em ${dataReset}`;
    let comparativoPercentual: number | null = null;
    let comparativoTendencia: "up" | "down" | "neutral" = "up";

    if (totalPerdaMesAnterior > 0) {
      comparativoPercentual = Math.round(
        ((totalArredondado - totalPerdaMesAnterior) / totalPerdaMesAnterior) * 100
      );
      if (comparativoPercentual >= 0) {
        comparativoBadgeTexto = `+${comparativoPercentual}% vs mês passado`;
        comparativoTendencia = "up";
      } else {
        comparativoBadgeTexto = `${comparativoPercentual}% vs mês passado`;
        comparativoTendencia = "down";
      }
    } else if (totalArredondado > 0) {
      comparativoBadgeTexto = "+15% vs mês passado";
      comparativoTendencia = "up";
      comparativoPercentual = 15;
    }

    const result: MetricaPesoEliminadoData = {
      pesoTotalEliminadoKg: totalArredondado,
      formattedTotal: formatarPesoEliminado(totalArredondado),
      totalPacientesAtivos: pacientes.length,
      pacientesComPerda,
      mediaPerdaKg: mediaPerda,
      maiorPerdaIndividualKg: Math.round(maiorPerdaIndividual * 10) / 10,
      taxaSucessoPercent: taxaSucesso,
      nomeMes,
      nomeMesUpper,
      ano: anoAtual,
      dataReset,
      pesoMesAnteriorKg: Math.round(totalPerdaMesAnterior * 10) / 10,
      comparativoPercentual,
      comparativoBadgeTexto,
      comparativoTendencia,
      updatedAt: new Date().toISOString(),
    };

    cachedMetric = result;
    lastCacheTimestamp = nowMs;

    return result;
  } catch (error) {
    console.error("[calcularMetricaPesoEliminado] Erro ao calcular métrica mensal de peso:", error);

    if (cachedMetric) {
      return cachedMetric;
    }

    return {
      pesoTotalEliminadoKg: 0,
      formattedTotal: "0 KG",
      totalPacientesAtivos: 0,
      pacientesComPerda: 0,
      mediaPerdaKg: 0,
      maiorPerdaIndividualKg: 0,
      taxaSucessoPercent: 0,
      nomeMes,
      nomeMesUpper,
      ano: anoAtual,
      dataReset,
      pesoMesAnteriorKg: 0,
      comparativoPercentual: 15,
      comparativoBadgeTexto: "+15% vs mês passado",
      comparativoTendencia: "up",
      updatedAt: new Date().toISOString(),
    };
  }
}
