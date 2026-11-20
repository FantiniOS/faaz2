"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Moon,
  Droplets,
  Target,
  Scale,
  Footprints,
  Activity,
  CheckCircle2,
  TrendingDown,
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
  Zap,
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
import { CLINICAL_OBJECTIVES } from "@/lib/clinical-objectives";

export interface MetasTabProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteMetaHidricaMl?: number;
  pacientePesoAtualKg?: number | string | null;
  pacienteAlturaCm?: number | string | null;
  ultimoSonoInicial?: {
    id?: string;
    horas: number;
    qualidade: string;
    observacao?: string | null;
    data: string | Date;
  } | null;
}

interface MetasData {
  metas: {
    sonoHorasAlvo: number;
    aguaMlAlvo: number;
    pesoAlvoKg: number;
    passosAlvo: number;
    caloriasAlvo?: number;
    caloriasBonusAlvo?: number;
    pontosAlvo?: number;
    pontosBonusAlvo?: number;
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
  caloriasConsumidasHoje?: number;
  caloriasGastasTreino?: number;
  treinosHoje?: Array<{
    id: string;
    titulo: string;
    calorias: number;
    data?: string | Date;
  }>;
}

export function MetasTab({
  pacienteId,
  pacienteNome,
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

  // Estados do formulário mantidos como string durante a digitação
  const [formSonoHoras, setFormSonoHoras] = useState("");
  const [formAguaMl, setFormAguaMl] = useState("");
  const [formPesoAlvo, setFormPesoAlvo] = useState("");
  const [formCaloriasAlvo, setFormCaloriasAlvo] = useState("");
  const [formCaloriasBonus, setFormCaloriasBonus] = useState("");
  const [formFoco, setFormFoco] = useState<string>(CLINICAL_OBJECTIVES[0]);

  const syncFormFromMetas = useCallback((m: MetasData["metas"]) => {
    setFormSonoHoras(m.sonoHorasAlvo ? String(m.sonoHorasAlvo) : "");
    setFormAguaMl(m.aguaMlAlvo ? String(m.aguaMlAlvo) : "");
    setFormPesoAlvo(m.pesoAlvoKg ? String(m.pesoAlvoKg) : "");
    const cal = m.caloriasAlvo ?? m.pontosAlvo ?? 0;
    setFormCaloriasAlvo(cal ? String(cal) : "");
    const bonus = m.caloriasBonusAlvo ?? m.pontosBonusAlvo ?? 0;
    setFormCaloriasBonus(bonus ? String(bonus) : "");
    setFormFoco(
      m.treatmentObjective ||
        m.focoMetabolico ||
        CLINICAL_OBJECTIVES[0]
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
          const json = await res.json();
          setData(json);
          // Não sobrescreve os campos enquanto o modal estiver aberto ou durante polling silencioso
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

    // Sincronização em tempo real (polling silencioso) sem sobrescrever digitação ativa no modal
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
      syncFormFromMetas(data.metas);
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

  async function handleChangeObjetivo(novoObjetivo: string) {
    try {
      setSalvandoObjetivo(true);
      // Atualização otimista
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

      const res = await fetch(`/api/pacientes/${pacienteId}/metas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatmentObjective: novoObjetivo,
          focoMetabolico: novoObjetivo,
        }),
      });

      if (res.ok) {
        setObjetivoSalvoRecently(true);
        setTimeout(() => setObjetivoSalvoRecently(false), 3000);
      }
    } catch (err) {
      console.error("Erro ao atualizar objetivo do tratamento:", err);
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

    const sonoHorasVal = parseDecimal(formSonoHoras);
    const aguaMlVal = parseInteger(formAguaMl);
    const pesoAlvoVal = parseDecimal(formPesoAlvo);
    const caloriasAlvoVal = parseInteger(formCaloriasAlvo);
    const caloriasBonusVal = parseInteger(formCaloriasBonus);

    if (!Number.isFinite(sonoHorasVal) || sonoHorasVal < 4 || sonoHorasVal > 14) {
      setFormError("Meta de Sono deve estar entre 4 e 14 horas/noite.");
      return;
    }
    if (!Number.isFinite(aguaMlVal) || aguaMlVal < 1000 || aguaMlVal > 6000) {
      setFormError("Meta de Água deve estar entre 1000 e 6000 ml/dia.");
      return;
    }
    if (!Number.isFinite(pesoAlvoVal) || pesoAlvoVal < 35 || pesoAlvoVal > 250) {
      setFormError("Peso Alvo deve estar entre 35 e 250 kg.");
      return;
    }
    if (!Number.isFinite(caloriasAlvoVal) || caloriasAlvoVal < 500 || caloriasAlvoVal > 6000) {
      setFormError("Meta Calórica Diária deve estar entre 500 e 6000 kcal.");
      return;
    }
    if (!Number.isFinite(caloriasBonusVal) || caloriasBonusVal < 0 || caloriasBonusVal > 2000) {
      setFormError("Meta de Gasto Calórico deve estar entre 0 e 2000 kcal.");
      return;
    }

    try {
      setIsSavingMetas(true);
      const res = await fetch(`/api/pacientes/${pacienteId}/metas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sonoHorasAlvo: Math.round(sonoHorasVal * 10) / 10,
          aguaMlAlvo: aguaMlVal,
          pesoAlvoKg: Math.round(pesoAlvoVal * 10) / 10,
          caloriasAlvo: caloriasAlvoVal,
          caloriasBonusAlvo: caloriasBonusVal,
          pontosAlvo: caloriasAlvoVal, // compatibilidade
          pontosBonusAlvo: caloriasBonusVal, // compatibilidade
          focoMetabolico: formFoco.trim(),
          treatmentObjective: formFoco.trim(),
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
                    percentual: Math.min(
                      100,
                      Math.round(
                        (prev.hidratacaoHoje.consumidoMl /
                          resJson.metas.aguaMlAlvo) *
                          100
                      )
                    ),
                  },
                  pesoEvolucao: {
                    ...prev.pesoEvolucao,
                    pesoAlvoKg: resJson.metas.pesoAlvoKg,
                    distanciaAlvoKg: Math.max(
                      0,
                      Math.round(
                        (prev.pesoEvolucao.pesoAtualKg -
                          resJson.metas.pesoAlvoKg) *
                          10
                      ) / 10
                    ),
                  },
                }
              : prev
          );
          syncFormFromMetas(resJson.metas);
        }
        isModalAjusteOpenRef.current = false;
        setIsModalAjusteOpen(false);
        setToastMensagem("Metas clínicas atualizadas com sucesso!");
        setTimeout(() => setToastMensagem(null), 3500);
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
    caloriasAlvo: 0,
    caloriasBonusAlvo: 0,
    pontosAlvo: 0,
    pontosBonusAlvo: 0,
    focoMetabolico: "",
    treatmentObjective: "",
  };

  const metaCalorias = metas.caloriasAlvo ?? metas.pontosAlvo ?? 0;
  const metaCaloriasBonus = metas.caloriasBonusAlvo ?? metas.pontosBonusAlvo ?? 0;
  const caloriasConsumidas = data?.caloriasConsumidasHoje ?? 0;
  const saldoCaloricoRestante = Math.max(0, metaCalorias - caloriasConsumidas);
  const percentualCalorico =
    metaCalorias > 0
      ? Math.min(100, Math.round((caloriasConsumidas / metaCalorias) * 100))
      : 0;

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

  const caloriasGastasTreino = data?.caloriasGastasTreino ?? 0;
  const treinosHoje = data?.treinosHoje ?? [];

  const temDadosRegistrados =
    sonoHistorico.length > 0 ||
    hidratacaoHistorico.length > 0 ||
    pesoEvolucao.historico.length > 0 ||
    treinosHoje.length > 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7 space-y-6 bg-slate-50/50">
      {/* TOAST DE FEEDBACK — CLINICAL LIGHT */}
      {toastMensagem && (
        <div className="fixed top-16 right-8 z-50 cl-toast flex items-center gap-2 px-4 py-2.5 text-xs font-bold animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
            Monitoramento de aderência metabólica, qualidade do repouso e hidratação de {pacienteNome}.
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
                  ? `Meta: ${metas.sonoHorasAlvo.toFixed(1)}h`
                  : "Nenhuma meta definida"}
              </span>
            </div>

            {/* Destaque Numérico */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {horasDormidasExibicao.toFixed(1)}h
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
                    Último Check-in: <strong>{Number(ultimoSono.horas).toFixed(1)}h</strong> ({ultimoSono.qualidade})
                  </span>
                </div>
                <span className="text-[10px] text-violet-600 font-mono">
                  {new Date(ultimoSono.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
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
              Média semanal: <strong className="text-slate-700">{sonoMedia.toFixed(1)}h</strong>
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
                  ? `Meta: ${(metas.aguaMlAlvo / 1000).toFixed(1)}L / dia`
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
        {/* CARD 3: META DE PESO & COMPOSIÇÃO CORPORAL                */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                  <Scale className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Meta de Peso Corporal
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Curva de emagrecimento saudável
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50/90 border border-emerald-200/80 px-2 py-0.5 rounded-lg">
                {pesoEvolucao.pesoAlvoKg > 0
                  ? `Alvo: ${pesoEvolucao.pesoAlvoKg.toFixed(1)} kg`
                  : "Nenhuma meta definida"}
              </span>
            </div>

            {/* Destaque Numérico */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {pesoEvolucao.pesoAtualKg > 0
                    ? `${pesoEvolucao.pesoAtualKg.toFixed(1)} kg`
                    : "0.0 kg"}
                </span>
                {pesoEvolucao.perdaTotalKg !== 0 && (
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-0.5">
                    <TrendingDown className="w-3.5 h-3.5" />
                    {pesoEvolucao.perdaTotalKg} kg
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {pesoEvolucao.pesoAlvoKg > 0 && pesoEvolucao.pesoAtualKg > 0
                  ? `Falta ${pesoEvolucao.distanciaAlvoKg} kg`
                  : "Sem peso alvo"}
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
                {pesoEvolucao.imcAtual > 0 ? pesoEvolucao.imcAtual : "--"}
              </strong>
            </span>
            <span className="font-bold text-emerald-700">
              {pesoEvolucao.historico.length > 0
                ? "Em acompanhamento"
                : "Sem medições"}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 4: FOCO METABÓLICO & DIRETRIZES                     */}
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

              <span className="text-[11px] font-bold text-amber-800 bg-amber-50/90 border border-amber-200/80 px-2 py-0.5 rounded-lg">
                {metas.treatmentObjective || metas.focoMetabolico ? "Ativo" : "Pendente"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 my-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                  Objetivo do Tratamento (Diretriz Clínica)
                </span>
                {salvandoObjetivo && (
                  <span className="text-[10px] font-bold text-teal-700 flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Atualizando...
                  </span>
                )}
                {objetivoSalvoRecently && (
                  <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sincronizado no App
                  </span>
                )}
              </div>

              <div className="relative">
                <select
                  value={metas.treatmentObjective || metas.focoMetabolico || ""}
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
                </select>
              </div>

              <p className="text-[10px] text-amber-900/70 font-medium">
                Sincronizado automaticamente com a tela de Perfil do paciente no aplicativo.
              </p>
            </div>

            <div className="space-y-2 mt-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  Frequência de Aderência
                </span>
                <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {temDadosRegistrados ? "Registros Ativos" : "Aguardando primeiro check-in"}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Protocolo de Longevidade</span>
            <span className="font-bold text-slate-700">
              {metas.treatmentObjective || metas.focoMetabolico ? "Configurado" : "Sem meta definida"}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 5: META CALÓRICA DIÁRIA (NUTRIÇÃO)                  */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 shrink-0">
                  <Utensils className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Meta Calórica Diária
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Planejamento nutricional e déficit calórico
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold text-orange-800 bg-orange-50/90 border border-orange-200/80 px-2 py-0.5 rounded-lg">
                {metaCalorias > 0 ? `Meta: ${metaCalorias} kcal` : "Nenhuma meta definida"}
              </span>
            </div>

            {/* Destaque Numérico: Saldo Diário de Calorias vs Consumidas */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {caloriasConsumidas}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  / {metaCalorias} kcal consumidas
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {metaCalorias > 0
                  ? `Restam ${saldoCaloricoRestante} kcal`
                  : "0 kcal"}
              </span>
            </div>

            {/* Barra de Progresso do Consumo Calórico */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
              <div
                className="bg-orange-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${percentualCalorico}%` }}
              />
            </div>

            {/* Detalhamento de Calorias do Dia */}
            <div className="space-y-2 mt-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Meta Calórica Base</span>
                <span className="font-bold font-mono text-slate-800">{metaCalorias} kcal</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Calorias Consumidas</span>
                <span className="font-bold font-mono text-orange-600">{caloriasConsumidas} kcal</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Saldo Restante Disponível</span>
                <span className="font-extrabold font-mono text-emerald-700">
                  {saldoCaloricoRestante} kcal
                </span>
              </div>
            </div>
          </div>

          {/* Rodapé do Card */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">Diretriz Nutricional em kcal</span>
            <span className="font-bold text-orange-700">
              {metaCalorias > 0 ? "Meta Definida" : "Nenhuma meta definida"}
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 6: TREINO & GASTO CALÓRICO (EXERCÍCIOS)              */}
        {/* ======================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors">
          <div>
            {/* Header do Card */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shrink-0">
                  <Dumbbell className="w-4 h-4 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Treino & Gasto Calórico
                  </h3>
                  <p className="text-[10px] font-medium text-slate-400">
                    Exercícios e gasto energético ativo
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-bold text-teal-800 bg-teal-50/90 border border-teal-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Zap className="w-3 h-3 text-teal-600" />
                {metaCaloriasBonus > 0
                  ? `Meta: +${metaCaloriasBonus} kcal`
                  : "Nenhuma meta definida"}
              </span>
            </div>

            {/* Destaque Numérico: Gasto Calórico em Treinos */}
            <div className="flex items-baseline justify-between py-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-teal-600 tracking-tight font-mono">
                  +{caloriasGastasTreino}
                </span>
                <span className="text-xs font-bold text-teal-800">
                  KCAL GASTAS NO TREINO
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {caloriasGastasTreino > 0 ? "Treino Registrado" : "0 kcal hoje"}
              </span>
            </div>

            {/* Visual Explicativo: Aumenta o Déficit Calórico */}
            <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/60 my-1 space-y-1">
              <div className="flex items-center gap-1.5 text-teal-900 font-extrabold text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Exercícios Potencializam o Déficit Calórico</span>
              </div>
              <p className="text-[10px] text-teal-800 font-medium leading-relaxed">
                Cada sessão de exercício contribui para o gasto energético total do paciente, acelerando a queima calórica e preservando o tecido muscular.
              </p>
            </div>

            {/* Detalhes de Treinos do Dia (Reais ou Empty State) */}
            <div className="space-y-2 mt-2 text-xs">
              {treinosHoje.length > 0 ? (
                treinosHoje.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-1 border-b border-slate-100"
                  >
                    <span className="text-slate-600 font-medium">{t.titulo}</span>
                    <span className="font-extrabold font-mono text-teal-700">
                      +{t.calorias} kcal gastas
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-2 text-center text-[11px] font-semibold text-slate-400 border border-dashed border-slate-200 rounded-lg bg-slate-50/60">
                  Aguardando primeiro check-in de treino
                </div>
              )}
            </div>
          </div>

          {/* Rodapé do Card */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">
              Gasto Adicional Total:{" "}
              <strong className="text-teal-700">+{caloriasGastasTreino} kcal</strong>
            </span>
            <span className="font-bold text-teal-700">
              {caloriasGastasTreino > 0 ? "Queima Ativa" : "Sem registros hoje"}
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: AJUSTAR METAS DO PACIENTE                          */}
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

            {/* Formulário controlado com estado string para digitação livre */}
            <form onSubmit={handleSalvarMetas} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Meta de Sono */}
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
                    placeholder="8,0"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Ideal adulto: entre 7.5h e 8.5h
                  </span>
                </div>

                {/* Meta de Hidratação */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-sky-600" />
                    <span>Meta de Água (ml/dia) *</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={formAguaMl}
                    onChange={(e) => setFormAguaMl(e.target.value)}
                    placeholder="2500"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Sincroniza com botões do App
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Meta de Peso Alvo */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Peso Alvo Desejado (kg) *</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={formPesoAlvo}
                    onChange={(e) => setFormPesoAlvo(e.target.value)}
                    placeholder="75,0"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Alvo traçado no plano nutricional
                  </span>
                </div>

                {/* Meta Calórica Diária (Alimentação) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Utensils className="w-3.5 h-3.5 text-orange-600" />
                    <span>Meta Calórica Diária (kcal) *</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={formCaloriasAlvo}
                    onChange={(e) => setFormCaloriasAlvo(e.target.value)}
                    placeholder="2000"
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Meta diária base de calorias do plano alimentar
                  </span>
                </div>
              </div>

              {/* Meta de Gasto Calórico via Treino */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Dumbbell className="w-3.5 h-3.5 text-teal-600" />
                  <span>Meta de Gasto Calórico via Treino (kcal) *</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={formCaloriasBonus}
                  onChange={(e) => setFormCaloriasBonus(e.target.value)}
                  placeholder="300"
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 bg-white"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Calorias adicionais gastas via exercícios e atividades
                </span>
              </div>

              {/* Objetivo do Tratamento */}
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
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Sincronizado diretamente com a tela de Perfil do app do paciente
                </span>
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
