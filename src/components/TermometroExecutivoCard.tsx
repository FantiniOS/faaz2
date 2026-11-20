"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  Dumbbell,
  Gauge,
  HeartPulse,
  Ruler,
  Utensils,
} from "lucide-react";
import { TIMEZONE_BR } from "@/lib/date-br";

interface TermometroData {
  success: boolean;
  periodoDias: number;
  dieta: {
    temDados: boolean;
    percentualAdesao: number | null;
    totalCheckins: number;
    diasRegistrados: number;
    seguiu: number;
    trocasInteligentes: number;
    naoFez: number;
    opcionaisBonus: number;
    gargalo: {
      refeicaoId: string;
      nome: string;
      horario: string | null;
      label: string;
      totalRegistros: number;
      naoFez: number;
      percentualNaoFez: number;
      percentualAdesao: number;
    } | null;
  };
  glicemia: {
    temDados: boolean;
    mediaMgDl: number | null;
    totalMedicoes: number;
    dentroDaMeta: number;
    percentualNaMeta: number | null;
    episodiosHipo: number;
    episodiosHiper: number;
    alertasForaDaFaixa: number;
  };
  intestino: {
    temDados: boolean;
    padraoPredominante: "ideal" | "constipacao" | "diarreia" | null;
    padraoLabel: string | null;
    totalRegistros: number;
    sintomasFrequentes: Array<{ nome: string; ocorrencias: number }>;
  };
  treinos: {
    temDados: boolean;
    percentualAdesao: number | null;
    diasAtivos: number;
    metaEsperada: number;
    frequenciaSemanal: number;
    totalLogs: number;
    modalidade: string | null;
  };
  medidas: {
    temDados: boolean;
    totalRegistros: number;
    temComparativo: boolean;
    ultimaAfericaoEm: string | null;
    cintura: {
      atualCm: number | null;
      anteriorCm: number | null;
      variacaoCm: number | null;
    };
    abdomen: {
      atualCm: number | null;
      anteriorCm: number | null;
      variacaoCm: number | null;
    };
  };
}

interface TermometroExecutivoCardProps {
  pacienteId: string;
  dias?: number;
  refreshTrigger?: number;
}

function formatCm(valor: number): string {
  return `${valor.toFixed(1).replace(".", ",")} cm`;
}

function formatDeltaCm(delta: number): string {
  if (delta === 0) return "0,0 cm";
  const sinal = delta > 0 ? "+" : "";
  return `${sinal}${delta.toFixed(1).replace(".", ",")} cm`;
}

function getPercentBadgeClass(percent: number | null): string {
  if (percent === null) {
    return "bg-slate-100 text-slate-500 border-slate-200";
  }
  if (percent >= 75) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (percent >= 50) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-rose-50 text-rose-700 border-rose-200";
}

