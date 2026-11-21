"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Activity,
  RefreshCw,
  Clock,
  Sparkles,
  Stethoscope,
  ShieldAlert,
  ArrowUpRight,
  Radio,
} from "lucide-react";
import {
  formatarDataBR,
  formatarDataCurtaBR,
  getHoraBR,
} from "@/lib/date-br";

export interface CheckinIntestinalItem {
  id: string;
  pacienteId: string;
  tipoBristol: number;
  categoria: "constipacao" | "ideal" | "diarreia" | string;
  sintomas: string[];
  data: string | Date;
}

interface CardBristolWidgetProps {
  pacienteId?: string;
  pacienteNome?: string;
  onOpenProntuario?: () => void;
  pollingIntervalMs?: number; // Padrão: 5000ms (5 segundos)
}

const bristolDefinitions: Record<
  number,
  { label: string; clinicalTerm: string }
> = {
  1: { label: "Bolinhas duras e separadas", clinicalTerm: "Constipação Severa" },
  2: { label: "Salsicha empedrada e firme", clinicalTerm: "Constipação Leve" },
  3: { label: "Salsicha com rachaduras", clinicalTerm: "Fisiológico Regular" },
  4: { label: "Salsicha lisa e macia", clinicalTerm: "Normofisiológico Ideal ⭐" },
  5: { label: "Pedaços macios e separados", clinicalTerm: "Tendência a Hipermotilidade" },
  6: { label: "Pastoso e esfarrapado", clinicalTerm: "Diarreia Leve / Trânsito Rápido" },
  7: { label: "Totalmente líquido", clinicalTerm: "Diarreia Aguda Severa" },
};

