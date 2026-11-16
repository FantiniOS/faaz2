'use client';

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  AlertTriangle,
  Clock,
  HeartPulse,
  FileText,
  RefreshCw,
  CheckCircle2,
  User,
} from "lucide-react";

export interface AlertaGlicemicoItem {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteRecordCode?: string;
  pacienteCpf?: string;
  pacienteTelefone?: string;
  pacienteDataNascimento?: string | null;
  pacienteSexo?: string;
  pacienteConvenio?: string;
  pacienteStatus?: string;
  valor: number;
  momento: string;
  momentoLegivel: string;
  horario: string;
  dataRegistro: string;
  isCritico: boolean;
  tipoAlerta: "HIPOGLICEMIA" | "HIPERGLICEMIA" | "NORMAL";
}

export interface GlicemiaLiveSummary {
  totalAlertasHoje: number;
  pacientesCriticosHoje: number;
  totalRegistrosHoje: number;
  alertasHoje: AlertaGlicemicoItem[];
  registrosHoje: AlertaGlicemicoItem[];
}

interface AlertasGlicemicosModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveData?: GlicemiaLiveSummary | null;
  onOpenProntuario: (item: AlertaGlicemicoItem) => void;
}

export function AlertasGlicemicosModal({
  isOpen,
  onClose,
  liveData,
  onOpenProntuario,
}: AlertasGlicemicosModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [alertas, setAlertas] = useState<AlertaGlicemicoItem[]>(
    liveData?.alertasHoje || []
  );

  const fetchAlertas = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/checkins/glicemia", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.alertasHoje)) {
        setAlertas(json.alertasHoje);
      }
    } catch (err) {
      console.error("[AlertasGlicemicosModal] Erro ao buscar alertas:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (liveData?.alertasHoje) {
      setAlertas(liveData.alertasHoje);
    }
  }, [liveData]);

  useEffect(() => {
    if (isOpen) {
      fetchAlertas();
    }
  }, [isOpen, fetchAlertas]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO DO MODAL ESTÁTICO */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white tracking-tight truncate">
                  Alertas Glicêmicos Críticos — Hoje
                </h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500 text-white shrink-0">
                  {alertas.length} {alertas.length === 1 ? "Alerta" : "Alertas"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-0.5">
                Pacientes com glicemia fora da zona de segurança (&lt; 70 ou &gt; 180 mg/dL)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={fetchAlertas}
              disabled={isLoading}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Atualizar alertas"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin text-rose-400" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LISTA DE PACIENTES COM ALERTA HOJE (ROLAGEM INTERNA CONTROLADA) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3 bg-slate-50/60">
          {alertas.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Nenhum alerta glicêmico crítico hoje
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Todos os registros recebidos via App Mobile hoje encontram-se dentro da faixa segura (70 a 180 mg/dL).
              </p>
            </div>
          ) : (
            alertas.map((alerta) => (
              <div
                key={alerta.id}
                className="bg-white border border-rose-200/80 hover:border-rose-300 rounded-xl p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
              >
                {/* ESQUERDA: Paciente + Momento + Hora */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0 font-black text-xs">
                    <User className="w-5 h-5 text-rose-600" />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-900 truncate">
                        {alerta.pacienteNome}
                      </span>
                      {alerta.pacienteRecordCode && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {alerta.pacienteRecordCode}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">
                        <HeartPulse className="w-3 h-3 text-rose-500" />
                        <span>{alerta.momentoLegivel}</span>
                      </span>

                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Hoje às {alerta.horario}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* DIREITA: Valor com Badge Vermelho + Botão Abrir Prontuário */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0">
                  <div className="flex flex-col items-start sm:items-end">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono font-black text-sm shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>{alerta.valor} mg/dL</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider mt-0.5">
                      {alerta.valor < 70 ? "Hipoglicemia (<70)" : "Hiperglicemia (>180)"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenProntuario(alerta)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-teal-700 text-white transition-colors shadow-2xs cursor-pointer shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Abrir Prontuário</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 font-medium">
            Sincronizado em tempo real com o App Mobile da Clínica FAAZ
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