export function TermometroExecutivoCard({
  pacienteId,
  dias = 30,
  refreshTrigger = 0,
}: TermometroExecutivoCardProps) {
  const [dados, setDados] = useState<TermometroData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function carregarTermometro() {
      try {
        setCarregando(true);
        setErro(false);
        const res = await fetch(
          `/api/pacientes/${encodeURIComponent(pacienteId)}/termometro?dias=${dias}`,
          {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          }
        );

        if (!ativo) return;
        if (!res.ok) {
          setErro(true);
          return;
        }

        const json = (await res.json()) as TermometroData;
        if (!ativo) return;
        if (json?.success) {
          setDados(json);
        } else {
          setErro(true);
        }
      } catch {
        if (ativo) setErro(true);
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    if (pacienteId) {
      void carregarTermometro();
    }

    return () => {
      ativo = false;
    };
  }, [pacienteId, dias, refreshTrigger]);

  if (erro && !dados) {
    return null;
  }

  return (
    <section
      aria-label="Termômetro do Paciente"
      className="cl-card px-4 py-3.5"
    >
      {/* Cabeçalho compacto */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-700">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-wrap items-baseline gap-1.5">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
              Termômetro do Paciente
            </h3>
            <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
              · Últimos {dados?.periodoDias ?? dias} dias
            </span>
          </div>
        </div>
        <span className="text-[10px] font-semibold text-slate-400">
          Leitura rápida de adesão e auto-monitoramento
        </span>
      </div>

      {/* Grade horizontal de 5 mini-métricas */}
      {carregando && !dados ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {[0, 1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 h-[84px] animate-pulse flex flex-col justify-between"
            >
              <div className="h-2.5 w-24 bg-slate-200/80 rounded" />
              <div className="h-5 w-16 bg-slate-200 rounded" />
              <div className="h-2.5 w-28 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : dados ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* 1. CONSTÂNCIA DIETA */}
          <div className="bg-slate-50/75 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Utensils className="w-3 h-3 text-teal-600 shrink-0" />
                <span>Constância Dieta</span>
              </span>
              {dados.dieta.temDados && dados.dieta.trocasInteligentes > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-50 text-cyan-700 border border-cyan-200/80 shrink-0">
                  {dados.dieta.trocasInteligentes} troca
                  {dados.dieta.trocasInteligentes > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>

            {dados.dieta.temDados ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-black font-mono text-slate-900 leading-none">
                    {dados.dieta.percentualAdesao !== null
                      ? `${dados.dieta.percentualAdesao}%`
                      : "--"}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    ({dados.dieta.totalCheckins} check-in
                    {dados.dieta.totalCheckins > 1 ? "s" : ""})
                  </span>
                </div>
                <p
                  className={`text-[11px] font-semibold truncate ${
                    dados.dieta.gargalo ? "text-amber-700" : "text-emerald-700"
                  }`}
                  title={
                    dados.dieta.gargalo
                      ? `Gargalo: ${dados.dieta.gargalo.label} (${dados.dieta.gargalo.naoFez}/${dados.dieta.gargalo.totalRegistros} não feitas)`
                      : "Sem gargalos registrados no período"
                  }
                >
                  {dados.dieta.gargalo
                    ? `Gargalo: ${dados.dieta.gargalo.label}`
                    : "Sem gargalos"}
                </p>
              </>
            ) : (
              <p className="text-[11px] font-medium text-slate-400 py-2">
                Sem registros no período
              </p>
            )}
          </div>

          {/* 2. GLICEMIA 30D */}
          <div className="bg-slate-50/75 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <HeartPulse className="w-3 h-3 text-rose-500 shrink-0" />
                <span>Glicemia {dados.periodoDias}d</span>
              </span>
              {dados.glicemia.temDados &&
              dados.glicemia.percentualNaMeta !== null ? (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded border shrink-0 ${getPercentBadgeClass(
                    dados.glicemia.percentualNaMeta
                  )}`}
                >
                  {dados.glicemia.percentualNaMeta}% meta
                </span>
              ) : null}
            </div>

            {dados.glicemia.temDados && dados.glicemia.mediaMgDl !== null ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black font-mono text-slate-900 leading-none">
                    {dados.glicemia.mediaMgDl}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    mg/dL
                  </span>
                </div>
                <p
                  className={`text-[11px] font-semibold truncate ${
                    dados.glicemia.alertasForaDaFaixa > 0
                      ? "text-rose-600"
                      : "text-slate-500"
                  }`}
                >
                  {dados.glicemia.alertasForaDaFaixa > 0
                    ? [
                        dados.glicemia.episodiosHipo > 0
                          ? `${dados.glicemia.episodiosHipo} hipo`
                          : null,
                        dados.glicemia.episodiosHiper > 0
                          ? `${dados.glicemia.episodiosHiper} hiper`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") + ` (${dados.glicemia.totalMedicoes} med.)`
                    : `${dados.glicemia.totalMedicoes} ${
                        dados.glicemia.totalMedicoes === 1 ? "medição" : "medições"
                      } · na faixa`}
                </p>
              </>
            ) : (
              <p className="text-[11px] font-medium text-slate-400 py-2">
                Sem registros no período
              </p>
            )}
          </div>

          {/* 3. INTESTINO (BRISTOL) */}
          <div className="bg-slate-50/75 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Intestino (Bristol)</span>
              </span>
              {dados.intestino.temDados ? (
                <span className="text-[10px] font-bold text-slate-500">
                  {dados.intestino.totalRegistros} reg.
                </span>
              ) : null}
            </div>

            {dados.intestino.temDados && dados.intestino.padraoLabel ? (
              <>
                <span
                  className={`text-sm font-extrabold leading-tight truncate ${
                    dados.intestino.padraoPredominante === "ideal"
                      ? "text-emerald-700"
                      : dados.intestino.padraoPredominante === "constipacao"
                      ? "text-amber-700"
                      : "text-rose-700"
                  }`}
                >
                  {dados.intestino.padraoLabel}
                </span>
                <p
                  className="text-[11px] font-medium text-slate-500 truncate"
                  title={
                    dados.intestino.sintomasFrequentes.length > 0
                      ? dados.intestino.sintomasFrequentes
                          .map((s) => `${s.nome} (${s.ocorrencias}x)`)
                          .join(" · ")
                      : "Sem sintomas frequentes"
                  }
                >
                  {dados.intestino.sintomasFrequentes.length > 0
                    ? dados.intestino.sintomasFrequentes
                        .map((s) => s.nome)
                        .join(" · ")
                    : "Sem sintomas frequentes"}
                </p>
              </>
            ) : (
              <p className="text-[11px] font-medium text-slate-400 py-2">
                Sem registros no período
              </p>
            )}
          </div>

          {/* 4. TREINOS 30D */}
          <div className="bg-slate-50/75 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Dumbbell className="w-3 h-3 text-teal-600 shrink-0" />
                <span>Treinos {dados.periodoDias}d</span>
              </span>
              {dados.treinos.temDados ? (
                <span className="text-[10px] font-bold text-slate-400">
                  {dados.treinos.frequenciaSemanal}x/sem
                </span>
              ) : null}
            </div>

            {dados.treinos.temDados && dados.treinos.percentualAdesao !== null ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-black font-mono text-slate-900 leading-none">
                    {dados.treinos.percentualAdesao}%
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    adesão
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-slate-600 truncate">
                  {dados.treinos.diasAtivos} de {dados.treinos.metaEsperada} dias
                  ativos
                </p>
              </>
            ) : (
              <p className="text-[11px] font-medium text-slate-400 py-2">
                Sem registros no período
              </p>
            )}
          </div>

          {/* 5. FITA MÉTRICA */}
          <div className="bg-slate-50/75 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Ruler className="w-3 h-3 text-sky-600 shrink-0" />
                <span>Fita Métrica</span>
              </span>
              {dados.medidas.temDados && dados.medidas.ultimaAfericaoEm ? (
                <span className="text-[10px] font-semibold text-slate-400">
                  {new Date(dados.medidas.ultimaAfericaoEm).toLocaleDateString(
                    "pt-BR",
                    { timeZone: TIMEZONE_BR, day: "2-digit", month: "2-digit" }
                  )}
                </span>
              ) : null}
            </div>

            {dados.medidas.temDados ? (
              (() => {
                const cintAtual = dados.medidas.cintura.atualCm;
                const cintDelta = dados.medidas.cintura.variacaoCm;
                const hasRealCintDelta =
                  cintDelta !== null && Math.abs(cintDelta) >= 0.05;
                const isCintStable =
                  cintDelta !== null && Math.abs(cintDelta) < 0.05;

                const abdAtual = dados.medidas.abdomen.atualCm;
                const abdDelta = dados.medidas.abdomen.variacaoCm;
                const hasRealAbdDelta =
                  abdDelta !== null && Math.abs(abdDelta) >= 0.05;
                const isAbdStable =
                  abdDelta !== null && Math.abs(abdDelta) < 0.05;

                if (hasRealCintDelta || hasRealAbdDelta) {
                  return (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {hasRealCintDelta && cintDelta !== null ? (
                          <span
                            className={`text-sm font-black font-mono leading-tight ${
                              cintDelta < 0
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            Cint {formatDeltaCm(cintDelta)}
                          </span>
                        ) : null}
                        {hasRealAbdDelta && abdDelta !== null ? (
                          <span
                            className={`text-sm font-black font-mono leading-tight ${
                              abdDelta < 0
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            Abd {formatDeltaCm(abdDelta)}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 truncate">
                        {[
                          cintAtual !== null
                            ? `Cint ${formatCm(cintAtual)}${
                                isCintStable ? " (estável)" : ""
                              }`
                            : null,
                          abdAtual !== null
                            ? `Abd ${formatCm(abdAtual)}${
                                isAbdStable ? " (estável)" : ""
                              }`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </>
                  );
                }

                if (cintAtual !== null) {
                  const subtexto = isCintStable
                    ? abdAtual !== null
                      ? `Cintura · Abdômen ${formatCm(abdAtual)}`
                      : "Cintura estável vs aferição anterior"
                    : abdAtual !== null
                      ? `Abdômen ${formatCm(abdAtual)}`
                      : "Última aferição registrada";

                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-base font-black font-mono text-slate-900 leading-tight">
                          {formatCm(cintAtual)}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {isCintStable ? "Estável" : "Cintura"}
                        </span>
                      </div>
                      <p
                        className="text-[11px] font-medium text-slate-500 truncate"
                        title={subtexto}
                      >
                        {subtexto}
                      </p>
                    </>
                  );
                }

                if (abdAtual !== null) {
                  const subtexto = isAbdStable
                    ? "Abdômen estável vs aferição anterior"
                    : "Última aferição registrada";

                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-base font-black font-mono text-slate-900 leading-tight">
                          {formatCm(abdAtual)}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {isAbdStable ? "Estável" : "Abdômen"}
                        </span>
                      </div>
                      <p
                        className="text-[11px] font-medium text-slate-500 truncate"
                        title={subtexto}
                      >
                        {subtexto}
                      </p>
                    </>
                  );
                }

                return (
                  <p className="text-[11px] font-medium text-slate-400 py-2">
                    Aferição registrada
                  </p>
                );
              })()
            ) : (
              <p className="text-[11px] font-medium text-slate-400 py-2">
                Sem registros no período
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
