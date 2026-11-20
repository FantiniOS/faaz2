"use client";

import React, { useState, useEffect } from "react";
import {
  Dumbbell,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Save,
  Loader2,
  Sparkles,
  Flame,
  Activity,
  Heart,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { getDataDiaBR, subtrairDiasDataBR, TIMEZONE_BR } from "@/lib/date-br";

export interface TreinosTabProps {
  pacienteId: string;
  pacienteNome: string;
}

interface AdesaoData {
  diasAtivosUltimos30Dias: number;
  metaEsperada30Dias: number;
  porcentagemAdesao: number;
  frequenciaSemanal: number;
  totalLogs: number;
  historicoCheckins: { id: string; data: string | Date }[];
}

const OPCOES_ATIVIDADE = [
  { valor: "Musculação", rotulo: "Musculação / Força", icone: "🏋️" },
  { valor: "Aeróbico", rotulo: "Aeróbico / Cardio", icone: "🏃" },
  { valor: "HIIT", rotulo: "HIIT (Alta Intensidade)", icone: "⚡" },
  { valor: "Pilates", rotulo: "Pilates / Mobilidade", icone: "🧘" },
  { valor: "Misto", rotulo: "Misto (Força + Cardio)", icone: "🔥" },
  { valor: "Funcional", rotulo: "Treinamento Funcional", icone: "🎯" },
  { valor: "Natação", rotulo: "Natação / Hidroginástica", icone: "🏊" },
  { valor: "Caminhada Orientada", rotulo: "Caminhada Orientada", icone: "🚶" },
];

export function TreinosTab({ pacienteId, pacienteNome }: TreinosTabProps) {
  const [tipoAtividade, setTipoAtividade] = useState<string>("Musculação");
  const [frequenciaDias, setFrequenciaDias] = useState<number>(3);
  const [duracaoMinutos, setDuracaoMinutos] = useState<number>(45);
  const [restricoes, setRestricoes] = useState<string>("");

  const [adesao, setAdesao] = useState<AdesaoData>({
    diasAtivosUltimos30Dias: 0,
    metaEsperada30Dias: 13,
    porcentagemAdesao: 0,
    frequenciaSemanal: 3,
    totalLogs: 0,
    historicoCheckins: [],
  });

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [hojeIsoBR, setHojeIsoBR] = useState<string>("");

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) setHojeIsoBR(getDataDiaBR());
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Carrega as diretrizes do paciente e o histórico de adesão
  useEffect(() => {
    let isMounted = true;

    async function carregarDados() {
      if (!pacienteId) return;
      try {
        setCarregando(true);
        const res = await fetch(`/api/pacientes/${encodeURIComponent(pacienteId)}/treinos`, {
          cache: "no-store",
        });

        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.sucesso) {
            if (json.diretrizes) {
              setTipoAtividade(json.diretrizes.workoutType || "Musculação");
              setFrequenciaDias(json.diretrizes.workoutFrequency ?? 3);
              setDuracaoMinutos(json.diretrizes.workoutDuration ?? 45);
              setRestricoes(json.diretrizes.workoutRestrictions || "");
            }
            if (json.adesao) {
              setAdesao(json.adesao);
            }
          }
        }
      } catch (err) {
        console.error("[TreinosTab] Erro ao carregar dados:", err);
      } finally {
        if (isMounted) setCarregando(false);
      }
    }

    carregarDados();

    return () => {
      isMounted = false;
    };
  }, [pacienteId]);

  // Salva as diretrizes médicas
  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSalvando(true);
      setMensagemSucesso(null);
      setMensagemErro(null);

      const res = await fetch(`/api/pacientes/${encodeURIComponent(pacienteId)}/treinos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutType: tipoAtividade,
          workoutFrequency: Number(frequenciaDias),
          workoutDuration: Number(duracaoMinutos),
          workoutRestrictions: restricoes,
        }),
      });

      const json = await res.json();

      if (res.ok && json.sucesso) {
        setMensagemSucesso("Diretrizes de treino salvas com sucesso!");
        setTimeout(() => setMensagemSucesso(null), 4000);
      } else {
        setMensagemErro(json.error || "Erro ao salvar as diretrizes.");
      }
    } catch (err: unknown) {
      setMensagemErro(
        err instanceof Error
          ? err.message
          : "Falha na comunicação com o servidor."
      );
    } finally {
      setSalvando(false);
    }
  }

  // Gera dias dos últimos 30 dias em America/Sao_Paulo para o mini calendário de adesão
  const diasUltimos30 = React.useMemo(() => {
    if (!hojeIsoBR) return [];
    const list: { dataStr: string; diaMes: string; ativo: boolean }[] = [];
    const checkinDates = new Set(
      adesao.historicoCheckins.map((c) => getDataDiaBR(c.data))
    );

    for (let i = 29; i >= 0; i--) {
      const dataStr = subtrairDiasDataBR(hojeIsoBR, i);
      const [, mm, dd] = dataStr.split("-");
      const diaMes = `${Number(dd)}/${Number(mm)}`;
      list.push({
        dataStr,
        diaMes,
        ativo: checkinDates.has(dataStr),
      });
    }

    return list;
  }, [adesao.historicoCheckins, hojeIsoBR]);

  const volumeMinutosSemanal = frequenciaDias * duracaoMinutos;
  const atingeRecomendacaoOMS = volumeMinutosSemanal >= 150;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-slate-50/50">
      {/* 1. CABEÇALHO DO MÓDULO */}
      <div className="cl-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <Dumbbell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Diretrizes de Atividade Física & Treinos
              </h2>
              <span className="cl-badge-emerald px-2.5 py-0.5 text-[10px]">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                Habit Tracker
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Defina as recomendações personalizadas para <strong className="text-slate-700">{pacienteNome}</strong> e acompanhe o registro diário do app.
            </p>
          </div>
        </div>

        {mensagemSucesso && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{mensagemSucesso}</span>
          </div>
        )}

        {mensagemErro && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold animate-in fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>{mensagemErro}</span>
          </div>
        )}
      </div>

      {/* 2. CARDS VISUAIS DE ADESÃO & MÉTRICAS (ÚLTIMOS 30 DIAS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Adesão ao Treino (Destaque Principal) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Adesão aos Treinos (30d)
            </span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {adesao.porcentagemAdesao}%
              </span>
              <span className="text-xs font-medium text-slate-500">
                cumprimento da meta
              </span>
            </div>

            {/* Barra de Progresso */}
            <div className="w-full h-2.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-teal-500 to-emerald-500"
                style={{ width: `${adesao.porcentagemAdesao}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span>
              <strong>{adesao.diasAtivosUltimos30Dias}</strong> dias ativos registrados
            </span>
            <span>
              Meta: <strong>{adesao.metaEsperada30Dias}</strong> dias
            </span>
          </div>
        </div>

        {/* Card 2: Volume Semanal Prescrito */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Volume Semanal Planejado
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {volumeMinutosSemanal}
              </span>
              <span className="text-xs font-medium text-slate-500">
                minutos / semana
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              {frequenciaDias} sessões de {duracaoMinutos} min ({tipoAtividade})
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] pt-2 border-t border-slate-100">
            {atingeRecomendacaoOMS ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Atinge diretriz da OMS (&ge; 150 min/sem)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Abaixo do mínimo recomendado da OMS (150 min)
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Status Habit Tracker */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Status Habit Tracker
            </span>
            <div className="p-1.5 rounded-lg bg-orange-50 text-orange-700">
              <Flame className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {adesao.totalLogs}
              </span>
              <span className="text-xs font-medium text-slate-500">
                check-ins nos últimos 30 dias
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              {adesao.historicoCheckins.length > 0 ? (
                <>
                  Último treino em:{" "}
                  <strong className="text-slate-800">
                    {new Date(adesao.historicoCheckins[0].data).toLocaleDateString("pt-BR", {
                      timeZone: TIMEZONE_BR,
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                </>
              ) : (
                "Nenhum treino registrado no app nos últimos 30 dias."
              )}
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span>Sincronização em tempo real</span>
            <span className="font-semibold text-teal-700">App Paciente Conectado</span>
          </div>
        </div>
      </div>

      {/* 3. CALENDÁRIO VISUAL DE ADESÃO (ÚLTIMOS 30 DIAS) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Constância de Treino nos Últimos 30 Dias (Habit Tracker)
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-emerald-500" />
              <span>Treino Realizado</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-slate-100 border border-slate-200" />
              <span>Descanso / Sem Registro</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-15 gap-1.5 pt-2">
          {diasUltimos30.map((d, idx) => (
            <div
              key={idx}
              title={`${d.diaMes} - ${d.ativo ? "Treino Concluído" : "Sem registro"}`}
              className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all ${
                d.ativo
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold shadow-2xs"
                  : "bg-slate-50/70 border-slate-200/60 text-slate-400"
              }`}
            >
              <span className="text-[10px] leading-tight font-medium opacity-80">
                {d.diaMes}
              </span>
              <div className="mt-1">
                {d.ativo ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 block" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. FORMULÁRIO CLÍNICO DE DIRETRIZES DE TREINO */}
      <form onSubmit={handleSalvar} className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Prescrição de Diretrizes de Atividade Física
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Defina os parâmetros clínicos que serão apresentados no aplicativo do paciente.
            </p>
          </div>
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{salvando ? "Salvando..." : "Salvar Diretrizes"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Tipo de Atividade */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Tipo de Atividade Recomendada
            </label>
            <select
              value={tipoAtividade}
              onChange={(e) => setTipoAtividade(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all cursor-pointer shadow-2xs"
            >
              {OPCOES_ATIVIDADE.map((op) => (
                <option key={op.valor} value={op.valor}>
                  {op.icone} {op.rotulo}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Modalidade principal para o perfil metabólico do paciente.
            </p>
          </div>

          {/* Frequência (Dias por Semana) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Frequência (Dias por Semana)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={7}
                value={frequenciaDias}
                onChange={(e) => setFrequenciaDias(Math.min(7, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all shadow-2xs"
              />
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                dias / semana
              </span>
            </div>
            <div className="flex gap-1 pt-1">
              {[2, 3, 4, 5, 6].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFrequenciaDias(d)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    frequenciaDias === d
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {d}x
                </button>
              ))}
            </div>
          </div>

          {/* Duração por Sessão */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Duração por Sessão (Minutos)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={180}
                step={5}
                value={duracaoMinutos}
                onChange={(e) => setDuracaoMinutos(Math.max(5, parseInt(e.target.value) || 30))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all shadow-2xs"
              />
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                minutos
              </span>
            </div>
            <div className="flex gap-1 pt-1">
              {[30, 45, 60, 90].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuracaoMinutos(m)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    duracaoMinutos === m
                      ? "bg-teal-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Textarea: Restrições e Observações Clínicas */}
        <div className="space-y-1.5 pt-2">
          <label className="block text-xs font-bold text-slate-700">
            Restrições / Observações Clínicas de Atividade Física
          </label>
          <textarea
            rows={4}
            value={restricoes}
            onChange={(e) => setRestricoes(e.target.value)}
            placeholder="Ex: Evitar exercícios de alto impacto com carga axial. Focar em cadeia cinética fechada e fortalecimento do manguito rotador. Monitorar frequência cardíaca..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all shadow-2xs leading-relaxed"
          />
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Visível no aplicativo do paciente como orientação médica oficial.</span>
            <span>{restricoes.length} caracteres</span>
          </div>
        </div>

        {/* Rodapé com Botão Salvar */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm hover:shadow disabled:opacity-50 cursor-pointer"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{salvando ? "Salvando Alterações..." : "Salvar Diretrizes de Treino"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
