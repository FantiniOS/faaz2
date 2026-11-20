"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Moon,
  Droplets,
  Target,
  Scale,
  Activity,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Clock,
  Sparkles,
  Sliders,
  Loader2,
  Save,
  X,
  AlertCircle,
  Flame,
  Utensils,
  Dumbbell,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TIMEZONE_BR } from "@/lib/date-br";
import {
  CLINICAL_OBJECTIVES,
  DEFAULT_CLINICAL_OBJECTIVE,
} from "@/lib/clinical-objectives";
import {
  avaliarDistanciaPesoAlvo,
  avaliarVariacaoPeso,
  getConfigObjetivoClinico,
  normalizarObjetivoClinicoValor,
  resolverObjetivoAtivo,
} from "@/lib/objetivo-clinico";
import { invalidateClientCache } from "@/lib/client-swr-cache";

export interface MetasTabProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteMetaHidricaMl?: number;
  pacientePesoAtualKg?: number | string | null;
  pacienteAlturaCm?: number | string | null;
  objetivoAtual?: string | null;
  onObjetivoUpdated?: (novoObjetivo: string) => void;
  onMetasUpdated?: () => void;
  ultimoSonoInicial?: {
    id?: string;
    horas: number;
    qualidade: string;
    observacao?: string | null;
    data: string | Date;
  } | null;
}

interface ConstanciaAlimentar30d {
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
}

interface AdesaoTreinos30d {
  temDados: boolean;
  percentualAdesao: number;
  diasAtivos: number;
  metaEsperada: number;
  frequenciaSemanal: number;
  duracaoMin: number | null;
  modalidade: string | null;
  totalLogs: number;
  treinouHoje: boolean;
  checkinsHojeCount: number;
  ultimoTreinoEm: string | null;
}

interface MetasData {
  metas: {
    sonoHorasAlvo: number;
    aguaMlAlvo: number;
    pesoAlvoKg: number;
    passosAlvo: number;
    workoutFrequency?: number;
    workoutType?: string | null;
    workoutDuration?: number | null;
    focoMetabolico: string;
    treatmentObjective?: string;
  };
  ultimoSono?: {
    id?: string;
    horas: number;
    qualidade: string;
    observacao?: string | null;
    data: string | Date;
  } | null;
  horasDormidasRecentes?: number;
  sonoHistorico: Array<{
    dia: string;
    data: string;
    horas: number;
    meta: number;
    qualidade: string;
    sonoProfundoHoras?: number;
  }>;
  sonoMediaSemana: number;
  hidratacaoHoje: {
    consumidoMl: number;
    metaMl: number;
    percentual: number;
  };
  hidratacaoHistorico: Array<{
    dia: string;
    data: string;
    consumoMl: number;
    metaMl: number;
  }>;
  pesoEvolucao: {
    pesoInicialKg: number;
    pesoAtualKg: number;
    pesoAlvoKg: number;
    perdaTotalKg: number;
    distanciaAlvoKg: number;
    imcAtual: number;
    historico: Array<{
      data: string;
      peso: number;
    }>;
  };
  constanciaAlimentar30d?: ConstanciaAlimentar30d;
  adesaoTreinos30d?: AdesaoTreinos30d;
}

function getAdesaoBadgeClass(percentual: number | null, temDados: boolean): string {
  if (!temDados || percentual === null) {
    return "bg-slate-100 text-slate-600 border-slate-200";
  }
  if (percentual >= 75) {
    return "bg-emerald-50 text-emerald-800 border-emerald-200/80";
  }
  if (percentual >= 50) {
    return "bg-amber-50 text-amber-800 border-amber-200/80";
  }
  return "bg-rose-50 text-rose-800 border-rose-200/80";
}

function formatBrNum(val: number, decimals = 1): string {
  return val.toFixed(decimals).replace(".", ",");
}

