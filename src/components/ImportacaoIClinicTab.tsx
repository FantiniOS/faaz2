"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  FileArchive,
  FileSpreadsheet,
  Loader2,
  Lock,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import {
  LIMITE_UPLOAD_ICLINIC_BYTES,
  LIMITE_UPLOAD_ICLINIC_MB,
  type ModoDuplicadosImportacao,
  type PreviewImportacaoIClinicResponse,
  type ResultadoImportacaoIClinicResponse,
} from "@/lib/importacao-iclinic-types";

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImportacaoIClinicTab() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arrastando, setArrastando] = useState(false);

  const [baixandoModelo, setBaixandoModelo] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [preview, setPreview] =
    useState<PreviewImportacaoIClinicResponse | null>(null);
  const [abaPrevia, setAbaPrevia] = useState<
    "pacientes" | "prontuarios" | "agendamentos" | "anexos"
  >("pacientes");

  const [medicoPadraoId, setMedicoPadraoId] = useState<string>("");
  const [mapeamentoMedicos, setMapeamentoMedicos] = useState<
    Record<string, string>
  >({});
  const [modoDuplicados, setModoDuplicados] =
    useState<ModoDuplicadosImportacao>("ignorar");

  const [resultado, setResultado] =
    useState<ResultadoImportacaoIClinicResponse | null>(null);

  const validarEAdicionarArquivos = (lista: FileList | File[]) => {
    setErro(null);
    const incoming = Array.from(lista);
    if (incoming.length === 0) return;

    const validos: File[] = [];
    for (const f of incoming) {
      const lower = f.name.toLowerCase();
      if (!lower.endsWith(".zip") && !lower.endsWith(".csv")) {
        setErro(
          `Arquivo "${f.name}" recusado. Envie apenas um pacote .zip ou arquivos .csv do iClinic.`,
        );
        return;
      }
      validos.push(f);
    }

    const zipEncontrado = validos.find((f) =>
      f.name.toLowerCase().endsWith(".zip"),
    );
    let proximos: File[];
    if (zipEncontrado) {
      proximos = [zipEncontrado];
    } else {
      const atuaisCsv = arquivos.filter((f) =>
        f.name.toLowerCase().endsWith(".csv"),
      );
      const mapByName = new Map<string, File>();
      for (const f of atuaisCsv) mapByName.set(f.name.toLowerCase(), f);
      for (const f of validos) mapByName.set(f.name.toLowerCase(), f);
      proximos = Array.from(mapByName.values()).slice(0, 4);
    }

    const totalSize = proximos.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > LIMITE_UPLOAD_ICLINIC_BYTES) {
      setErro(
        `O envio ultrapassa o limite seguro de ${LIMITE_UPLOAD_ICLINIC_MB} MB.`,
      );
      return;
    }

    setArquivos(proximos);
  };

  const removerArquivo = (nome: string) => {
    setErro(null);
    setArquivos((prev) => prev.filter((f) => f.name !== nome));
  };

  const handleBaixarModelo = async () => {
    setErro(null);
    setBaixandoModelo(true);
    try {
      const res = await fetch("/api/clinica/importar/iclinic/modelo", {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErro(data?.error || "Não foi possível baixar o pacote de exemplo.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo_teste_iclinic.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setErro("Erro de conexão ao baixar o pacote de exemplo iClinic.");
    } finally {
      setBaixandoModelo(false);
    }
  };

  const handleAnalisarPreview = async () => {
    if (arquivos.length === 0) {
      setErro("Selecione um arquivo .zip ou arquivos .csv do iClinic primeiro.");
      return;
    }

    setErro(null);
    setAnalisando(true);
    try {
      const formData = new FormData();
      for (const f of arquivos) {
        formData.append("files", f, f.name);
      }

      const res = await fetch("/api/clinica/importar/iclinic/preview", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.sucesso) {
        setErro(
          data?.error ||
            "Não foi possível analisar os arquivos enviados. Verifique se seguem o formato do iClinic.",
        );
        return;
      }

      const previewData = data as PreviewImportacaoIClinicResponse;
      setPreview(previewData);

      const defaultDocId = previewData.profissionaisClinica[0]?.id || "";
      setMedicoPadraoId(defaultDocId);

      const initMap: Record<string, string> = {};
      previewData.physiciansEncontrados.forEach((ph, idx) => {
        const sugerido =
          previewData.profissionaisClinica[idx]?.id || defaultDocId;
        if (sugerido) {
          initMap[ph.physicianId] = sugerido;
        }
      });
      setMapeamentoMedicos(initMap);

      if (previewData.previas.pacientes.length > 0) setAbaPrevia("pacientes");
      else if (previewData.previas.prontuarios.length > 0)
        setAbaPrevia("prontuarios");
      else if (previewData.previas.agendamentos.length > 0)
        setAbaPrevia("agendamentos");
      else setAbaPrevia("anexos");

      setPasso(2);
    } catch {
      setErro("Erro de conexão ao analisar os arquivos no servidor.");
    } finally {
      setAnalisando(false);
    }
  };

  const handleExecutarImportacao = async () => {
    if (!preview || arquivos.length === 0) return;
    if (!medicoPadraoId) {
      setErro(
        "Selecione o profissional padrão da clínica para concluir a importação.",
      );
      return;
    }

    setErro(null);
    setExecutando(true);
    try {
      const formData = new FormData();
      for (const f of arquivos) {
        formData.append("files", f, f.name);
      }
      formData.append("medicoPadraoId", medicoPadraoId);
      formData.append("mapeamentoMedicos", JSON.stringify(mapeamentoMedicos));
      formData.append("modoDuplicados", modoDuplicados);

      const res = await fetch("/api/clinica/importar/iclinic/executar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.sucesso) {
        setErro(
          data?.error ||
            "Falha ao gravar os registros importados. Nenhuma alteração parcial foi aplicada.",
        );
        return;
      }

      setResultado(data as ResultadoImportacaoIClinicResponse);
      setPasso(3);
    } catch {
      setErro("Erro de conexão durante a importação.");
    } finally {
      setExecutando(false);
    }
  };

  const handleReiniciar = () => {
    setPasso(1);
    setArquivos([]);
    setPreview(null);
    setResultado(null);
    setErro(null);
    setModoDuplicados("ignorar");
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho + Stepper de 3 Passos */}
      <div className="cl-card p-5 sm:p-6 bg-gradient-to-br from-white via-emerald-50/35 to-sky-50/35 border-emerald-200/70 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100/90 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Migração Assistida • Padrão Oficial iClinic</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-600 border border-slate-200">
                <Lock className="w-3 h-3 text-emerald-600" />
                <span>Simulação Prévia + Execução Idempotente</span>
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Importar Base do iClinic
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              Traga pacientes, evoluções de prontuário, agenda e referências de
              anexos diretamente do pacote de exportação do iClinic para a
              Clínica FAAZ. Primeiro simulamos sem gravar nada; você confere os
              números e mapeia cada médico antes de confirmar.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleBaixarModelo()}
            disabled={baixandoModelo}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-300 shadow-2xs transition-colors self-start lg:self-center cursor-pointer disabled:opacity-60"
          >
            {baixandoModelo ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Baixar pacote de exemplo (formato iClinic)</span>
          </button>
        </div>

        {/* Stepper Visual */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/60">
          {[
            {
              num: 1 as const,
              titulo: "1. Enviar Arquivos",
              desc: "ZIP ou CSVs do iClinic",
            },
            {
              num: 2 as const,
              titulo: "2. Prévia & Médicos",
              desc: "Conferir e mapear equipe",
            },
            {
              num: 3 as const,
              titulo: "3. Relatório Final",
              desc: "Resumo da importação",
            },
          ].map((st) => {
            const ativo = passo === st.num;
            const concluido = passo > st.num;
            return (
              <div
                key={st.num}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
                  ativo
                    ? "bg-white border-emerald-300 shadow-2xs"
                    : concluido
                      ? "bg-emerald-50/70 border-emerald-200/80"
                      : "bg-slate-50/70 border-slate-200/70 opacity-75"
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                    ativo
                      ? "bg-emerald-600 text-white"
                      : concluido
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {concluido ? <CheckCircle2 className="w-4 h-4" /> : st.num}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    {st.titulo}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {st.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Erro Global */}
      {erro && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-semibold flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span>{erro}</span>
        </div>
      )}

      {/* ==================== PASSO 1: UPLOAD DE ARQUIVOS ==================== */}
      {passo === 1 && (
        <div className="cl-card p-5 sm:p-6 space-y-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              if (e.dataTransfer.files) {
                validarEAdicionarArquivos(e.dataTransfer.files);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
              arrastando
                ? "border-emerald-500 bg-emerald-50/60"
                : "border-slate-300 hover:border-emerald-400 bg-slate-50/50 hover:bg-emerald-50/25"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".zip,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  validarEAdicionarArquivos(e.target.files);
                  e.target.value = "";
                }
              }}
            />

            <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-100/80 border border-emerald-200 text-emerald-700 flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-extrabold text-slate-900">
              Arraste o pacote{" "}
              <code className="font-mono text-emerald-700">.zip</code> do
              iClinic ou clique para selecionar os arquivos
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Aceita 1 pacote <strong className="text-slate-700">.zip</strong> OU
              de 1 a 4 arquivos{" "}
              <strong className="text-slate-700">.csv</strong> individuais
              (limite {LIMITE_UPLOAD_ICLINIC_MB} MB).
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {[
                "patient.csv",
                "event_record.csv",
                "event_scheduling.csv",
                "event_attachment.csv",
              ].map((nome) => (
                <span
                  key={nome}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-mono font-semibold text-slate-600"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  {nome}
                </span>
              ))}
            </div>
          </div>

          {arquivos.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  Arquivos prontos para análise ({arquivos.length})
                </span>
                <button
                  type="button"
                  onClick={() => setArquivos([])}
                  className="text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  Limpar seleção
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {arquivos.map((f) => {
                  const isZip = f.name.toLowerCase().endsWith(".zip");
                  return (
                    <div
                      key={f.name}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-emerald-50/40 border border-emerald-200"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                          {isZip ? (
                            <FileArchive className="w-4 h-4" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {f.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {formatarTamanho(f.size)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removerArquivo(f.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remover arquivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                A análise inicial é 100% segura (somente leitura) e não grava
                nenhum dado no banco.
              </span>
            </p>
            <button
              type="button"
              onClick={() => void handleAnalisarPreview()}
              disabled={analisando || arquivos.length === 0}
              className="cl-btn-primary px-5 py-2.5 text-xs sm:text-sm shrink-0 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {analisando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analisando arquivos...</span>
                </>
              ) : (
                <>
                  <span>Analisar e Simular Importação</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==================== PASSO 2: PRÉVIA & MAPEAMENTO ==================== */}
      {passo === 2 && preview && (
        <div className="space-y-5">
          <div className="cl-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-700">
                Arquivos reconhecidos:
              </span>
              {preview.arquivosDetectados.map((arq) => (
                <span
                  key={arq.tipo}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-mono font-semibold"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>{arq.nomeOriginal}</span>
                  <span className="text-emerald-600">
                    ({arq.linhasLidas} linhas • {arq.encoding})
                  </span>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setPasso(1);
                setErro(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Trocar arquivos</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="cl-card p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Pacientes Novos
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {preview.contagens.pacientesNovos.toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-slate-500">
                de {preview.contagens.pacientesTotalCsv} no CSV
              </p>
            </div>

            <div className="cl-card p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Já Existentes
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {preview.contagens.pacientesExistentes.toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-slate-500">
                deduplicados por CPF/nome
              </p>
            </div>

            <div className="cl-card p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5" /> Consultas Agrupadas
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {preview.contagens.consultasAgrupadas.toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-slate-500">
                de {preview.contagens.linhasProntuarioBrutas} blocos clínicos
              </p>
            </div>

            <div className="cl-card p-4 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Agendamentos
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {preview.contagens.agendamentosValidos.toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-slate-500">
                {preview.contagens.bloqueiosIgnorados} bloqueio(s) ignorado(s)
              </p>
            </div>

            <div className="cl-card p-4 space-y-1 col-span-2 lg:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" /> Anexos (Ref.)
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {preview.contagens.referenciasAnexos.toLocaleString("pt-BR")}
              </p>
              <p className="text-[11px] text-slate-500">
                notas estruturadas no histórico
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="cl-card p-5 space-y-4 lg:col-span-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-emerald-600" />
                  <span>Mapeamento de Profissionais (iClinic → Clínica FAAZ)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vincule cada{" "}
                  <code className="font-mono text-slate-700">physician_id</code>{" "}
                  encontrado nos arquivos a um médico ativo da Clínica FAAZ.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <label className="text-xs font-extrabold text-slate-800 block">
                    Profissional padrão (fallback obrigatório) *
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Usado quando um registro não possuir physician_id específico.
                  </span>
                </div>
                <select
                  value={medicoPadraoId}
                  onChange={(e) => setMedicoPadraoId(e.target.value)}
                  className="no-uppercase px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 min-w-[230px] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  {preview.profissionaisClinica.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.nome}
                      {prof.crm ? ` (${prof.crm})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {preview.physiciansEncontrados.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          ID Médico iClinic
                        </th>
                        <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Registros
                        </th>
                        <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Profissional na Clínica FAAZ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.physiciansEncontrados.map((ph) => (
                        <tr key={ph.physicianId}>
                          <td className="px-3.5 py-2.5 font-mono font-bold text-slate-800">
                            {ph.physicianId}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-600 tabular-nums">
                            {ph.qtdProntuarios} pront. • {ph.qtdAgendamentos} ag.
                            {ph.qtdAnexos > 0 ? ` • ${ph.qtdAnexos} anex.` : ""}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <select
                              value={
                                mapeamentoMedicos[ph.physicianId] ||
                                medicoPadraoId
                              }
                              onChange={(e) =>
                                setMapeamentoMedicos((prev) => ({
                                  ...prev,
                                  [ph.physicianId]: e.target.value,
                                }))
                              }
                              className="no-uppercase w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
                            >
                              {preview.profissionaisClinica.map((prof) => (
                                <option key={prof.id} value={prof.id}>
                                  {prof.nome}
                                  {prof.especialidade
                                    ? ` — ${prof.especialidade}`
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Nenhum <code className="font-mono">physician_id</code>{" "}
                  específico encontrado; todos os registros usarão o profissional
                  padrão.
                </p>
              )}
            </div>

            <div className="cl-card p-5 space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Política para Duplicados
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Como tratar pacientes que já existem na base da clínica.
                </p>
              </div>

              <div className="space-y-2.5">
                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    modoDuplicados === "ignorar"
                      ? "bg-emerald-50/60 border-emerald-300"
                      : "bg-white border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="modoDuplicados"
                    checked={modoDuplicados === "ignorar"}
                    onChange={() => setModoDuplicados("ignorar")}
                    className="mt-0.5 accent-emerald-600"
                  />
                  <div>
                    <p className="text-xs font-extrabold text-slate-900">
                      Ignorar duplicados (Recomendado)
                    </p>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      Preserva 100% do cadastro atual e reutiliza o paciente
                      existente para vincular novos prontuários e agenda.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                    modoDuplicados === "atualizar_vazios"
                      ? "bg-emerald-50/60 border-emerald-300"
                      : "bg-white border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="modoDuplicados"
                    checked={modoDuplicados === "atualizar_vazios"}
                    onChange={() => setModoDuplicados("atualizar_vazios")}
                    className="mt-0.5 accent-emerald-600"
                  />
                  <div>
                    <p className="text-xs font-extrabold text-slate-900">
                      Completar campos vazios
                    </p>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      Preenche apenas campos em branco (ex.: endereço, e-mail,
                      RG) sem sobrescrever dados já cadastrados.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {preview.avisos.length > 0 && (
            <div className="rounded-2xl p-4 bg-amber-50/80 border border-amber-200 space-y-1.5">
              <p className="text-xs font-extrabold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Avisos da análise ({preview.avisos.length})</span>
              </p>
              <ul className="list-disc pl-5 text-xs text-amber-800 space-y-1">
                {preview.avisos.slice(0, 8).map((av, i) => (
                  <li key={i}>{av}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="cl-card overflow-hidden">
            <div className="px-5 pt-4 pb-2 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                Prévia Sanitizada (primeiros registros)
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    ["pacientes", "Pacientes", preview.previas.pacientes.length],
                    [
                      "prontuarios",
                      "Prontuários",
                      preview.previas.prontuarios.length,
                    ],
                    [
                      "agendamentos",
                      "Agendamentos",
                      preview.previas.agendamentos.length,
                    ],
                    ["anexos", "Anexos", preview.previas.anexos.length],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAbaPrevia(key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      abaPrevia === key
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {abaPrevia === "pacientes" && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Status
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Nome (CAIXA ALTA)
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Nascimento
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        CPF
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Telefone
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Convênio
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previas.pacientes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-slate-400"
                        >
                          Nenhum paciente neste envio.
                        </td>
                      </tr>
                    ) : (
                      preview.previas.pacientes.map((p, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                p.statusMatch === "NOVO"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-sky-50 text-sky-700 border-sky-200"
                              }`}
                            >
                              {p.statusMatch}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-slate-900">
                            {p.nome}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {p.dataNascimento || "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {p.cpf || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {p.telefone || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {p.convenio}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {abaPrevia === "prontuarios" && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Paciente
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Data/Hora
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Médico ID
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Blocos
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Texto Sanitizado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previas.prontuarios.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-slate-400"
                        >
                          Nenhuma evolução de prontuário neste envio.
                        </td>
                      </tr>
                    ) : (
                      preview.previas.prontuarios.map((pr, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5 font-bold text-slate-900">
                            {pr.pacienteNome}
                            {!pr.pacienteVinculado && (
                              <span className="ml-1.5 text-[10px] text-rose-600 font-bold">
                                (sem vínculo)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                            {pr.dataAtendimento}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {pr.physicianId}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                            {pr.qtdBlocos} bloco(s)
                            {pr.qtdAnexos > 0
                              ? ` + ${pr.qtdAnexos} anexo(s)`
                              : ""}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-pre-line max-w-md">
                            {pr.resumoTexto}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {abaPrevia === "agendamentos" && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Paciente
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Data/Hora
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Médico ID
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Status iClinic → FAAZ
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Convênio
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previas.agendamentos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-6 text-center text-slate-400"
                        >
                          Nenhum agendamento válido neste envio.
                        </td>
                      </tr>
                    ) : (
                      preview.previas.agendamentos.map((ag, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5 font-bold text-slate-900">
                            {ag.pacienteNome}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {ag.dataHora}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {ag.physicianId}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-slate-400 font-mono">
                              {ag.statusOriginal}
                            </span>
                            <span className="mx-1.5 text-slate-400">→</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {ag.statusMapeado}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {ag.convenio || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {abaPrevia === "anexos" && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Paciente
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Data
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Título
                      </th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">
                        Arquivo Referenciado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previas.anexos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-slate-400"
                        >
                          Nenhuma referência de anexo neste envio.
                        </td>
                      </tr>
                    ) : (
                      preview.previas.anexos.map((an, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5 font-bold text-slate-900">
                            {an.pacienteNome}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {an.data}
                          </td>
                          <td className="px-4 py-2.5 text-slate-800">
                            {an.titulo}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {an.arquivo}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="cl-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              {executando ? (
                <div className="space-y-2 w-full sm:w-80">
                  <p className="text-xs font-extrabold text-emerald-700 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gravando registros em transação segura...</span>
                  </p>
                  <div className="h-2 w-full rounded-full bg-emerald-100 overflow-hidden">
                    <div className="h-full w-2/3 bg-emerald-600 rounded-full animate-pulse" />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Importação transacional, idempotente (sem duplicar reenvios)
                    e registrada em trilha de auditoria.
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setPasso(1)}
                disabled={executando}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 cursor-pointer disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void handleExecutarImportacao()}
                disabled={executando || !medicoPadraoId}
                className="cl-btn-primary px-5 py-2.5 text-xs sm:text-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {executando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar e Importar Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PASSO 3: RELATÓRIO FINAL ==================== */}
      {passo === 3 && resultado && (
        <div className="cl-card p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                Importação do iClinic concluída com sucesso!
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Concluída em {resultado.concluidoEm} • Arquivos:{" "}
                <span className="font-mono text-slate-700">
                  {resultado.arquivosProcessados.join(", ")}
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-700">
                Pacientes Criados
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
                {resultado.totais.pacientesCriados}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {resultado.totais.pacientesReaproveitados} reaproveitado(s)
                {resultado.totais.pacientesAtualizadosVazios > 0
                  ? ` • ${resultado.totais.pacientesAtualizadosVazios} completado(s)`
                  : ""}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-200">
              <span className="text-[10px] font-bold uppercase text-teal-700">
                Consultas / Evoluções
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
                {resultado.totais.consultasCriadas}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {resultado.totais.consultasIgnoradasDuplicadas} duplicada(s)
                ignorada(s)
              </p>
            </div>

            <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200">
              <span className="text-[10px] font-bold uppercase text-sky-700">
                Agendamentos
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
                {resultado.totais.agendamentosCriados}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {resultado.totais.agendamentosIgnoradosDuplicados} duplicado(s) •{" "}
                {resultado.totais.bloqueiosIgnorados} bloqueio(s)
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
              <span className="text-[10px] font-bold uppercase text-amber-700">
                Anexos Referenciados
              </span>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
                {resultado.totais.anexosReferenciados}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {resultado.totais.registrosSemPacienteVinculado > 0
                  ? `${resultado.totais.registrosSemPacienteVinculado} sem paciente`
                  : "registrados no prontuário"}
              </p>
            </div>
          </div>

          {resultado.avisos.length > 0 && (
            <div className="rounded-xl p-4 bg-slate-50 border border-slate-200 space-y-1">
              <p className="text-xs font-extrabold text-slate-700">
                Observações do processo:
              </p>
              <ul className="list-disc pl-5 text-xs text-slate-600 space-y-0.5">
                {resultado.avisos.slice(0, 8).map((av, i) => (
                  <li key={i}>{av}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Evento auditado na trilha de segurança da Clínica FAAZ.
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleReiniciar}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Nova Importação</span>
              </button>

              <Link
                href="/dashboard/pacientes"
                className="cl-btn-primary px-4 py-2 text-xs"
              >
                <Users className="w-4 h-4" />
                <span>Ir para Lista de Pacientes</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
