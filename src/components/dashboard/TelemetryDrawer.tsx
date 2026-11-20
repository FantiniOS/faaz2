"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Calendar,
  Droplets,
  Dumbbell,
  ExternalLink,
  Gauge,
  HeartPulse,
  Radio,
  Scale,
  ShieldAlert,
  Utensils,
  X,
} from "lucide-react";
import type { TelemetriaDashboardResponse } from "@/types/dashboard-telemetria";
import { formatarDataHoraBR } from "@/lib/date-br";

export type DrawerModuloKey =
  | "indice"
  | "impacto"
  | "consultas"
  | "glicemia"
  | "dieta"
  | "intestino"
  | "hidratacao_treinos"
  | "radar"
  | "live_feed";

export interface PacienteAtalhoProntuario {
  id: string;
  nome: string;
  recordCode?: string;
  cpf?: string;
  telefone?: string;
}

interface TelemetryDrawerProps {
  modulo: DrawerModuloKey | null;
  dados: TelemetriaDashboardResponse | null;
  onClose: () => void;
  onOpenProntuario: (paciente: PacienteAtalhoProntuario) => void;
}

function pluralizar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function formatDataHoraCurta(iso?: string | null): string {
  return formatarDataHoraBR(iso);
}

function formatTempoRelativo(iso?: string | null): string {
  if (!iso) return "Sem registro recente";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "--";
  const diffMin = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 60000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `há ${diffD}d`;
}

const TITULO_MODULO: Record<
  DrawerModuloKey,
  { titulo: string; subtitulo: string; icon: React.ElementType }
> = {
  indice: {
    titulo: "Índice Clínico Global",
    subtitulo: "Composição real dos pilares ativos no período",
    icon: Gauge,
  },
  impacto: {
    titulo: "Impacto Corporal por Objetivo",
    subtitulo: "Evolução real segmentada por Emagrecimento e Hipertrofia",
    icon: Scale,
  },
  consultas: {
    titulo: "Agenda de Consultas Próximas",
    subtitulo: "Atendimentos futuros registrados em AGENDAMENTOS",
    icon: Calendar,
  },
  glicemia: {
    titulo: "Telemetria Glicêmica Detalhada",
    subtitulo: "Leituras capilares reais e alertas críticos (<70 ou >180)",
    icon: HeartPulse,
  },
  dieta: {
    titulo: "Adesão Alimentar & Trocas Inteligentes",
    subtitulo: "Detalhamento de check-ins de refeição por paciente",
    icon: Utensils,
  },
  intestino: {
    titulo: "Saúde Intestinal (Escala de Bristol)",
    subtitulo: "Padrão predominante e sintomas reportados por paciente",
    icon: Activity,
  },
  hidratacao_treinos: {
    titulo: "Hidratação & Treinos",
    subtitulo: "Volume hídrico e frequência de treinos vs. metas reais",
    icon: Droplets,
  },
  radar: {
    titulo: "Radar de Triagem Clínica",
    subtitulo: "Pacientes priorizados por criticidade, atenção e evasão",
    icon: ShieldAlert,
  },
  live_feed: {
    titulo: "Live Telemetry Stream",
    subtitulo: "Últimos sinais recebidos em tempo real do App Mobile",
    icon: Radio,
  },
};