export function MetasTab({
  pacienteId,
  pacienteNome,
  objetivoAtual,
  onObjetivoUpdated,
  onMetasUpdated,
  ultimoSonoInicial,
}: MetasTabProps) {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<MetasData | null>(null);
  const [isModalAjusteOpen, setIsModalAjusteOpen] = useState(false);
  const isModalAjusteOpenRef = useRef(false);
  const [isSavingMetas, setIsSavingMetas] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [salvandoObjetivo, setSalvandoObjetivo] = useState(false);
  const [objetivoSalvoRecently, setObjetivoSalvoRecently] = useState(false);
  const [toastMensagem, setToastMensagem] = useState<string | null>(null);
  const [toastTipo, setToastTipo] = useState<"success" | "error">("success");

  // Estados do formulário do modal "Ajustar Metas do Paciente" (somente metas reais ativas)
  const [formFoco, setFormFoco] = useState<string>(DEFAULT_CLINICAL_OBJECTIVE);
  const [formPesoAlvo, setFormPesoAlvo] = useState("");
  const [formAguaLitros, setFormAguaLitros] = useState("");
  const [formSonoHoras, setFormSonoHoras] = useState("");
  const [formWorkoutFreq, setFormWorkoutFreq] = useState("3");

  const showToast = useCallback(
    (msg: string, tipo: "success" | "error" = "success") => {
      setToastTipo(tipo);
      setToastMensagem(msg);
      setTimeout(() => setToastMensagem(null), 3500);
    },
    []
  );

  const syncFormFromMetas = useCallback((m: MetasData["metas"]) => {
    setFormSonoHoras(m.sonoHorasAlvo ? String(m.sonoHorasAlvo).replace(".", ",") : "");
    setFormAguaLitros(
      m.aguaMlAlvo ? (m.aguaMlAlvo / 1000).toFixed(1).replace(".", ",") : ""
    );
    setFormPesoAlvo(m.pesoAlvoKg ? String(m.pesoAlvoKg).replace(".", ",") : "");
    setFormWorkoutFreq(String(m.workoutFrequency ?? 3));
    setFormFoco(
      resolverObjetivoAtivo(m.treatmentObjective, m.focoMetabolico) ||
        DEFAULT_CLINICAL_OBJECTIVE
    );
  }, []);

  const carregarMetas = useCallback(
    async (silent: boolean = false) => {
      try {
        if (!silent) setIsLoading(true);
        const res = await fetch(`/api/pacientes/${pacienteId}/metas`, {
          cache: "no-store",
        });
        if (res.ok) {
          const json: MetasData = await res.json();
          setData(json);
          if (json.metas && !silent && !isModalAjusteOpenRef.current) {
            syncFormFromMetas(json.metas);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar metas do paciente:", err);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [pacienteId, syncFormFromMetas]
  );

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (!ativo) return;
      setMounted(true);
      void carregarMetas(false);
    });

    const interval = setInterval(() => {
      if (!isModalAjusteOpenRef.current) {
        void carregarMetas(true);
      }
    }, 3500);

    return () => {
      ativo = false;
      clearInterval(interval);
    };
  }, [carregarMetas]);

  function handleOpenModalAjuste() {
    if (data?.metas) {
      syncFormFromMetas({
        ...data.metas,
        treatmentObjective:
          resolverObjetivoAtivo(
            data.metas.treatmentObjective,
            data.metas.focoMetabolico,
            objetivoAtual
          ) || DEFAULT_CLINICAL_OBJECTIVE,
      });
    }
    setFormError(null);
    isModalAjusteOpenRef.current = true;
    setIsModalAjusteOpen(true);
  }

  function handleCloseModalAjuste() {
    if (isSavingMetas) return;
    isModalAjusteOpenRef.current = false;
    setIsModalAjusteOpen(false);
    setFormError(null);
  }

  async function handleChangeObjetivo(novoObjetivoRaw: string) {
    const novoObjetivo = normalizarObjetivoClinicoValor(novoObjetivoRaw);
    if (!novoObjetivo) return;

    const anterior = resolverObjetivoAtivo(
      data?.metas?.treatmentObjective,
      data?.metas?.focoMetabolico,
      objetivoAtual
    );

    try {
      setSalvandoObjetivo(true);
      // Atualização otimista imediata na aba Metas e no cabeçalho/Prontuário pai
      setData((prev) =>
        prev
          ? {
              ...prev,
              metas: {
                ...prev.metas,
                focoMetabolico: novoObjetivo,
                treatmentObjective: novoObjetivo,
              },
            }
          : null
      );
      setFormFoco(novoObjetivo);
      onObjetivoUpdated?.(novoObjetivo);

      const res = await fetch(`/api/pacientes/${pacienteId}/metas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatmentObjective: novoObjetivo,
          focoMetabolico: novoObjetivo,
        }),
      });

      if (res.ok) {
        // Invalida cache SWR do Command Center e lista de Pacientes para refletir na hora
        invalidateClientCache("telemetria:");
        invalidateClientCache("pacientes:");
        setObjetivoSalvoRecently(true);
        showToast("Objetivo do tratamento sincronizado com Prontuário, Dashboard e App!");
        onMetasUpdated?.();
        setTimeout(() => setObjetivoSalvoRecently(false), 3500);
      } else {
        // Reverte estado otimista em caso de erro
        if (anterior) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  metas: {
                    ...prev.metas,
                    focoMetabolico: anterior,
                    treatmentObjective: anterior,
                  },
                }
              : null
          );
          setFormFoco(anterior);
          onObjetivoUpdated?.(anterior);
        }
        showToast("Não foi possível atualizar o objetivo do tratamento.", "error");
      }
    } catch (err) {
      console.error("Erro ao atualizar objetivo do tratamento:", err);
      if (anterior) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                metas: {
                  ...prev.metas,
                  focoMetabolico: anterior,
                  treatmentObjective: anterior,
                },
              }
            : null
        );
        setFormFoco(anterior);
        onObjetivoUpdated?.(anterior);
      }
      showToast("Falha de conexão ao salvar o objetivo do tratamento.", "error");
    } finally {
      setSalvandoObjetivo(false);
    }
  }

  async function handleSalvarMetas(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parseDecimal = (raw: string): number => {
      const normalized = raw.trim().replace(",", ".");
      if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
      return Number.parseFloat(normalized);
    };

    const parseInteger = (raw: string): number => {
      const normalized = raw.trim().replace(",", ".");
      if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
      return Math.round(Number.parseFloat(normalized));
    };

    const objetivoLimpo = normalizarObjetivoClinicoValor(formFoco);
    const pesoAlvoVal = parseDecimal(formPesoAlvo);
    const aguaLitrosVal = parseDecimal(formAguaLitros);
    const sonoHorasVal = parseDecimal(formSonoHoras);
    const workoutFreqVal = parseInteger(formWorkoutFreq);

    if (!objetivoLimpo) {
      setFormError("Selecione o Objetivo do Tratamento (Diretriz Clínica).");
      return;
    }
    if (!Number.isFinite(pesoAlvoVal) || pesoAlvoVal < 35 || pesoAlvoVal > 250) {
      setFormError("Meta de Peso Alvo deve estar entre 35 e 250 kg.");
      return;
    }
    if (!Number.isFinite(aguaLitrosVal) || aguaLitrosVal < 1 || aguaLitrosVal > 6) {
      setFormError("Meta de Hidratação deve estar entre 1,0 e 6,0 L/dia.");
      return;
    }
    if (!Number.isFinite(sonoHorasVal) || sonoHorasVal < 4 || sonoHorasVal > 14) {
      setFormError("Meta de Sono deve estar entre 4 e 14 horas/noite.");
      return;
    }
    if (
      !Number.isFinite(workoutFreqVal) ||
      workoutFreqVal < 1 ||
      workoutFreqVal > 7
    ) {
      setFormError("Frequência Semanal de Treinos deve estar entre 1 e 7 dias/sem.");
      return;
    }

    const aguaMlVal = Math.round(aguaLitrosVal * 1000);

    try {
      setIsSavingMetas(true);
      const res = await fetch(`/api/pacientes/${pacienteId}/metas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatmentObjective: objetivoLimpo,
          focoMetabolico: objetivoLimpo,
          pesoAlvoKg: Math.round(pesoAlvoVal * 10) / 10,
          aguaMlAlvo: aguaMlVal,
          sonoHorasAlvo: Math.round(sonoHorasVal * 10) / 10,
          workoutFrequency: workoutFreqVal,
        }),
      });

      if (res.ok) {
        const resJson = await res.json().catch(() => null);
        if (resJson?.metas) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  metas: {
                    ...prev.metas,
                    ...resJson.metas,
                  },
                  hidratacaoHoje: {
                    ...prev.hidratacaoHoje,
                    metaMl: resJson.metas.aguaMlAlvo,
                    percentual:
                      resJson.metas.aguaMlAlvo > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (prev.hidratacaoHoje.consumidoMl /
                                resJson.metas.aguaMlAlvo) *
                                100
                            )
                          )
                        : 0,
                  },
                  pesoEvolucao: {
                    ...prev.pesoEvolucao,
                    pesoAlvoKg: resJson.metas.pesoAlvoKg,
                    distanciaAlvoKg:
                      prev.pesoEvolucao.pesoAtualKg > 0 &&
                      resJson.metas.pesoAlvoKg > 0
                        ? Math.round(
                            Math.abs(
                              prev.pesoEvolucao.pesoAtualKg -
                                resJson.metas.pesoAlvoKg
                            ) * 10
                          ) / 10
                        : 0,
                  },
                }
              : prev
          );
          syncFormFromMetas(resJson.metas);
        }

        // Propagação imediata para Prontuário, Termômetro, Dashboard e Pacientes
        invalidateClientCache("telemetria:");
        invalidateClientCache("pacientes:");
        onObjetivoUpdated?.(objetivoLimpo);
        onMetasUpdated?.();

        isModalAjusteOpenRef.current = false;
        setIsModalAjusteOpen(false);
        showToast("Metas clínicas atualizadas e sincronizadas com sucesso!");
        await carregarMetas(false);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setFormError(errJson.error || "Erro ao salvar metas.");
      }
    } catch (err) {
      console.error("Erro ao submeter metas:", err);
      setFormError("Falha de conexão ao salvar metas.");
    } finally {
      setIsSavingMetas(false);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex-1 min-h-[350px] flex flex-col items-center justify-center p-8 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600 mb-3" />
        <span className="text-xs font-semibold text-slate-600">
          Sincronizando metas e parâmetros fisiológicos...
        </span>
      </div>
    );
  }

  const metas = data?.metas || {
    sonoHorasAlvo: 0,
    aguaMlAlvo: 0,
    pesoAlvoKg: 0,
    passosAlvo: 0,
    workoutFrequency: 3,
    workoutType: null,
    workoutDuration: null,
    focoMetabolico: "",
    treatmentObjective: "",
  };

  const objetivoAtivo = resolverObjetivoAtivo(
    metas.treatmentObjective,
    metas.focoMetabolico,
    objetivoAtual
  );
  const configObjetivo = getConfigObjetivoClinico(objetivoAtivo);

  const ultimoSono = data?.ultimoSono ?? ultimoSonoInicial ?? null;
  const sonoHistorico = data?.sonoHistorico ?? [];
  const sonoMedia = data?.sonoMediaSemana ?? 0;
  const horasDormidasExibicao = ultimoSono ? Number(ultimoSono.horas) : sonoMedia;
  const sonoAderenciaPct =
    metas.sonoHorasAlvo > 0
      ? Math.round((horasDormidasExibicao / metas.sonoHorasAlvo) * 100)
      : 0;

  const hidratacaoHoje = data?.hidratacaoHoje || {
    consumidoMl: 0,
    metaMl: metas.aguaMlAlvo,
    percentual: 0,
  };
  const hidratacaoHistorico = data?.hidratacaoHistorico ?? [];

  const pesoEvolucao = data?.pesoEvolucao || {
    pesoInicialKg: 0,
    pesoAtualKg: 0,
    pesoAlvoKg: metas.pesoAlvoKg,
    perdaTotalKg: 0,
    distanciaAlvoKg: 0,
    imcAtual: 0,
    historico: [],
  };

  const variacaoPeso = avaliarVariacaoPeso(pesoEvolucao.perdaTotalKg, objetivoAtivo);
  const distanciaPesoAlvo = avaliarDistanciaPesoAlvo(
    pesoEvolucao.pesoAtualKg,
    pesoEvolucao.pesoAlvoKg,
    objetivoAtivo
  );

  const constanciaDieta: ConstanciaAlimentar30d = data?.constanciaAlimentar30d || {
    temDados: false,
    percentualAdesao: null,
    totalCheckins: 0,
    diasRegistrados: 0,
    seguiu: 0,
    trocasInteligentes: 0,
    naoFez: 0,
    opcionaisBonus: 0,
    gargalo: null,
  };

  const adesaoTreinos: AdesaoTreinos30d = data?.adesaoTreinos30d || {
    temDados: false,
    percentualAdesao: 0,
    diasAtivos: 0,
    metaEsperada: Math.max(1, Math.round(((metas.workoutFrequency ?? 3) / 7) * 30)),
    frequenciaSemanal: metas.workoutFrequency ?? 3,
    duracaoMin: metas.workoutDuration ?? null,
    modalidade: metas.workoutType ?? null,
    totalLogs: 0,
    treinouHoje: false,
    checkinsHojeCount: 0,
    ultimoTreinoEm: null,
  };

  const totalBreakdownDieta =
    constanciaDieta.seguiu +
    constanciaDieta.trocasInteligentes +
    constanciaDieta.naoFez;
  const pctSeguiuBar =
    totalBreakdownDieta > 0
      ? (constanciaDieta.seguiu / totalBreakdownDieta) * 100
      : 0;
  const pctTrocaBar =
    totalBreakdownDieta > 0
      ? (constanciaDieta.trocasInteligentes / totalBreakdownDieta) * 100
      : 0;
  const pctNaoFezBar =
    totalBreakdownDieta > 0
      ? (constanciaDieta.naoFez / totalBreakdownDieta) * 100
      : 0;

  const diretrizTreinoResumo = [
    adesaoTreinos.modalidade || "Treino prescrito",
    adesaoTreinos.duracaoMin ? `${adesaoTreinos.duracaoMin} min` : null,
    `${adesaoTreinos.frequenciaSemanal}x/sem`,
  ]
    .filter(Boolean)
    .join(" · ");

  const temDadosRegistrados =
    sonoHistorico.length > 0 ||
    hidratacaoHistorico.length > 0 ||
    pesoEvolucao.historico.length > 0 ||
    constanciaDieta.temDados ||
    adesaoTreinos.temDados;

  // Prévia em ml para o input de L/dia no modal
  const previewAguaMl = (() => {
    const parsed = Number.parseFloat(formAguaLitros.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 1000);
  })();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7 space-y-6 bg-slate-50/50">
      {/* TOAST DE FEEDBACK — CLINICAL LIGHT */}
      {toastMensagem && (
        <div
          className={`fixed top-16 right-8 z-50 cl-toast flex items-center gap-2 px-4 py-2.5 text-xs font-bold animate-in fade-in slide-in-from-top-4 ${
            toastTipo === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : ""
          }`}
        >
          {toastTipo === "error" ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{toastMensagem}</span>
        </div>
      )}

      {/* CABEÇALHO DO PAINEL DE METAS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              Acompanhamento de Metas & Parâmetros Fisiológicos
            </h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200/80">
              <Sparkles className="w-3 h-3 text-teal-600" />
              Sincronizado via App
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Monitoramento de constância alimentar, treinos, repouso, hidratação e evolução corporal de {pacienteNome}.
          </p>
        </div>

        {/* BOTÃO AJUSTAR METAS (TOPO DIREITO) */}
        <button
          type="button"
          onClick={handleOpenModalAjuste}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
        >
          <Sliders className="w-3.5 h-3.5 stroke-[2.4]" />
          <span>Ajustar Metas do Paciente</span>
        </button>
      </div>

      {/* GRID DE ACOMPANHAMENTO: 3 COLUNAS VISÃO 360 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* ======================================================== */}
        {/* CARD 1: QUALIDADE DO SONO                                 */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center border border-violet-100 shrink-0">
                  <Moon className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Qualidade do Sono
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Últimos 7 dias registrados
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold text-violet-800 bg-violet-50/90 border border-violet-200/80 px-2 py-0.5 rounded-lg">
                {metas.sonoHorasAlvo > 0
                  ? `Meta: ${formatBrNum(metas.sonoHorasAlvo)}h`
                  : "Nenhuma meta definida"}
              </span>
            </div>

            {/* Destaque Numérico */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {formatBrNum(horasDormidasExibicao)}h
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {ultimoSono ? "horas dormidas (app)" : "sem registros"}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  metas.sonoHorasAlvo > 0 && sonoAderenciaPct >= 85
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200/70"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {metas.sonoHorasAlvo > 0
                  ? `${sonoAderenciaPct}% da meta`
                  : "0% da meta"}
              </span>
            </div>

            {/* Aviso Dinâmico de Sincronização Mobile em Tempo Real */}
            {ultimoSono && (
              <div className="flex items-center justify-between text-[11px] font-medium px-2.5 py-1.5 rounded-xl bg-violet-50 text-violet-800 border border-violet-200/80">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                  <span>
                    Último Check-in: <strong>{formatBrNum(Number(ultimoSono.horas))}h</strong> ({ultimoSono.qualidade})
                  </span>
                </div>
                <span className="text-[10px] text-violet-600 font-mono">
                  {new Date(ultimoSono.data).toLocaleDateString("pt-BR", {
                    timeZone: TIMEZONE_BR,
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </div>
            )}

            {/* Gráfico Recharts de Sono dos 7 Dias ou Empty State */}
            <div className="w-full h-28 mt-2">
              {!mounted ? (
                <div className="h-full bg-slate-50 animate-pulse rounded-lg" />
              ) : sonoHistorico.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={sonoHistorico}
                    margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 12]}
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.96)",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        color: "#0f172a",
                        fontSize: "11px",
                        boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.12)",
                      }}
                      formatter={(val) => [`${val ?? ""} horas`, "Sono"]}
                      labelFormatter={(label) => `Dia: ${label}`}
                    />
                    {metas.sonoHorasAlvo > 0 && (
                      <ReferenceLine
                        y={metas.sonoHorasAlvo}
                        stroke="#c084fc"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="horas"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 1.5, stroke: "#ffffff" }}
                      activeDot={{ r: 5, fill: "#7c3aed" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-xl border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center px-3">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Aguardando primeiro check-in de sono
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé do Card de Sono */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Média semanal: <strong className="text-slate-700">{formatBrNum(sonoMedia)}h</strong>
            </span>
            <span className="font-bold text-violet-700">
              {ultimoSono ? `Qualidade: ${ultimoSono.qualidade}` : "Aguardando primeiro check-in"}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 2: META DE HIDRATAÇÃO DIÁRIA                         */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shrink-0">
                  <Droplets className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Meta de Hidratação
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Ingestão diária de água
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold text-sky-800 bg-sky-50/90 border border-sky-200/80 px-2 py-0.5 rounded-lg">
                {metas.aguaMlAlvo > 0
                  ? `Meta: ${formatBrNum(metas.aguaMlAlvo / 1000)}L / dia`
                  : "Nenhuma meta definida"}
              </span>
            </div>

            {/* Destaque Numérico */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {hidratacaoHoje.consumidoMl.toLocaleString("pt-BR")}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  / {metas.aguaMlAlvo} ml hoje
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  hidratacaoHoje.percentual >= 70
                    ? "bg-sky-50 text-sky-800 border border-sky-200/70"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {hidratacaoHoje.percentual}% concluído
              </span>
            </div>

            {/* Barra de Progresso do Dia */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, hidratacaoHoje.percentual)}%` }}
              />
            </div>

            {/* Mini Gráfico em Barras dos Últimos 7 Dias ou Empty State */}
            <div className="w-full h-24 mt-2">
              {!mounted ? (
                <div className="h-full bg-slate-50 animate-pulse rounded-lg" />
              ) : hidratacaoHistorico.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hidratacaoHistorico}
                    margin={{ top: 8, right: 6, left: -26, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, Math.max(3000, metas.aguaMlAlvo || 3000)]}
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.96)",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        color: "#0f172a",
                        fontSize: "11px",
                        boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.12)",
                      }}
                      formatter={(val) => [`${val ?? ""} ml`, "Consumo"]}
                      labelFormatter={(label) => `Dia: ${label}`}
                    />
                    {metas.aguaMlAlvo > 0 && (
                      <ReferenceLine
                        y={metas.aguaMlAlvo}
                        stroke="#38bdf8"
                        strokeDasharray="3 3"
                      />
                    )}
                    <Bar
                      dataKey="consumoMl"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-xl border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center px-3">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Aguardando primeiro check-in de hidratação
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé do Card de Hidratação */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">
              Check-ins: <strong className="text-slate-700">+250ml / +500ml</strong>
            </span>
            <span className="font-bold text-sky-700">
              {hidratacaoHoje.consumidoMl > 0
                ? "Aderência Positiva"
                : "Aguardando primeiro check-in"}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 3: META DE PESO CORPORAL (SEMÂNTICA POR OBJETIVO)   */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                  <Scale className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Meta de Peso Corporal
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400 truncate">
                    {configObjetivo.subtituloPeso}
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50/90 border border-emerald-200/80 px-2 py-0.5 rounded-lg shrink-0">
                {pesoEvolucao.pesoAlvoKg > 0
                  ? `Alvo: ${formatBrNum(pesoEvolucao.pesoAlvoKg)} kg`
                  : "Nenhuma meta definida"}
              </span>
            </div>

            {/* Destaque Numérico com Cor/Sinal Coerente ao Objetivo */}
            <div className="flex items-baseline justify-between gap-2 py-1">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {pesoEvolucao.pesoAtualKg > 0
                    ? `${formatBrNum(pesoEvolucao.pesoAtualKg)} kg`
                    : "0,0 kg"}
                </span>
                {pesoEvolucao.historico.length >= 2 && (
                  <span
                    className={`text-xs font-bold font-mono inline-flex items-center gap-0.5 ${variacaoPeso.textClass}`}
                    title={variacaoPeso.rotulo}
                  >
                    {variacaoPeso.direcao === "up" ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : variacaoPeso.direcao === "down" ? (
                      <TrendingDown className="w-3.5 h-3.5" />
                    ) : null}
                    <span>{variacaoPeso.sinalTexto}</span>
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${distanciaPesoAlvo.badgeClass}`}
              >
                {distanciaPesoAlvo.label}
              </span>
            </div>

            {/* Gráfico de Evolução Ponderal ou Empty State */}
            <div className="w-full h-28 mt-2">
              {!mounted ? (
                <div className="h-full bg-slate-50 animate-pulse rounded-lg" />
              ) : pesoEvolucao.historico.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={pesoEvolucao.historico}
                    margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="data"
                      tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={["dataMin - 1", "dataMax + 1"]}
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.96)",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        color: "#0f172a",
                        fontSize: "11px",
                        boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.12)",
                      }}
                      formatter={(val) => [`${val ?? ""} kg`, "Peso"]}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    {pesoEvolucao.pesoAlvoKg > 0 && (
                      <ReferenceLine
                        y={pesoEvolucao.pesoAlvoKg}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="peso"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#059669", strokeWidth: 1.5, stroke: "#ffffff" }}
                      activeDot={{ r: 5, fill: "#047857" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-xl border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center px-3">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Aguardando primeira pesagem registrada
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé do Card de Peso */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">
              IMC Atual:{" "}
              <strong className="text-slate-800 font-mono">
                {pesoEvolucao.imcAtual > 0 ? formatBrNum(pesoEvolucao.imcAtual) : "--"}
              </strong>
            </span>
            <span className={`font-bold ${configObjetivo.accentTextClass}`}>
              {pesoEvolucao.historico.length > 0
                ? `Foco: ${configObjetivo.rotuloCurto}`
                : "Sem medições"}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 4: FOCO METABÓLICO & DIRETRIZES (FONTE GLOBAL)      */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                  <Flame className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Foco Metabólico & Diretrizes
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Diretriz do protocolo FAAZ
                  </p>
                </div>
              </div>

              <span
                className={`text-[11px] font-bold border px-2 py-0.5 rounded-lg ${
                  objetivoAtivo
                    ? configObjetivo.badgeClass
                    : "text-amber-800 bg-amber-50/90 border-amber-200/80"
                }`}
              >
                {objetivoAtivo ? configObjetivo.rotuloCurto : "Pendente"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 my-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                  Objetivo do Tratamento (Diretriz Clínica)
                </span>
                {salvandoObjetivo && (
                  <span className="text-[10px] font-bold text-teal-700 flex items-center gap-1 animate-pulse shrink-0">
                    <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                  </span>
                )}
                {objetivoSalvoRecently && !salvandoObjetivo && (
                  <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sincronizado
                  </span>
                )}
              </div>

              <div className="relative">
                <select
                  value={objetivoAtivo || ""}
                  onChange={(e) => handleChangeObjetivo(e.target.value)}
                  disabled={salvandoObjetivo}
                  className="w-full text-xs font-bold text-amber-950 bg-white border border-amber-300 rounded-lg px-2.5 py-2 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer transition-all disabled:opacity-60"
                >
                  <option value="" disabled>
                    Nenhuma diretriz definida — Selecione...
                  </option>
                  {CLINICAL_OBJECTIVES.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                  {objetivoAtivo &&
                    !(CLINICAL_OBJECTIVES as readonly string[]).includes(
                      objetivoAtivo
                    ) && <option value={objetivoAtivo}>{objetivoAtivo}</option>}
                </select>
              </div>

              <p className="text-[10px] text-amber-900/75 font-medium leading-relaxed">
                Sincronizado em tempo real com Prontuário, Dashboard e App do paciente (Hoje, Evolução e Clínica).
              </p>
            </div>

            <div className="space-y-2 mt-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  Sinais Clínicos (30d)
                </span>
                <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {temDadosRegistrados ? "Registros Ativos" : "Aguardando check-in"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 font-medium">Orientação</span>
                <span className="text-[11px] font-semibold text-slate-700 text-right">
                  {configObjetivo.subtituloDiretriz}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Protocolo FAAZ</span>
            <span className="font-bold text-slate-700">
              {objetivoAtivo ? "Ativo e sincronizado" : "Sem diretriz definida"}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 5: CONSTÂNCIA ALIMENTAR (DIETA · 30D)               */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                  <Utensils className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
                    Constância Alimentar
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Dieta · últimos 30 dias
                  </p>
                </div>
              </div>

              <span
                className={`text-[11px] font-bold border px-2 py-0.5 rounded-lg shrink-0 ${getAdesaoBadgeClass(
                  constanciaDieta.percentualAdesao,
                  constanciaDieta.temDados
                )}`}
              >
                {constanciaDieta.temDados && constanciaDieta.percentualAdesao !== null
                  ? `${constanciaDieta.percentualAdesao}% aderência`
                  : "Sem check-ins"}
              </span>
            </div>

            {/* Destaque Numérico */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {constanciaDieta.temDados &&
                  constanciaDieta.percentualAdesao !== null
                    ? `${constanciaDieta.percentualAdesao}%`
                    : "--"}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {constanciaDieta.temDados
                    ? `${constanciaDieta.diasRegistrados} dia(s) ativo(s)`
                    : "sem registros"}
                </span>
              </div>
              {constanciaDieta.opcionaisBonus > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  +{constanciaDieta.opcionaisBonus} bônus
                </span>
              )}
            </div>

            {/* Barra Segmentada: Segui + Trocas Inteligentes + Não fiz */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex mt-1">
              {totalBreakdownDieta > 0 ? (
                <>
                  {pctSeguiuBar > 0 && (
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${pctSeguiuBar}%` }}
                      title={`Segui: ${constanciaDieta.seguiu}`}
                    />
                  )}
                  {pctTrocaBar > 0 && (
                    <div
                      className="bg-sky-500 h-full transition-all duration-500"
                      style={{ width: `${pctTrocaBar}%` }}
                      title={`Trocas Inteligentes: ${constanciaDieta.trocasInteligentes}`}
                    />
                  )}
                  {pctNaoFezBar > 0 && (
                    <div
                      className="bg-rose-400 h-full transition-all duration-500"
                      style={{ width: `${pctNaoFezBar}%` }}
                      title={`Não fiz: ${constanciaDieta.naoFez}`}
                    />
                  )}
                </>
              ) : null}
            </div>

            {/* Breakdown Limpo: Segui / Trocas Inteligentes / Não fiz */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 px-2.5 py-2 text-center">
                <span className="block text-base font-black font-mono text-emerald-700 leading-tight">
                  {constanciaDieta.seguiu}
                </span>
                <span className="text-[10px] font-bold text-emerald-800/80">
                  Segui
                </span>
              </div>
              <div className="rounded-xl bg-sky-50/70 border border-sky-200/70 px-2.5 py-2 text-center">
                <span className="block text-base font-black font-mono text-sky-700 leading-tight">
                  {constanciaDieta.trocasInteligentes}
                </span>
                <span className="text-[10px] font-bold text-sky-800/80">
                  Trocas Intel.
                </span>
              </div>
              <div className="rounded-xl bg-rose-50/70 border border-rose-200/70 px-2.5 py-2 text-center">
                <span className="block text-base font-black font-mono text-rose-700 leading-tight">
                  {constanciaDieta.naoFez}
                </span>
                <span className="text-[10px] font-bold text-rose-800/80">
                  Não fiz
                </span>
              </div>
            </div>

            {/* Indicador de Horário de Gargalo ou Sem Gargalos */}
            <div className="mt-3">
              {constanciaDieta.gargalo ? (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-bold block truncate">
                      Gargalo: {constanciaDieta.gargalo.label}
                    </span>
                    <span className="text-[10px] text-amber-800/80 font-medium">
                      {constanciaDieta.gargalo.naoFez} de{" "}
                      {constanciaDieta.gargalo.totalRegistros} registro(s) sem adesão
                    </span>
                  </div>
                </div>
              ) : constanciaDieta.temDados ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-[11px] font-semibold text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Sem gargalos críticos no período</span>
                </div>
              ) : (
                <div className="py-2.5 text-center text-[11px] font-semibold text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/60">
                  Aguardando check-ins alimentares no App
                </div>
              )}
            </div>
          </div>

          {/* Rodapé do Card de Dieta */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">Segui + Trocas = 100%</span>
            <span className="font-bold text-emerald-700 font-mono">
              {constanciaDieta.totalCheckins} check-in(s)
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 6: ADESÃO AOS TREINOS (30D)                         */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shrink-0">
                  <Dumbbell className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
                    Adesão aos Treinos
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Consistência · últimos 30 dias
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold text-teal-800 bg-teal-50/90 border border-teal-200/80 px-2 py-0.5 rounded-lg shrink-0">
                Meta: {adesaoTreinos.frequenciaSemanal}x / sem
              </span>
            </div>

            {/* Destaque Numérico */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {adesaoTreinos.temDados ? `${adesaoTreinos.percentualAdesao}%` : "0%"}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {adesaoTreinos.diasAtivos} de {adesaoTreinos.metaEsperada} dias ativos
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${getAdesaoBadgeClass(
                  adesaoTreinos.percentualAdesao,
                  adesaoTreinos.temDados
                )}`}
              >
                {adesaoTreinos.temDados
                  ? adesaoTreinos.percentualAdesao >= 75
                    ? "Consistente"
                    : adesaoTreinos.percentualAdesao >= 50
                      ? "Moderada"
                      : "Baixa"
                  : "Sem registros"}
              </span>
            </div>

            {/* Barra de Progresso de Adesão 30d */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-teal-500 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, adesaoTreinos.percentualAdesao)}%`,
                }}
              />
            </div>

            {/* Diretriz Prescrita (Modalidade · Duração · Frequência) */}
            <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/70 mt-3 space-y-1">
              <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wide block">
                Prescrição de Treino Ativa
              </span>
              <p className="text-xs font-extrabold text-teal-950 truncate" title={diretrizTreinoResumo}>
                {diretrizTreinoResumo}
              </p>
            </div>

            {/* Status do Check-in de Hoje */}
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-slate-600 font-semibold">Check-in de hoje</span>
                {adesaoTreinos.treinouHoje ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>
                      Concluído
                      {adesaoTreinos.checkinsHojeCount > 1
                        ? ` (${adesaoTreinos.checkinsHojeCount}x)`
                        : ""}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Pendente hoje</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Rodapé do Card de Treinos */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">
              {adesaoTreinos.ultimoTreinoEm
                ? `Último treino: ${new Date(
                    adesaoTreinos.ultimoTreinoEm
                  ).toLocaleDateString("pt-BR", {
                    timeZone: TIMEZONE_BR,
                    day: "2-digit",
                    month: "2-digit",
                  })}`
                : "Sem check-ins em 30d"}
            </span>
            <span className="font-bold text-teal-700 font-mono">
              {adesaoTreinos.totalLogs} sessão(ões)
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: AJUSTAR METAS DO PACIENTE (APENAS METAS REAIS)    */}
      {/* ======================================================== */}
      {isModalAjusteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header Clinical Light Glass */}
            <div className="cl-modal-header px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Sliders className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Ajustar Metas Clínicas de {pacienteNome}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModalAjuste}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulário controlado com apenas as 5 metas ativas no ecossistema */}
            <form onSubmit={handleSalvarMetas} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Objetivo do Tratamento (Diretriz Clínica) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-teal-600" />
                  <span>Objetivo do Tratamento (Diretriz Clínica) *</span>
                </label>
                <select
                  required
                  value={formFoco}
                  onChange={(e) => setFormFoco(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white cursor-pointer"
                >
                  {CLINICAL_OBJECTIVES.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                  {formFoco &&
                    !(CLINICAL_OBJECTIVES as readonly string[]).includes(formFoco) && (
                      <option value={formFoco}>{formFoco}</option>
                    )}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Sincronizado em tempo real com Prontuário, Dashboard e App do paciente
                </span>
              </div>

              {/* 2. Meta de Peso Alvo (kg) + 3. Meta de Hidratação (L/dia) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Meta de Peso Alvo (kg) *</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={formPesoAlvo}
                    onChange={(e) => setFormPesoAlvo(e.target.value)}
                    placeholder="Ex: 75,0"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Alvo traçado para a diretriz ativa
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-sky-600" />
                    <span>Meta de Hidratação (L/dia) *</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={formAguaLitros}
                    onChange={(e) => setFormAguaLitros(e.target.value)}
                    placeholder="Ex: 2,5"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {previewAguaMl
                      ? `Equivale a ${previewAguaMl.toLocaleString("pt-BR")} ml/dia no App`
                      : "Entre 1,0 e 6,0 L/dia"}
                  </span>
                </div>
              </div>

              {/* 4. Meta de Sono (horas/noite) + 5. Frequência Semanal de Treinos (dias/sem) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Moon className="w-3.5 h-3.5 text-violet-600" />
                    <span>Meta de Sono (horas/noite) *</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={formSonoHoras}
                    onChange={(e) => setFormSonoHoras(e.target.value)}
                    placeholder="Ex: 8,0"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Ideal adulto: entre 7,5h e 8,5h
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Dumbbell className="w-3.5 h-3.5 text-teal-600" />
                    <span>Frequência Semanal de Treinos (dias/sem) *</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={7}
                    step={1}
                    required
                    value={formWorkoutFreq}
                    onChange={(e) => setFormWorkoutFreq(e.target.value)}
                    placeholder="3"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Usada no cálculo de adesão (30d) e App
                  </span>
                </div>
              </div>

              {/* Ações do Modal */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseModalAjuste}
                  disabled={isSavingMetas}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingMetas}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingMetas ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando Metas...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 stroke-[2.4]" />
                      <span>Salvar Metas Clínicas</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
