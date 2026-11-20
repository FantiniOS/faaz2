'use client';

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Sparkles,
  Zap,
  Phone,
  ArrowRight,
  Filter,
  RefreshCw,
  Calendar,
  Building2,
} from "lucide-react";
import { TopMenu } from "@/components/TopMenu";

export interface OperacionalAgendamentoItem {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone?: string;
  pacienteConvenio?: string;
  pacientePlanoFaaz?: boolean;
  data: string;
  horario: string;
  duracaoMinutos: number;
  tipo: string;
  tipoLegivel: string;
  status: string;
  statusLegivel: string;
  observacao?: string;
  medicoId: string;
  medicoNome: string;
  especialidade: "ENDOCRINOLOGIA" | "CIRURGIA_PLASTICA";
  especialidadeLegivel: string;
  encaixe: boolean;
}

interface DashboardOperacionalProps {
  user?: {
    nome?: string;
    cargo?: string;
    role?: string;
  } | null;
}

export function DashboardOperacional({ user }: DashboardOperacionalProps) {
  const [hojeIso] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  const [agendamentos, setAgendamentos] = useState<OperacionalAgendamentoItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<"TODAS" | "ENDOCRINOLOGIA" | "CIRURGIA_PLASTICA">("TODAS");
  const [filtroStatus, setFiltroStatus] = useState<"TODOS" | "CONFIRMADOS" | "PENDENTES" | "ENCAIXES">("TODOS");

  const carregarAgendamentos = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/agendamentos?data=${hojeIso}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.agendamentos)) {
        setAgendamentos(json.agendamentos);
      }
    } catch (err) {
      console.error("[DashboardOperacional] Erro ao buscar agendamentos do dia:", err);
    } finally {
      setIsLoading(false);
    }
  }, [hojeIso]);

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) void carregarAgendamentos();
    });
    return () => {
      ativo = false;
    };
  }, [carregarAgendamentos]);

  // Cálculos consolidados da operação do dia
  const totalAgendamentos = agendamentos.length;
  const confirmados = agendamentos.filter((a) => a.status === "CONFIRMADO").length;
  const pendentes = agendamentos.filter((a) => a.status === "AGENDADO").length;
  const finalizados = agendamentos.filter((a) => a.status === "FINALIZADO").length;
  const cancelados = agendamentos.filter((a) => a.status === "CANCELADO").length;

  const totalEndocrinologia = agendamentos.filter((a) => a.especialidade === "ENDOCRINOLOGIA").length;
  const totalCirurgiaPlastica = agendamentos.filter((a) => a.especialidade === "CIRURGIA_PLASTICA").length;
  const totalEncaixes = agendamentos.filter((a) => Boolean(a.encaixe)).length;

  // Filtragem da lista da fila
  const agendamentosFiltrados = agendamentos
    .filter((a) => {
      if (filtroEspecialidade !== "TODAS" && a.especialidade !== filtroEspecialidade) {
        return false;
      }
      if (filtroStatus === "CONFIRMADOS" && a.status !== "CONFIRMADO") return false;
      if (filtroStatus === "PENDENTES" && a.status !== "AGENDADO") return false;
      if (filtroStatus === "ENCAIXES" && !a.encaixe) return false;
      return true;
    })
    .sort((a, b) => a.horario.localeCompare(b.horario));

  function getWhatsAppLink(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (!digits || digits.length < 8) return null;
    const cleanNumber = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
    return `https://wa.me/${cleanNumber}`;
  }

  const nomeSecretaria = user?.nome || "Patrícia Santos";

  // Data humana
  const dataHojeHumana = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen cl-page flex flex-col font-sans">
      <TopMenu activePath="/dashboard" />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">
        {/* CABEÇALHO DO PAINEL OPERACIONAL */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
              <span>Painel Operacional da Recepção</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full text-[11px] font-bold">
                Recepção & Atendimento (LGPD Safe)
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Olá, {nomeSecretaria}
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5 capitalize">
              {dataHojeHumana} • Controle de fila, status de confirmação e encaixes do dia.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={carregarAgendamentos}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs hover:bg-slate-50 transition-colors"
              title="Atualizar fluxo de agendamentos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
              <span>Atualizar</span>
            </button>

            <Link
              href="/agenda"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <Calendar className="w-4 h-4" />
              <span>Abrir Agenda Completa</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 4 CARDS OPERACIONAIS DE FLUXO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: TOTAL DO DIA */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Agendamentos de Hoje
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="pt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                  {totalAgendamentos}
                </span>
                <span className="text-xs text-slate-400 font-medium">pacientes na grade</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Fluxo total programado para os consultórios hoje.
              </p>
            </div>
          </div>

          {/* CARD 2: CONFIRMAÇÕES */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Status de Confirmação
              </span>
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Confirmados:
                </span>
                <span className="font-extrabold text-slate-900">{confirmados}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Aguardando / Pendentes:
                </span>
                <span className="font-extrabold text-slate-900">{pendentes}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Finalizados: {finalizados}</span>
                <span>Cancelados: {cancelados}</span>
              </div>
            </div>
          </div>

          {/* CARD 3: DIVISÃO POR ESPECIALIDADE */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Por Especialidade
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Stethoscope className="w-4 h-4" />
              </div>
            </div>
            <div className="pt-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                  🌿 Endocrinologia
                </span>
                <span className="text-sm font-black text-slate-900 font-mono">
                  {totalEndocrinologia}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg">
                  💎 Cirurgia Plástica
                </span>
                <span className="text-sm font-black text-slate-900 font-mono">
                  {totalCirurgiaPlastica}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 4: ENCAIXES */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Encaixes Marcados
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="pt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-amber-700 tracking-tight">
                  {totalEncaixes}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {totalEncaixes === 1 ? "sobreposição ativa" : "sobreposições ativas"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Visualização simultânea side-by-side na grade.
              </p>
            </div>
          </div>
        </div>

        {/* FILA DE HORÁRIOS DO DIA (ORDEM CRONOLÓGICA) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
          {/* Header da Seção de Fila com Filtros Rápidos */}
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Fila de Atendimento do Dia
                </h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
                  {agendamentosFiltrados.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Próximos horários agendados organizados cronologicamente.
              </p>
            </div>

            {/* Filtros em formato de Pílulas */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="cl-segmented gap-1">
                <button
                  type="button"
                  onClick={() => setFiltroEspecialidade("TODAS")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroEspecialidade === "TODAS"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEspecialidade("ENDOCRINOLOGIA")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroEspecialidade === "ENDOCRINOLOGIA"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Endocrinologia
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEspecialidade("CIRURGIA_PLASTICA")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroEspecialidade === "CIRURGIA_PLASTICA"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Cirurgia Plástica
                </button>
              </div>

              <div className="cl-segmented gap-1">
                <button
                  type="button"
                  onClick={() => setFiltroStatus("TODOS")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroStatus === "TODOS"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatus("CONFIRMADOS")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroStatus === "CONFIRMADOS"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Confirmados
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatus("PENDENTES")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroStatus === "PENDENTES"
                      ? "bg-amber-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Pendentes
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatus("ENCAIXES")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroStatus === "ENCAIXES"
                      ? "bg-amber-600 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ⚡ Encaixes
                </button>
              </div>
            </div>
          </div>

          {/* LISTA DE AGENDAMENTOS */}
          {isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
              <p className="text-xs font-medium">Carregando fila do dia...</p>
            </div>
          ) : agendamentosFiltrados.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                Nenhum agendamento encontrado para o filtro selecionado.
              </p>
              <p className="text-xs text-slate-400">
                Altere os filtros acima ou crie um novo agendamento na Agenda.
              </p>
              <div className="pt-2">
                <Link
                  href="/agenda"
                  className="cl-btn-primary px-4 py-2 text-xs"
                >
                  <span>Abrir Agenda</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Horário</th>
                    <th className="py-3 px-4">Paciente</th>
                    <th className="py-3 px-4">Especialidade</th>
                    <th className="py-3 px-4">Médico</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agendamentosFiltrados.map((item) => {
                    const waLink = getWhatsAppLink(item.pacienteTelefone);
                    const isEndo = item.especialidade === "ENDOCRINOLOGIA";

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          item.encaixe ? "bg-amber-50/20" : ""
                        }`}
                      >
                        {/* HORÁRIO */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900 font-mono">
                              {item.horario}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              ({item.duracaoMinutos} min)
                            </span>
                            {item.encaixe && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-500 text-white font-black text-[9px] uppercase tracking-wider shadow-2xs"
                                title="Encaixe autorizado"
                              >
                                ⚡ ENCAIXE
                              </span>
                            )}
                          </div>
                        </td>

                        {/* PACIENTE */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-sm">
                                {item.pacienteNome}
                              </span>
                              {item.pacientePlanoFaaz && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-2xs">
                                  FAAZ ✨
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                              {item.pacienteConvenio && (
                                <span>{item.pacienteConvenio}</span>
                              )}
                              {item.pacienteTelefone && waLink && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <a
                                    href={waLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-0.5 hover:underline"
                                    title="Chamar no WhatsApp"
                                  >
                                    <Phone className="w-3 h-3 text-emerald-600" />
                                    <span>{item.pacienteTelefone}</span>
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* ESPECIALIDADE */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                              isEndo
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : "bg-blue-50 text-blue-800 border-blue-300"
                            }`}
                          >
                            <span>{isEndo ? "🌿" : "💎"}</span>
                            <span>{item.especialidadeLegivel}</span>
                          </span>
                        </td>

                        {/* MÉDICO */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">
                            {item.medicoNome}
                          </span>
                        </td>

                        {/* TIPO */}
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                          {item.tipoLegivel}
                        </td>

                        {/* STATUS */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              item.status === "CONFIRMADO"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "AGENDADO"
                                ? "bg-amber-100 text-amber-800"
                                : item.status === "FINALIZADO"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {item.statusLegivel}
                          </span>
                        </td>

                        {/* AÇÃO */}
                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <Link
                            href={`/agenda?data=${item.data}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-colors"
                          >
                            <span>Ver na Agenda</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
