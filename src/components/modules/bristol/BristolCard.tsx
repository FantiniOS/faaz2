"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Stethoscope,
  Smartphone,
  Target,
  Check,
  AlertTriangle,
  Clock,
  RefreshCw,
  Database,
} from "lucide-react";
import { mockBristolHistory, BristolHistory, BristolRecord } from "./mockData";

interface BristolCardProps {
  data?: BristolHistory;
  pacienteId?: string;
}

const bristolDescMap: Record<number, string> = {
  1: "Bolinhas duras e separadas (difícil de sair)",
  2: "Formato de salsicha, empedrado e firme",
  3: "Formato de salsicha com rachaduras superficiais",
  4: "Formato de salsicha ou cobra, lisa e macia (Ideal)",
  5: "Pedaços macios e separados (digestão rápida)",
  6: "Pastoso e esfarrapado (leve desarranjo)",
  7: "Totalmente líquido (diarreia)",
};

export function BristolCard({
  data = mockBristolHistory,
  pacienteId = "carlos-faaz-001",
}: BristolCardProps) {
  const [registros, setRegistros] = useState<BristolRecord[]>(data.registros);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLiveRegistros = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsLoading(true);
      const res = await fetch(
        `/api/checkins/intestino?pacienteId=${pacienteId}&limit=5`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        }
      );
      if (!res.ok) return;

      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const mapped: BristolRecord[] = json.data.map((item: any, idx: number) => {
          const d = new Date(item.data);
          const now = new Date();
          const isToday = d.toDateString() === now.toDateString();
          const dia = isToday
            ? "Hoje"
            : d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
          const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

          return {
            id: item.id || idx + 100,
            dia,
            hora,
            tipo: item.tipoBristol,
            descricao:
              bristolDescMap[item.tipoBristol] || `Bristol Tipo ${item.tipoBristol}`,
            status: item.categoria === "ideal" ? "ideal" : "alerta",
          };
        });

        setRegistros(mapped);
        setIsLive(true);
      }
    } catch {
      // Mantém os dados locais/mock silenciosamente em caso de erro
    } finally {
      setIsLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    fetchLiveRegistros(true);
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchLiveRegistros(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchLiveRegistros]);

  return (
    <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-7 space-y-6">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-emerald-600 shadow-xs">
            <Stethoscope className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-emerald-600 tracking-wider uppercase block">
              MÓDULO #08 • GASTROENTEROLOGIA
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Saúde Intestinal & Escala de Bristol
            </h2>
          </div>
        </div>

        {/* Badge simulando o Toggle Switch Ativado */}
        <div className="inline-flex items-center self-start sm:self-center gap-2.5 bg-emerald-50/90 border border-emerald-200/70 rounded-full pl-3 pr-1.5 py-1 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-800 tracking-tight">
            Recém-Ativado
          </span>
          <div className="w-8 h-4.5 bg-emerald-600 rounded-full p-0.5 flex items-center justify-end shadow-inner cursor-default">
            <div className="w-3.5 h-3.5 bg-white rounded-full shadow-xs" />
          </div>
        </div>
      </div>

      {/* 2. SUB-SEÇÃO / LISTA HEADER */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between pt-1">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            ÚLTIMOS REGISTROS (APP DO PACIENTE)
            {isLive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                <Database className="w-3 h-3 text-emerald-600" />
                PostgreSQL Live
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLiveRegistros()}
              title="Recarregar registros do banco de dados"
              disabled={isLoading}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-emerald-600"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200/60 rounded-full px-2.5 py-0.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              Sincronizado via Mobile
            </span>
          </div>
        </div>

        {/* LISTA DE REGISTROS */}
        <div className="space-y-2.5">
          {registros.map((registro) => {
            const isIdeal = registro.status === "ideal";

            return (
              <div
                key={registro.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl border border-gray-100 bg-white hover:bg-gray-50/50 transition-colors gap-3"
              >
                {/* Colunas 1, 2 e 3: Dia, Tag do Tipo e Descrição */}
                <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                  {/* Coluna 1: Dia */}
                  <span className="text-sm font-semibold text-gray-800 min-w-[56px] shrink-0">
                    {registro.dia}:
                  </span>

                  {/* Coluna 2: Tag do Tipo */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tracking-tight shrink-0 ${
                      isIdeal
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                        : "bg-red-50 text-red-700 border border-red-200/80"
                    }`}
                  >
                    [Tipo {registro.tipo}]
                  </span>

                  {/* Coluna 3: Descrição do formato */}
                  <span
                    className="text-xs sm:text-sm text-gray-600 truncate"
                    title={registro.descricao}
                  >
                    {registro.descricao}
                  </span>
                </div>

                {/* Coluna 4 (Direita): Hora e Badge de conclusão */}
                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <div className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{registro.hora}</span>
                  </div>

                  {isIdeal ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                      Ideal
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200/60">
                      <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
                      Alerta
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé Interno da Lista */}
        <div className="rounded-xl bg-emerald-50/60 border border-emerald-100/80 px-4 py-3 flex items-center gap-2.5">
          <Target className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs sm:text-sm font-medium text-emerald-900">
            <span className="font-semibold">Meta Clínica Alvo:</span> Tipos 3 ou 4 (Normofisiológico)
          </p>
        </div>
      </div>

      {/* 3. RODAPÉ DO CARTÃO */}
      <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
        <span className="text-gray-500 font-medium">
          Disponível na tela inicial do App
        </span>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/50">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-emerald-700">Ativo</span>
        </div>
      </div>
    </div>
  );
}

export default BristolCard;
