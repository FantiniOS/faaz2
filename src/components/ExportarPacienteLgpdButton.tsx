"use client";

import React, { useState } from "react";
import { CheckCircle2, Download, Loader2, ShieldCheck } from "lucide-react";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import { getHojeBR } from "@/lib/date-br";

interface ExportarPacienteLgpdButtonProps {
  pacienteId: string;
  pacienteNome?: string;
  currentUserCargo?: string | null;
  compact?: boolean;
}

function extractFilenameFromDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback;
  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1].trim());
    } catch {
      return match[1].trim();
    }
  }
  return fallback;
}

export function ExportarPacienteLgpdButton({
  pacienteId,
  pacienteNome,
  currentUserCargo,
  compact = false,
}: ExportarPacienteLgpdButtonProps) {
  const [exportando, setExportando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // RBAC na UI: somente corpo clínico (DONO_CLINICA, CLINIC_ADMIN, MEDICO, DOCTOR).
  // Nunca renderiza para recepção/secretária ou administrador sem cargo clínico.
  if (currentUserCargo && !podeAcessarDadosClinicos(currentUserCargo)) {
    return null;
  }

  const handleDownload = async () => {
    if (!pacienteId || exportando) return;
    setExportando(true);
    setErro(null);
    setConcluido(false);

    try {
      const res = await fetch(`/api/pacientes/${pacienteId}/exportar-lgpd`, {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setErro(
          errJson?.error || "Não foi possível exportar a ficha do paciente.",
        );
        return;
      }

      const blob = await res.blob();
      const nomeSafe = (pacienteNome || "PACIENTE")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50);
      const fallbackName = `Clinica_FAAZ_LGPD_${nomeSafe || "PACIENTE"}_${getHojeBR()}.zip`;
      const filename = extractFilenameFromDisposition(
        res.headers.get("Content-Disposition"),
        fallbackName,
      );

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setConcluido(true);
      setTimeout(() => setConcluido(false), 3500);
    } catch {
      setErro("Erro de conexão ao gerar exportação LGPD.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={exportando}
        title={
          erro ||
          "Baixar pacote individual de portabilidade do paciente (CSV + JSON — LGPD)"
        }
        className={`inline-flex items-center gap-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-60 ${
          compact ? "px-2.5 py-1.5" : "px-3 py-2"
        } ${
          concluido
            ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs"
            : erro
              ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
              : "bg-white hover:bg-emerald-50/70 text-slate-700 hover:text-emerald-800 border-slate-200 hover:border-emerald-300 shadow-2xs"
        }`}
      >
        {exportando ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
        ) : concluido ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Download className="w-3.5 h-3.5 text-emerald-600" />
        )}
        <span className="hidden sm:inline">
          {exportando
            ? "Gerando LGPD..."
            : concluido
              ? "Ficha Exportada"
              : "Exportar Ficha (LGPD)"}
        </span>
        <span className="sm:hidden">
          {exportando ? "Gerando..." : "LGPD"}
        </span>
        {!exportando && !concluido && (
          <ShieldCheck className="w-3 h-3 text-slate-400 hidden md:inline" />
        )}
      </button>
    </div>
  );
}
