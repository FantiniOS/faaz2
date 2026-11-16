'use client';

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Droplets,
  Search,
  RefreshCw,
  Phone,
  User,
  Send,
} from "lucide-react";

export interface AuditoriaCliqueItem {
  id: string;
  pacienteId: string;
  nome: string;
  cpf: string;
  telefone: string;
  acao: string;
  categoria?: string;
  tipoBristol?: number;
  volumeMl?: number;
  sintomas?: string[];
  horario: string;
  dataRaw: string;
}

export interface AuditoriaPendenteItem {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  convenio?: string;
  metaDiariaMl?: number;
}

interface AuditoriaDiariaModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialModulo?: "bristol" | "hidrico";
}

export function AuditoriaDiariaModal({
  isOpen,
  onClose,
  initialModulo = "bristol",
}: AuditoriaDiariaModalProps) {
  const [modulo, setModulo] = useState<"bristol" | "hidrico">(initialModulo);
  const [activeTab, setActiveTab] = useState<"cliques" | "pendentes">("cliques");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [cliquesHoje, setCliquesHoje] = useState<AuditoriaCliqueItem[]>([]);
  const [pendentesHoje, setPendentesHoje] = useState<AuditoriaPendenteItem[]>([]);

  useEffect(() => {
    if (initialModulo) {
      setModulo(initialModulo);
    }
  }, [initialModulo]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/checkins/auditoria?modulo=${modulo}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setCliquesHoje(json.cliquesHoje || []);
        setPendentesHoje(json.pendentesHoje || []);
      }
    } catch (err) {
      console.error("[AuditoriaDiariaModal] Erro ao carregar dados:", err);
    } finally {
      setIsLoading(false);
    }
  }, [modulo]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const filteredCliques = cliquesHoje.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.nome.toLowerCase().includes(q) ||
      item.cpf.includes(q) ||
      item.telefone.includes(q) ||
      item.acao.toLowerCase().includes(q)
    );
  });

  const filteredPendentes = pendentesHoje.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.nome.toLowerCase().includes(q) ||
      item.cpf.includes(q) ||
      item.telefone.includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO COMPACTO */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-2xs ${
                modulo === "bristol" ? "bg-emerald-600" : "bg-cyan-600"
              }`}
            >
              {modulo === "bristol" ? (
                <Activity className="w-4 h-4" />
              ) : (
                <Droplets className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                Auditoria Diária de Check-ins
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  App Mobile
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Quem clicou, que horas registrou e quem ainda não reportou hoje.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Atualizar dados"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-600" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONTROLES / TABS DO MÓDULO E DE STATUS */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Seletor de Módulo */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => setModulo("bristol")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                modulo === "bristol"
                  ? "bg-white text-emerald-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🌿 Saúde Intestinal (Bristol)
            </button>
            <button
              type="button"
              onClick={() => setModulo("hidrico")}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                modulo === "hidrico"
                  ? "bg-white text-cyan-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              💧 Aderência Hídrica
            </button>
          </div>

          {/* Abas: Cliques Hoje vs Pendentes */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("cliques")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                activeTab === "cliques"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Registros Recebidos ({cliquesHoje.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pendentes")}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                activeTab === "pendentes"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Aguardando Check-in ({pendentesHoje.length})</span>
            </button>
          </div>
        </div>

        {/* BARRA DE PESQUISA COMPACTA */}
        <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/40">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por nome do paciente, CPF ou telefone..."
              className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* CORPO DA LISTA (ALTA DENSIDADE / LINHAS MENORES) */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {activeTab === "cliques" ? (
            filteredCliques.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Nenhum check-in registrado hoje para este filtro.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                    <th className="py-2 px-3 font-semibold">Paciente</th>
                    <th className="py-2 px-3 font-semibold">CPF</th>
                    <th className="py-2 px-3 font-semibold">Telefone</th>
                    <th className="py-2 px-3 font-semibold">O que clicou no App</th>
                    <th className="py-2 px-3 font-semibold text-right">Horário Exato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80 font-medium text-slate-700">
                  {filteredCliques.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-1.5 px-3 font-bold text-slate-900">
                        {item.nome}
                      </td>
                      <td className="py-1.5 px-3 text-slate-500 font-mono text-[11px]">
                        {item.cpf}
                      </td>
                      <td className="py-1.5 px-3 text-slate-600">
                        {item.telefone}
                      </td>
                      <td className="py-1.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            modulo === "bristol"
                              ? item.categoria === "ideal"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : item.categoria === "constipacao"
                                ? "bg-amber-50 text-amber-800 border border-amber-200"
                                : "bg-rose-50 text-rose-800 border border-rose-200"
                              : "bg-cyan-50 text-cyan-800 border border-cyan-200"
                          }`}
                        >
                          {item.acao}
                        </span>
                        {item.sintomas && item.sintomas.length > 0 && (
                          <span className="text-[10px] text-amber-700 font-medium ml-1.5">
                            ({item.sintomas.join(", ")})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-bold text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {item.horario}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : filteredPendentes.length === 0 ? (
            <div className="p-8 text-center text-emerald-700 text-xs font-bold">
              🎉 Parabéns! Todos os pacientes ativos já registraram check-in hoje!
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                  <th className="py-2 px-3 font-semibold">Paciente</th>
                  <th className="py-2 px-3 font-semibold">CPF</th>
                  <th className="py-2 px-3 font-semibold">Telefone WhatsApp</th>
                  <th className="py-2 px-3 font-semibold">Convênio</th>
                  <th className="py-2 px-3 font-semibold text-right">Lembrete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 font-medium text-slate-700">
                {filteredPendentes.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-1.5 px-3 font-bold text-slate-900">
                      {item.nome}
                    </td>
                    <td className="py-1.5 px-3 text-slate-500 font-mono text-[11px]">
                      {item.cpf || "--"}
                    </td>
                    <td className="py-1.5 px-3 text-slate-600">
                      {item.telefone || "--"}
                    </td>
                    <td className="py-1.5 px-3 text-slate-500">
                      {item.convenio || "Particular"}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {item.telefone && (
                        <a
                          href={`https://wa.me/55${item.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(
                            `Olá ${item.nome}, aqui é da Clínica FAAZ! Lembramos de preencher seu check-in diário no app hoje.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          title="Enviar lembrete via WhatsApp"
                        >
                          <Send className="w-2.5 h-2.5" />
                          <span>Lembrar</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* RODAPÉ COMPACTO */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500">
          <span className="text-[11px]">
            🔄 Reset automático diário às 00:00 • Horário de Brasília
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