export function TelemetryDrawer({
  modulo,
  dados,
  onClose,
  onOpenProntuario,
}: TelemetryDrawerProps) {
  const [impactoSubTab, setImpactoSubTab] = useState<
    "emagrecimento" | "hipertrofia"
  >("emagrecimento");
  const [radarFiltro, setRadarFiltro] = useState<
    "TODOS" | "CRITICO" | "ATENCAO" | "EVASAO"
  >("TODOS");

  useEffect(() => {
    if (!modulo) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modulo, onClose]);

  const meta = modulo ? TITULO_MODULO[modulo] : null;
  const HeaderIcon = meta?.icon ?? Gauge;

  const panelClass = "bg-white border-l border-slate-200 text-slate-900";
  const cardClass =
    "bg-slate-50/80 border border-slate-200/90 hover:border-emerald-300 hover:bg-white";
  const mutedText = "text-slate-500";

  return (
    <AnimatePresence>
      {modulo && dados && meta ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs"
          />

          {/* Slide-over Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className={`relative z-10 w-full max-w-xl h-full flex flex-col shadow-2xl ${panelClass}`}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/90 flex items-start justify-between gap-4 shrink-0">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-700">
                  <HeaderIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                    Drill-Down • {dados.periodoLabel}
                  </span>
                  <h2 className="text-base font-extrabold tracking-tight text-slate-900 mt-0.5">
                    {meta.titulo}
                  </h2>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>
                    {meta.subtitulo}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Fechar detalhes"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* 1. ÍNDICE CLÍNICO GLOBAL */}
              {modulo === "indice" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl p-4 border bg-emerald-50/70 border-emerald-200">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                        Score Global Ponderado
                      </span>
                      <span className="text-3xl font-black font-mono text-slate-900 tabular-nums">
                        {dados.resumo.indiceClinicoGlobal !== null
                          ? `${dados.resumo.indiceClinicoGlobal}/100`
                          : "Sem base"}
                      </span>
                    </div>
                    <p className={`text-xs mt-1.5 ${mutedText}`}>
                      Calculado exclusivamente a partir dos pilares que possuem
                      registros reais no Oracle ADB neste período.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {dados.resumo.pilaresIndice.map((pilar) => (
                      <div
                        key={pilar.chave}
                        className={`rounded-xl p-3.5 transition-colors ${cardClass}`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
                          <span>{pilar.rotulo}</span>
                          <span className="font-mono tabular-nums text-emerald-700">
                            {pilar.ativo && pilar.score !== null
                              ? `${pilar.score}%`
                              : "Sem registros"}
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden bg-slate-200">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                            style={{
                              width: `${
                                pilar.ativo && pilar.score !== null
                                  ? pilar.score
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <div
                          className={`flex items-center justify-between text-[11px] mt-1.5 ${mutedText}`}
                        >
                          <span>Peso clínico: {pilar.peso}%</span>
                          <span>
                            {pilar.ativo
                              ? "Incluído na média ponderada"
                              : "Ignorado (sem dados no período)"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 2. IMPACTO CORPORAL */}
              {modulo === "impacto" ? (
                <div className="space-y-4">
                  <div className="inline-flex p-1 rounded-xl border bg-slate-100 border-slate-200">
                    {(["emagrecimento", "hipertrofia"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setImpactoSubTab(tab)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          impactoSubTab === tab
                            ? "bg-white text-emerald-800 border border-emerald-200/80 shadow-2xs"
                            : `${mutedText} hover:text-slate-800`
                        }`}
                      >
                        {tab === "emagrecimento"
                          ? `Emagrecimento (${dados.impactoCorporal.emagrecimento.pacientesComReducao})`
                          : `Hipertrofia (${dados.impactoCorporal.hipertrofia.totalPacientesAtivos})`}
                      </button>
                    ))}
                  </div>

                  {impactoSubTab === "emagrecimento" ? (
                    dados.impactoCorporal.emagrecimento.detalhes.length === 0 ? (
                      <EmptyDrawerState texto="Nenhuma redução ponderal registrada no período selecionado." />
                    ) : (
                      <div className="space-y-2.5">
                        {dados.impactoCorporal.emagrecimento.detalhes.map(
                          (item) => (
                            <div
                              key={item.pacienteId}
                              className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">
                                  {item.nome}
                                </p>
                                <p className={`text-xs mt-0.5 ${mutedText}`}>
                                  {item.pesoAnteriorKg.toFixed(1).replace(".", ",")} kg →{" "}
                                  {item.pesoAtualKg.toFixed(1).replace(".", ",")} kg
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-sm font-black font-mono text-emerald-600 tabular-nums">
                                  -{item.reducaoKg.toFixed(1).replace(".", ",")} kg
                                </span>
                                <OpenProntuarioBtn
                                  onClick={() =>
                                    onOpenProntuario({
                                      id: item.pacienteId,
                                      nome: item.nome,
                                      recordCode: item.recordCode,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )
                  ) : dados.impactoCorporal.hipertrofia.detalhes.length === 0 ? (
                    <EmptyDrawerState texto="Nenhum paciente ativo com objetivo de Hipertrofia cadastrado." />
                  ) : (
                    <div className="space-y-2.5">
                      {dados.impactoCorporal.hipertrofia.detalhes.map(
                        (item) => (
                          <div
                            key={item.pacienteId}
                            className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {item.nome}
                              </p>
                              <p className={`text-xs mt-0.5 ${mutedText}`}>
                                {item.pesoAtualKg !== null
                                  ? `Peso atual: ${item.pesoAtualKg
                                      .toFixed(1)
                                      .replace(".", ",")} kg`
                                  : "Sem pesagem recente"}
                                {item.deltaBracoCm !== null
                                  ? ` · Braço ${
                                      item.deltaBracoCm >= 0 ? "+" : ""
                                    }${item.deltaBracoCm
                                      .toFixed(1)
                                      .replace(".", ",")} cm`
                                  : ""}
                                {item.deltaCoxaCm !== null
                                  ? ` · Coxa ${
                                      item.deltaCoxaCm >= 0 ? "+" : ""
                                    }${item.deltaCoxaCm
                                      .toFixed(1)
                                      .replace(".", ",")} cm`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span
                                className={`text-sm font-black font-mono tabular-nums ${
                                  (item.deltaPesoKg ?? 0) > 0
                                    ? "text-emerald-600"
                                    : mutedText
                                }`}
                              >
                                {item.deltaPesoKg !== null
                                  ? `${item.deltaPesoKg > 0 ? "+" : ""}${item.deltaPesoKg
                                      .toFixed(1)
                                      .replace(".", ",")} kg`
                                  : "Base"}
                              </span>
                              <OpenProntuarioBtn
                                onClick={() =>
                                  onOpenProntuario({
                                    id: item.pacienteId,
                                    nome: item.nome,
                                    recordCode: item.recordCode,
                                  })
                                }
                              />
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {/* 3. CONSULTAS PRÓXIMAS */}
              {modulo === "consultas" ? (
                dados.resumo.consultasAgendadas.proximas.length === 0 ? (
                  <EmptyDrawerState texto="Nenhuma consulta futura agendada no Oracle." />
                ) : (
                  <div className="space-y-2.5">
                    {dados.resumo.consultasAgendadas.proximas.map((c) => (
                      <div
                        key={c.id}
                        className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {c.pacienteNome}
                          </p>
                          <p className={`text-xs mt-0.5 ${mutedText}`}>
                            {formatDataHoraCurta(c.dataHora)} · {c.tipo} ·{" "}
                            {c.medicoNome}
                          </p>
                        </div>
                        <OpenProntuarioBtn
                          onClick={() =>
                            onOpenProntuario({
                              id: c.pacienteId,
                              nome: c.pacienteNome,
                              recordCode: c.pacienteRecordCode,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : null}

              {/* 4. GLICEMIA */}
              {modulo === "glicemia" ? (
                dados.glicemia.detalhesPorPaciente.length === 0 ? (
                  <EmptyDrawerState texto="Nenhuma medição glicêmica registrada no período selecionado." />
                ) : (
                  <div className="space-y-2.5">
                    {dados.glicemia.detalhesPorPaciente.map((item) => (
                      <div
                        key={item.pacienteId}
                        className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {item.nome}
                            </p>
                            {item.alertasCriticos > 0 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                                {pluralizar(
                                  item.alertasCriticos,
                                  "alerta",
                                  "alertas"
                                )}
                              </span>
                            ) : null}
                          </div>
                          <p className={`text-xs mt-0.5 ${mutedText}`}>
                            Média: {item.mediaMgDl} mg/dL · Última:{" "}
                            {item.ultimoValor} mg/dL ·{" "}
                            {pluralizar(item.medicoes, "medição", "medições")} ·{" "}
                            {formatTempoRelativo(item.ultimaData)}
                          </p>
                        </div>
                        <OpenProntuarioBtn
                          onClick={() =>
                            onOpenProntuario({
                              id: item.pacienteId,
                              nome: item.nome,
                              recordCode: item.recordCode,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : null}

              {/* 5. DIETA */}
              {modulo === "dieta" ? (
                dados.dieta.detalhesPorPaciente.length === 0 ? (
                  <EmptyDrawerState texto="Nenhum check-in de refeição registrado no período." />
                ) : (
                  <div className="space-y-2.5">
                    {dados.dieta.gargaloPrincipal ? (
                      <div className="rounded-xl p-3.5 border flex items-center gap-2.5 bg-amber-50 border-amber-200 text-amber-800">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-semibold">
                          Principal gargalo clínico:{" "}
                          <strong>{dados.dieta.gargaloPrincipal.label}</strong> (
                          {dados.dieta.gargaloPrincipal.percentualAdesao}% adesão
                          em{" "}
                          {pluralizar(
                            dados.dieta.gargaloPrincipal.totalRegistros,
                            "registro",
                            "registros"
                          )}
                          )
                        </span>
                      </div>
                    ) : null}
                    {dados.dieta.detalhesPorPaciente.map((item) => (
                      <div
                        key={item.pacienteId}
                        className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {item.nome}
                          </p>
                          <p className={`text-xs mt-0.5 ${mutedText}`}>
                            Segui: {item.seguiu} · Trocas: {item.trocas} · Não
                            fiz: {item.naoFez} (
                            {pluralizar(
                              item.totalCheckins,
                              "check-in",
                              "check-ins"
                            )}
                            )
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-black font-mono text-emerald-600 tabular-nums">
                            {item.percentualAdesao !== null
                              ? `${item.percentualAdesao}%`
                              : "--"}
                          </span>
                          <OpenProntuarioBtn
                            onClick={() =>
                              onOpenProntuario({
                                id: item.pacienteId,
                                nome: item.nome,
                                recordCode: item.recordCode,
                              })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : null}

              {/* 6. INTESTINO */}
              {modulo === "intestino" ? (
                dados.intestino.detalhesPorPaciente.length === 0 ? (
                  <EmptyDrawerState texto="Nenhum registro da Escala de Bristol no período." />
                ) : (
                  <div className="space-y-2.5">
                    {dados.intestino.detalhesPorPaciente.map((item) => (
                      <div
                        key={item.pacienteId}
                        className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {item.nome}
                            </p>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                item.padraoPredominante === "ideal"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : item.padraoPredominante === "constipacao"
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              Tipo {item.ultimoTipo} ·{" "}
                              {item.padraoPredominante === "ideal"
                                ? "Ideal"
                                : item.padraoPredominante === "constipacao"
                                  ? "Constipação"
                                  : "Diarreia"}
                            </span>
                          </div>
                          <p className={`text-xs mt-0.5 ${mutedText}`}>
                            {pluralizar(
                              item.totalRegistros,
                              "registro",
                              "registros"
                            )}{" "}
                            ·{" "}
                            {item.sintomasRecentes.length > 0
                              ? `Sintomas: ${item.sintomasRecentes.join(", ")}`
                              : "Sem sintomas reportados"}
                          </p>
                        </div>
                        <OpenProntuarioBtn
                          onClick={() =>
                            onOpenProntuario({
                              id: item.pacienteId,
                              nome: item.nome,
                              recordCode: item.recordCode,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : null}

              {/* 7. HIDRATAÇÃO & TREINOS */}
              {modulo === "hidratacao_treinos" ? (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-cyan-700">
                      <Droplets className="w-4 h-4" />
                      <span>
                        Hidratação (
                        {pluralizar(
                          dados.hidratacaoETreinos.hidratacao
                            .detalhesPorPaciente.length,
                          "paciente",
                          "pacientes"
                        )}
                        )
                      </span>
                    </div>
                    {dados.hidratacaoETreinos.hidratacao.detalhesPorPaciente
                      .length === 0 ? (
                      <EmptyDrawerState texto="Sem check-ins de hidratação no período." />
                    ) : (
                      dados.hidratacaoETreinos.hidratacao.detalhesPorPaciente.map(
                        (item) => (
                          <div
                            key={item.pacienteId}
                            className={`rounded-xl p-3 flex items-center justify-between gap-3 ${cardClass}`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {item.nome}
                              </p>
                              <p className={`text-xs ${mutedText}`}>
                                Média {item.volumeMedioDiarioMl} ml/dia · Meta{" "}
                                {item.metaDiariaMl} ml ·{" "}
                                {pluralizar(item.diasRegistrados, "dia", "dias")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="text-sm font-black font-mono text-cyan-700 tabular-nums">
                                {item.percentual}%
                              </span>
                              <OpenProntuarioBtn
                                onClick={() =>
                                  onOpenProntuario({
                                    id: item.pacienteId,
                                    nome: item.nome,
                                    recordCode: item.recordCode,
                                  })
                                }
                              />
                            </div>
                          </div>
                        )
                      )
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-700">
                      <Dumbbell className="w-4 h-4" />
                      <span>
                        Treinos (
                        {pluralizar(
                          dados.hidratacaoETreinos.treinos.detalhesPorPaciente
                            .length,
                          "paciente ativo",
                          "pacientes ativos"
                        )}
                        )
                      </span>
                    </div>
                    {dados.hidratacaoETreinos.treinos.detalhesPorPaciente
                      .length === 0 ? (
                      <EmptyDrawerState texto="Sem check-ins de treino no período." />
                    ) : (
                      dados.hidratacaoETreinos.treinos.detalhesPorPaciente.map(
                        (item) => (
                          <div
                            key={item.pacienteId}
                            className={`rounded-xl p-3 flex items-center justify-between gap-3 ${cardClass}`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {item.nome}
                              </p>
                              <p className={`text-xs ${mutedText}`}>
                                {item.diasAtivos} de {item.metaEsperada}{" "}
                                {item.metaEsperada === 1
                                  ? "dia ativo"
                                  : "dias ativos"}{" "}
                                · {item.modalidade}
                              </p>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="text-sm font-black font-mono text-emerald-600 tabular-nums">
                                {item.percentualAdesao}%
                              </span>
                              <OpenProntuarioBtn
                                onClick={() =>
                                  onOpenProntuario({
                                    id: item.pacienteId,
                                    nome: item.nome,
                                    recordCode: item.recordCode,
                                  })
                                }
                              />
                            </div>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              ) : null}

              {/* 8. RADAR DE TRIAGEM */}
              {modulo === "radar" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(["TODOS", "CRITICO", "ATENCAO", "EVASAO"] as const).map(
                      (sev) => (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setRadarFiltro(sev)}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                            radarFiltro === sev
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70"
                          }`}
                        >
                          {sev === "TODOS"
                            ? `Todos (${dados.radarTriagem.length})`
                            : sev === "CRITICO"
                              ? `Crítico (${
                                  dados.radarTriagem.filter(
                                    (r) => r.severidade === "CRITICO"
                                  ).length
                                })`
                              : sev === "ATENCAO"
                                ? `Atenção (${
                                    dados.radarTriagem.filter(
                                      (r) => r.severidade === "ATENCAO"
                                    ).length
                                  })`
                                : `Evasão (${
                                    dados.radarTriagem.filter(
                                      (r) => r.severidade === "EVASAO"
                                    ).length
                                  })`}
                        </button>
                      )
                    )}
                  </div>

                  {dados.radarTriagem.filter(
                    (r) =>
                      radarFiltro === "TODOS" || r.severidade === radarFiltro
                  ).length === 0 ? (
                    <EmptyDrawerState texto="Nenhum paciente nesta categoria de triagem." />
                  ) : (
                    <div className="space-y-2.5">
                      {dados.radarTriagem
                        .filter(
                          (r) =>
                            radarFiltro === "TODOS" ||
                            r.severidade === radarFiltro
                        )
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                    item.severidade === "CRITICO"
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : item.severidade === "ATENCAO"
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : "bg-slate-100 text-slate-600 border-slate-200"
                                  }`}
                                >
                                  {item.severidade}
                                </span>
                                <p className="text-sm font-bold text-slate-900 truncate">
                                  {item.nome}
                                </p>
                              </div>
                              <p className="text-xs font-semibold text-slate-800 mt-1">
                                {item.motivo}
                              </p>
                              <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                                {item.detalhe} ·{" "}
                                {formatTempoRelativo(item.ultimoSinalEm)}
                              </p>
                            </div>
                            <OpenProntuarioBtn
                              onClick={() =>
                                onOpenProntuario({
                                  id: item.pacienteId,
                                  nome: item.nome,
                                  recordCode: item.recordCode,
                                  cpf: item.cpf,
                                  telefone: item.telefone,
                                })
                              }
                            />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* 9. LIVE TELEMETRY FEED */}
              {modulo === "live_feed" ? (
                dados.liveFeed.length === 0 ? (
                  <EmptyDrawerState texto="Nenhum sinal recebido do App Mobile neste período." />
                ) : (
                  <div className="space-y-2.5">
                    {dados.liveFeed.map((ev) => (
                      <div
                        key={ev.id}
                        className={`rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors ${cardClass}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {ev.pacienteNome}
                            </span>
                            <span className={`text-[10px] ${mutedText}`}>
                              {formatDataHoraCurta(ev.timestamp)}
                            </span>
                          </div>
                          <p className={`text-xs mt-1 ${mutedText}`}>
                            {ev.resumo}
                          </p>
                        </div>
                        <OpenProntuarioBtn
                          onClick={() =>
                            onOpenProntuario({
                              id: ev.pacienteId,
                              nome: ev.pacienteNome,
                              recordCode: ev.pacienteRecordCode,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function OpenProntuarioBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shrink-0 border bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
    >
      <span>Prontuário</span>
      <ExternalLink className="w-3 h-3" />
    </button>
  );
}

function EmptyDrawerState({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
      <p className="text-xs font-semibold">{texto}</p>
    </div>
  );
}