export function CardBristolWidget({
  pacienteId = "carlos-faaz-001",
  pacienteNome = "Carlos Eduardo Fantini",
  onOpenProntuario,
  pollingIntervalMs = 5000,
}: CardBristolWidgetProps) {
  const [checkins, setCheckins] = useState<CheckinIntestinalItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isRecentlyUpdated, setIsRecentlyUpdated] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const prevLatestIdRef = useRef<string | null>(null);

  // Busca na API com suporte a modo silencioso (polling de 5s) e no-store para evitar cache HTTP
  const fetchCheckins = useCallback(
    async (isManualOrInitial = false) => {
      try {
        if (isManualOrInitial) {
          setIsRefreshing(true);
        }

        const res = await fetch(
          `/api/checkins/intestino?pacienteId=${encodeURIComponent(
            pacienteId
          )}&limit=4`,
          {
            cache: "no-store", // Garante que a requisição não seja servida por cache
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          }
        );

        if (!res.ok) return;

        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const newData = json.data as CheckinIntestinalItem[];

          // Detecta se houve novo check-in do paciente via mobile
          if (newData.length > 0) {
            const currentLatestId = newData[0].id;
            if (
              prevLatestIdRef.current &&
              prevLatestIdRef.current !== currentLatestId
            ) {
              // Notifica visualmente a chegada de novo registro sem F5
              setIsRecentlyUpdated(true);
              setTimeout(() => setIsRecentlyUpdated(false), 3500);
            }
            prevLatestIdRef.current = currentLatestId;
          }

          setCheckins(newData);
        }
      } catch (err) {
        console.error("[CardBristolWidget] Erro no polling de checkins:", err);
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
        setLastRefreshed(new Date());
      }
    },
    [pacienteId]
  );

  // EFEITO DE POLLING AUTOMÁTICO A CADA 5 SEGUNDOS
  useEffect(() => {
    let ativo = true;
    // 1. Chamada imediata ao montar
    void Promise.resolve().then(() => {
      if (ativo) void fetchCheckins(true);
    });

    // 2. Intervalo de atualização automática contínua
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchCheckins(false);
      }
    }, pollingIntervalMs);

    return () => {
      ativo = false;
      clearInterval(intervalId);
    };
  }, [fetchCheckins, pollingIntervalMs]);

  const hasRecordToday = checkins.length > 0;

  // Se ainda não houver check-ins de hoje no banco (Reset diário), exibe estado calmo inicial
  const latest: CheckinIntestinalItem = hasRecordToday
    ? checkins[0]
    : {
        id: "vazio-hoje",
        pacienteId,
        tipoBristol: 4,
        categoria: "ideal",
        sintomas: [],
        data: "2026-11-02T00:00:00.000Z",
      };

  const isIdeal = latest.categoria === "ideal";
  const isConstipacao = hasRecordToday && latest.categoria === "constipacao";
  const isDiarreia = hasRecordToday && latest.categoria === "diarreia";
  const isAlert = isConstipacao || isDiarreia;

  const formattedDate = formatarDataBR(latest.data, {
    day: "2-digit",
    month: "short",
    year: undefined,
  });
  const formattedTime = getHoraBR(latest.data);

  return (
    <div
      className={`relative w-full rounded-2xl border transition-all duration-500 shadow-sm overflow-hidden ${
        isRecentlyUpdated
          ? "ring-4 ring-emerald-500/80 scale-[1.005]"
          : isIdeal
          ? "bg-white border-emerald-100 hover:border-emerald-200"
          : isConstipacao
          ? "bg-amber-50/30 border-amber-300 ring-2 ring-amber-300/60 shadow-amber-100/50"
          : "bg-rose-50/30 border-rose-300 ring-2 ring-rose-400/60 shadow-rose-100/50"
      }`}
    >
      {/* TOAST DE NOVO REGISTRO CHEGANDO DO APP SEM F5 */}
      {isRecentlyUpdated && (
        <div className="bg-emerald-600 text-white px-4 py-2 flex items-center justify-between text-xs font-black animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 animate-spin text-emerald-200" />
            <span>✨ Novo check-in intestinal recebido do aplicativo do paciente!</span>
          </div>
          <span className="text-[10px] font-semibold opacity-90">Atualizado agora</span>
        </div>
      )}

      {/* BARRA SUPERIOR DE ALERTA PULSANTE SE FOR CONSTIPAÇÃO OU DIARREIA */}
      {isAlert && !isRecentlyUpdated && (
        <div
          className={`w-full py-1.5 px-4 flex items-center justify-between text-xs font-black tracking-wide uppercase ${
            isConstipacao
              ? "bg-amber-500 text-white animate-pulse"
              : "bg-rose-600 text-white animate-pulse"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            <span>
              {isConstipacao
                ? "Atenção Clínica: Constipação Reportada"
                : "Alerta Urgente: Diarreia / Trânsito Hiperacelerado"}
            </span>
          </div>
          <span className="text-[10px] tracking-normal font-semibold lowercase">
            notificação em tempo real
          </span>
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-5">
        {/* CABEÇALHO DO WIDGET COM BRANDING CLÍNICA FAAZ */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border shadow-xs ${
                isIdeal
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : isConstipacao
                  ? "bg-amber-100 border-amber-300 text-amber-800"
                  : "bg-rose-100 border-rose-300 text-rose-800"
              }`}
            >
              <Stethoscope className="w-5 h-5 stroke-[2.2]" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">
                  Clínica FAAZ • Gastroenterologia
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[10px] font-bold text-teal-700">
                  Módulo #08
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Saúde Intestinal (Escala de Bristol)
              </h3>
            </div>
          </div>

          {/* STATUS DE POLLING EM TEMPO REAL & BOTÃO MANUAL */}
          <div className="flex items-center gap-2">
            {/* BADGE DE SINCRONIZAÇÃO AUTOMÁTICA (POLLING A CADA 5s) */}
            <div
              title="Atualização automática ativa a cada 5 segundos via polling"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100/90 border border-slate-200 text-slate-600 text-[11px] font-bold shadow-2xs"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Ao Vivo (5s)</span>
            </div>

            <button
              onClick={() => fetchCheckins(true)}
              disabled={isRefreshing}
              title="Forçar recarga manual agora"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  isRefreshing ? "animate-spin text-emerald-600" : ""
                }`}
              />
            </button>

            {isIdeal ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Normofisiológico</span>
              </div>
            ) : (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-xs ${
                  isConstipacao
                    ? "bg-amber-100 border border-amber-300 text-amber-900"
                    : "bg-rose-100 border border-rose-300 text-rose-900"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 animate-bounce" />
                <span>{isConstipacao ? "Constipação" : "Diarreia"}</span>
              </div>
            )}
          </div>
        </div>

        {/* CARD CENTRAL: ÚLTIMO CHECK-IN REGISTRADO */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 ${
            isIdeal
              ? "bg-emerald-50/50 border-emerald-100"
              : isConstipacao
              ? "bg-white border-amber-200 shadow-sm"
              : "bg-white border-rose-200 shadow-sm"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Último Registro do Paciente:
              </span>
              <span className="text-xs font-black text-slate-900">
                {pacienteNome}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {formattedDate} às {formattedTime}
              </span>
            </div>
          </div>

          <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Bloco Tipo de Bristol */}
            <div className="flex items-center gap-3.5">
              <div
                className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black shadow-xs shrink-0 transition-transform ${
                  isRecentlyUpdated ? "scale-110" : ""
                } ${
                  isIdeal
                    ? "bg-emerald-600 text-white"
                    : isConstipacao
                    ? "bg-amber-500 text-white"
                    : "bg-rose-600 text-white"
                }`}
              >
                <span className="text-[10px] leading-none uppercase font-bold opacity-80">
                  Tipo
                </span>
                <span className="text-2xl leading-none mt-0.5">
                  {latest.tipoBristol}
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-extrabold text-slate-900">
                    {bristolDefinitions[latest.tipoBristol]?.clinicalTerm ||
                      `Tipo ${latest.tipoBristol}`}
                  </h4>
                  {isIdeal && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      Padrão Ouro
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  {bristolDefinitions[latest.tipoBristol]?.label ||
                    "Registro clínico da escala de Bristol"}
                </p>
              </div>
            </div>

            {/* SE HOUVER ALERTA: DESTAQUE IMEDIATO DOS SINTOMAS NA TELA DO MÉDICO */}
            {isAlert && (
              <div
                className={`p-3 rounded-xl border max-w-sm ${
                  isConstipacao
                    ? "bg-amber-50 border-amber-200"
                    : "bg-rose-50 border-rose-200"
                }`}
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wider block mb-1 text-slate-700">
                  Sintomas Reportados pelo Paciente:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {latest.sintomas && latest.sintomas.length > 0 ? (
                    latest.sintomas.map((s, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-md ${
                          isConstipacao
                            ? "bg-amber-200/80 text-amber-950 border border-amber-300"
                            : "bg-rose-200/80 text-rose-950 border border-rose-300"
                        }`}
                      >
                        ⚠️ {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-medium text-slate-600 italic">
                      Nenhum sintoma adicional informado (apenas consistência
                      alterada).
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* REGISTROS ANTERIORES (MINI TIMELINE CLÍNICA) */}
        {checkins.length > 1 && (
          <div className="space-y-2">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Histórico Recente Sincronizado (Mobile):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {checkins.slice(1, 4).map((item) => {
                const itemIdeal = item.categoria === "ideal";
                const dia = formatarDataCurtaBR(item.data);
                const hora = getHoraBR(item.data);

                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black px-1.5 py-0.5 rounded ${
                          itemIdeal
                            ? "bg-emerald-100 text-emerald-800"
                            : item.categoria === "constipacao"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        T{item.tipoBristol}
                      </span>
                      <span className="text-xs font-medium text-slate-600">
                        {dia} às {hora}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold ${
                        itemIdeal ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {item.categoria}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RODAPÉ DO WIDGET: CONDUTA CLÍNICA & ATALHOS */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>
              {isIdeal
                ? "Paciente com boa adesão às metas de hidratação e fibras."
                : isConstipacao
                ? "Recomendação: Ajustar aporte hídrico (+500ml) e fibra solúvel."
                : "Recomendação: Avaliar sensibilidade alimentar e repor eletrólitos."}
            </span>
          </div>

          {onOpenProntuario && (
            <button
              onClick={onOpenProntuario}
              className="inline-flex items-center gap-1 font-bold text-teal-700 hover:text-teal-800 self-end sm:self-auto"
            >
              <span>Ver no Prontuário</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CardBristolWidget;
