"use client";

import React, { useEffect } from "react";
import { Award, ShieldCheck, X } from "lucide-react";
import { PlanoFaazTab } from "@/components/PlanoFaazTab";
import type { PacotesPacienteResponse } from "@/lib/pacotes-faaz";

export interface PacotePacienteModalTarget {
  id: string;
  nome: string;
  recordCode?: string;
  convenio?: string;
  planoFaaz?: boolean;
}

export interface PacotePacienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  paciente: PacotePacienteModalTarget | null;
  onPacotesUpdated?: (
    pacienteId: string,
    next: PacotesPacienteResponse
  ) => void;
}

/**
 * Modal administrativo "Programa & Pacote de Consultas"
 * Acessível pela listagem de Pacientes para SECRETARIA, MEDICO, ADMINISTRADOR e DONO_CLINICA.
 * Reutiliza integralmente o componente PlanoFaazTab (mesma tabela Oracle e mesma API /api/pacientes/[id]/pacotes)
 * sem expor nenhum dado clínico ou prontuário.
 */
export function PacotePacienteModal({
  isOpen,
  onClose,
  paciente,
  onPacotesUpdated,
}: PacotePacienteModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !paciente) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pacote-modal-title"
        className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO ADMINISTRATIVO CLINICAL LIGHT */}
        <div className="cl-modal-header px-5 sm:px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="pacote-modal-title"
                  className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight"
                >
                  Programa & Pacote de Consultas
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Gestão Administrativa</span>
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5 text-xs text-slate-600">
                <span className="font-bold text-slate-800 truncate">
                  {paciente.nome}
                </span>
                {paciente.recordCode && (
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    {paciente.recordCode}
                  </span>
                )}
                {paciente.convenio && (
                  <span className="text-[11px] text-slate-400">
                    • {paciente.convenio}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar modal de pacotes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTEÚDO REAPROVEITADO DO MÓDULO PLANO FAAZ (SEM PRONTUÁRIO CLÍNICO) */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <PlanoFaazTab
            key={paciente.id}
            pacienteId={paciente.id}
            pacienteNome={paciente.nome}
            modo="administrativo"
            onPacotesUpdated={(next) => onPacotesUpdated?.(paciente.id, next)}
          />
        </div>
      </div>
    </div>
  );
}
