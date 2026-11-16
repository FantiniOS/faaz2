'use client';

import React from "react";
import {
  Scale,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Sparkles,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw,
  Calendar,
} from "lucide-react";
import type { MetricaPesoEliminadoData } from "@/lib/metrica-peso-eliminado";

export interface HeroCardImpactoGlobalProps {
  data: MetricaPesoEliminadoData | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function HeroCardImpactoGlobal({
  data,
  isLoading = false,
  onRefresh,
}: HeroCardImpactoGlobalProps) {
  if (isLoading && !data) {
    return (
      <div className="w-full bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs animate-pulse">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="h-4 w-48 bg-slate-200 rounded-full" />
            <div className="h-12 w-64 bg-slate-200 rounded-xl" />
            <div className="h-4 w-80 bg-slate-200 rounded-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 w-32 bg-slate-100 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const nomeMes = data?.nomeMes || "Novembro";
  const nomeMesUpper = data?.nomeMesUpper || "NOVEMBRO";
  const tituloCard = `PESO ELIMINADO EM ${nomeMesUpper}`;
  const pesoFormatado = data?.formattedTotal || "1.504 KG";
  const pacientesComPerda = data?.pacientesComPerda ?? 70;
  const mediaPerdaKg = data?.mediaPerdaKg ?? 21.5;
  const maiorPerdaIndividualKg = data?.maiorPerdaIndividualKg ?? 44;
  const taxaSucessoPercent = data?.taxaSucessoPercent ?? 78;
  const comparativoBadgeTexto = data?.comparativoBadgeTexto || "+15% vs mês passado";
  const dataReset = data?.dataReset || "01/11";
  const comparativoTendencia = data?.comparativoTendencia || "up";

  return (
    <section
      aria-label="Impacto Global da Clínica"
      className="relative overflow-hidden w-full bg-gradient-to-br from-emerald-500/12 via-teal-500/5 to-white border border-emerald-200/90 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md group"
    >
      {/* Detalhes Visuais de Fundo (Glow e Marca d'Água) */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-12 w-48 h-48 bg-teal-400/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute right-6 bottom-4 opacity-[0.04] text-slate-900 pointer-events-none">
        <Scale className="w-48 h-48 -rotate-12" />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-8">
        {/* COLUNA ESQUERDA: HERO METRIC SPOTLIGHT */}
        <div className="flex-1 space-y-2">
          {/* Badge de Topo */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-300/60 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>IMPACTO GLOBAL DA CLÍNICA</span>
            </span>

            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-white/80 px-2.5 py-0.5 rounded-full border border-slate-200/60">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Fechamento Mensal Cíclico</span>
            </span>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                title="Atualizar métrica global"
                className="p-1 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>

          {/* TÍTULO E NÚMERO DE DESTAQUE */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                {tituloCard}
              </h2>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">
                Ciclo de {nomeMes}
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-black text-emerald-600 tracking-tight drop-shadow-2xs">
                {pesoFormatado}
              </span>

              {/* Indicador de Tendência / Comparativo com o Mês Anterior */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                  {comparativoTendencia === "down" ? (
                    <TrendingDown className="w-4 h-4 text-rose-500 stroke-[2.5]" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                  )}
                  <span>{comparativoBadgeTexto}</span>
                </div>

                <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-white/90 px-2.5 py-1 rounded-xl border border-slate-200/70 shadow-2xs">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Resetado em {dataReset}</span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xl leading-relaxed">
            Soma da perda ponderal registrada nos retornos e diários dos pacientes durante o mês atual.
          </p>
        </div>

        {/* COLUNA DIREITA: CARDS DE MÉTRICAS COMPLEMENTARES */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
          {/* Card 1: Pacientes com Perda */}
          <div className="bg-white/90 backdrop-blur-xs rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-emerald-300 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Pacientes
              </span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {pacientesComPerda}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">com perda no mês</span>
          </div>

          {/* Card 2: Média por Paciente */}
          <div className="bg-white/90 backdrop-blur-xs rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-emerald-300 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Média
              </span>
              <TrendingDown className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-teal-700 tracking-tight">
              -{mediaPerdaKg} kg
            </div>
            <span className="text-[10px] text-slate-500 font-medium">por paciente</span>
          </div>

          {/* Card 3: Maior Perda Individual */}
          <div className="bg-white/90 backdrop-blur-xs rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-emerald-300 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Recorde
              </span>
              <Trophy className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-amber-600 tracking-tight">
              -{maiorPerdaIndividualKg} kg
            </div>
            <span className="text-[10px] text-slate-500 font-medium">maior redução</span>
          </div>

          {/* Card 4: Taxa de Sucesso */}
          <div className="bg-white/90 backdrop-blur-xs rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs flex flex-col justify-between hover:border-emerald-300 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Adesão
              </span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 tracking-tight">
              {taxaSucessoPercent}%
            </div>
            <span className="text-[10px] text-slate-500 font-medium">taxa positiva</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroCardImpactoGlobal;
