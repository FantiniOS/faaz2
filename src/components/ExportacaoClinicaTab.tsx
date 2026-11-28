"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Award,
  Calendar,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileSpreadsheet,
  FlaskConical,
  HeartPulse,
  Loader2,
  Lock,
  RefreshCw,
  Ruler,
  ShieldCheck,
  Users,
  Utensils,
} from "lucide-react";
import {
  CATEGORIAS_EXPORTACAO,
  CATEGORIAS_EXPORTACAO_META,
  type CategoriaExportacao,
  type ResumoExportacaoContagens,
} from "@/lib/exportacao-lgpd-types";
import { getHojeBR } from "@/lib/date-br";

const CATEGORIA_ICONS: Record<CategoriaExportacao, React.ElementType> = {
  pacientes: Users,
  agendamentos: Calendar,
  prontuarios: ClipboardList,
  exames: FlaskConical,
  dietas: Utensils,
  glicemia: HeartPulse,
  avaliacoes: Ruler,
  termometro: Activity,
  pacotes: Award,
};

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

export function ExportacaoClinicaTab() {
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [erroResumo, setErroResumo] = useState<string | null>(null);
  const [clinicaNome, setClinicaNome] = useState<string>("Clínica FAAZ");
  const [contagens, setContagens] = useState<ResumoExportacaoContagens | null>(
    null,
  );

  const [selecionadas, setSelecionadas] = useState<Set<CategoriaExportacao>>(
    () => new Set(CATEGORIAS_EXPORTACAO),
  );

  const [modoPeriodo, setModoPeriodo] = useState<"todo" | "personalizado">(
    "todo",
  );
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [exportando, setExportando] = useState(false);
  const [feedback, setFeedback] = useState<{
    tipo: "sucesso" | "erro";
    texto: string;
  } | null>(null);

  const carregarResumo = useCallback(async () => {
    setCarregandoResumo(true);
    setErroResumo(null);
    try {
      const res = await fetch("/api/clinica/exportar/resumo", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setErroResumo(
          "Acesso restrito à Diretoria Clínica para consulta e exportação completa de dados.",
        );
        return;
      }
      if (!res.ok) {
        setErroResumo("Não foi possível carregar os contadores da clínica.");
        return;
      }
      const data = await res.json();
      setClinicaNome(String(data.clinicaNome || "Clínica FAAZ"));
      setContagens(data.contagens || null);
    } catch {
      setErroResumo("Erro de conexão ao consultar os registros da clínica.");
    } finally {
      setCarregandoResumo(false);
    }
  }, []);

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  const toggleCategoria = (id: CategoriaExportacao) => {
    setFeedback(null);
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selecionarTodas = () => {
    setFeedback(null);
    setSelecionadas(new Set(CATEGORIAS_EXPORTACAO));
  };

  const limparSelecao = () => {
    setFeedback(null);
    setSelecionadas(new Set());
  };

  const totalSelecionado = useMemo(() => {
    if (!contagens) return 0;
    let total = 0;
    for (const cat of selecionadas) {
      total += contagens[cat] ?? 0;
    }
    return total;
  }, [contagens, selecionadas]);

  const handleExportar = async () => {
    setFeedback(null);

    if (selecionadas.size === 0) {
      setFeedback({
        tipo: "erro",
        texto: "Selecione ao menos uma categoria de dados para gerar o pacote.",
      });
      return;
    }

    if (modoPeriodo === "personalizado") {
      if (!dataInicio && !dataFim) {
        setFeedback({
          tipo: "erro",
          texto:
            "Informe a Data Início e/ou Data Fim para o intervalo personalizado, ou selecione 'Todo o histórico'.",
        });
        return;
      }
      if (dataInicio && dataFim && dataInicio > dataFim) {
        setFeedback({
          tipo: "erro",
          texto: "A Data Início não pode ser posterior à Data Fim.",
        });
        return;
      }
    }

    setExportando(true);
    try {
      const payload: {
        categorias: CategoriaExportacao[];
        dataInicio?: string;
        dataFim?: string;
      } = {
        categorias: Array.from(selecionadas),
      };

      if (modoPeriodo === "personalizado") {
        if (dataInicio) payload.dataInicio = dataInicio;
        if (dataFim) payload.dataFim = dataFim;
      }

      const res = await fetch("/api/clinica/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setFeedback({
          tipo: "erro",
          texto:
            errData?.error ||
            "Não foi possível gerar o pacote de exportação da clínica.",
        });
        return;
      }

      const blob = await res.blob();
      const fallbackName = `Clinica_FAAZ_Exportacao_${getHojeBR()}.zip`;
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

      setFeedback({
        tipo: "sucesso",
        texto: `Pacote ${filename} gerado e baixado com sucesso (${selecionadas.size} ${selecionadas.size === 1 ? "categoria" : "categorias"} prontas para Excel).`,
      });
    } catch {
      setFeedback({
        tipo: "erro",
        texto: "Erro de conexão ao gerar o arquivo ZIP de exportação.",
      });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho de Autonomia e Portabilidade (LGPD) */}
      <div className="cl-card p-5 sm:p-6 bg-gradient-to-br from-white via-emerald-50/35 to-teal-50/40 border-emerald-200/70">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100/90 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Autonomia Total & LGPD</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-600 border border-slate-200">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span>CSV UTF-8 BOM • Padrão Excel (PT-BR)</span>
              </span>
              {clinicaNome && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  <Database className="w-3 h-3 text-slate-500" />
                  <span>{clinicaNome}</span>
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Exportação de Dados & Portabilidade (LGPD)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              Os dados pertencem 100% à Clínica FAAZ. Exporte sua base completa a
              qualquer momento em formato aberto compatível com Excel, sem
              custos extras ou bloqueios.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void carregarResumo()}
            disabled={carregandoResumo}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-300 shadow-2xs transition-colors self-start lg:self-center cursor-pointer disabled:opacity-60"
            title="Atualizar contadores de registros"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${carregandoResumo ? "animate-spin text-emerald-600" : "text-slate-500"}`}
            />
            <span>Atualizar Contadores</span>
          </button>
        </div>
      </div>

      {/* Feedback de geração / erro */}
      {feedback && (
        <div
          className={`rounded-2xl p-4 flex items-center gap-3 text-xs sm:text-sm font-semibold ${
            feedback.tipo === "sucesso"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          {feedback.tipo === "sucesso" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{feedback.texto}</span>
        </div>
      )}

      {erroResumo && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-semibold flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{erroResumo}</span>
        </div>
      )}

      {/* Seleção de Categorias */}
      <div className="cl-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              1. Escolha o que deseja exportar
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Cada categoria gera um arquivo{" "}
              <code className="font-mono text-[11px] text-emerald-700">.csv</code>{" "}
              independente dentro do pacote{" "}
              <code className="font-mono text-[11px] text-emerald-700">.zip</code>
              , acompanhado de um{" "}
              <code className="font-mono text-[11px] text-slate-600">
                LEIA-ME.txt
              </code>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={selecionarTodas}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              onClick={limparSelecao}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          </div>
        </div>

        {carregandoResumo && !contagens ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="ml-2.5 text-xs font-medium text-slate-500">
              Consultando base da clínica...
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORIAS_EXPORTACAO_META.map((cat) => {
              const Icon = CATEGORIA_ICONS[cat.id];
              const checked = selecionadas.has(cat.id);
              const qtd = contagens ? (contagens[cat.id] ?? 0) : null;

              return (
                <label
                  key={cat.id}
                  className={`group relative flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                    checked
                      ? "bg-emerald-50/45 border-emerald-300 shadow-2xs ring-1 ring-emerald-500/10"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategoria(cat.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600 shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            checked
                              ? "bg-emerald-100/80 border-emerald-200 text-emerald-700"
                              : "bg-slate-100 border-slate-200 text-slate-500"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                          {cat.titulo}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold tabular-nums shrink-0 border ${
                          checked
                            ? "bg-white text-emerald-800 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {qtd === null ? "—" : qtd.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 leading-snug">
                      {cat.descricao}
                    </p>

                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[10px] font-mono text-slate-400">
                        {cat.arquivoCsv}
                      </span>
                      {qtd !== null && (
                        <span className="text-[10px] font-medium text-slate-400">
                          {qtd === 1
                            ? cat.unidadeContagem.replace(/s$/, "")
                            : cat.unidadeContagem}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Filtro de Período + Ação de Download */}
      <div className="cl-card p-5 space-y-5">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-emerald-600" />
              <span>2. Período dos registros (opcional)</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Por padrão, exportamos todo o histórico clínico da Clínica FAAZ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setModoPeriodo("todo");
                setFeedback(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                modoPeriodo === "todo"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Todo o histórico
            </button>
            <button
              type="button"
              onClick={() => {
                setModoPeriodo("personalizado");
                setFeedback(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                modoPeriodo === "personalizado"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Intervalo personalizado
            </button>
          </div>

          {modoPeriodo === "personalizado" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Data Início
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="no-uppercase w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Data Fim
                </label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="no-uppercase w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5 text-[11px] text-slate-500 max-w-xl">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-700">
                Exportação auditada e segura:
              </strong>{" "}
              esta operação é registrada na trilha de auditoria da Clínica FAAZ,
              exclui automaticamente senhas, hashes e tokens de acesso, e aplica
              proteção contra injeção de fórmulas em planilhas.
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleExportar()}
            disabled={exportando || selecionadas.size === 0}
            className="cl-btn-primary px-5 py-2.5 text-xs sm:text-sm shrink-0 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {exportando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando Pacote .ZIP...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>
                  Baixar Pacote Completo (.ZIP para Excel)
                  {contagens && selecionadas.size > 0
                    ? ` • ${totalSelecionado.toLocaleString("pt-BR")}`
                    : ""}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
