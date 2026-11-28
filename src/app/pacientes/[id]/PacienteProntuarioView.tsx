"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Activity,
  Moon,
  Utensils,
  FileText,
  Sparkles,
  ShieldCheck,
  Calendar,
  ExternalLink,
  Target,
  CheckCircle2,
  Loader2,
  FlaskConical,
} from "lucide-react";
import { CLINICAL_OBJECTIVES } from "@/lib/clinical-objectives";
import { formatarDataBR } from "@/lib/date-br";
import { TopMenu } from "@/components/TopMenu";
import { MetasTab } from "@/components/MetasTab";
import { DietaTab } from "@/components/DietaTab";
import { ExamesTab } from "@/components/ExamesTab";
import { ExportarPacienteLgpdButton } from "@/components/ExportarPacienteLgpdButton";

export interface PacienteProntuarioViewProps {
  currentUserCargo?: string | null;
  paciente: {
    id: string;
    nome: string;
    recordCode: string;
    cpf: string;
    status: string;
    pesoAtual: number | null;
    alturaCm: number | null;
    metaDiariaMl: number;
    planoFaaz: boolean;
    avatarUrl?: string | null;
    treatmentObjective?: string | null;
  };
  ultimoSono?: {
    id?: string;
    horas: number;
    qualidade: string;
    observacao?: string | null;
    data: string;
  } | null;
}

export function PacienteProntuarioView({
  currentUserCargo,
  paciente,
  ultimoSono,
}: PacienteProntuarioViewProps) {
  const [activeTab, setActiveTab] = useState<"metas" | "exames" | "geral" | "dieta">("metas");
  const [evolucaoGeral, setEvolucaoGeral] = useState("");
  const [currentObjective, setCurrentObjective] = useState<string>(
    paciente.treatmentObjective || "Otimização Metabólica & Saúde Integrativa"
  );
  const [isUpdatingObjective, setIsUpdatingObjective] = useState(false);
  const [objectiveSavedRecently, setObjectiveSavedRecently] = useState(false);
  const [dataHojeBR, setDataHojeBR] = useState<string>("");

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) setDataHojeBR(formatarDataBR(new Date()));
    });
    return () => {
      ativo = false;
    };
  }, []);

  const handleObjectiveChange = async (novo: string) => {
    setCurrentObjective(novo);
    try {
      setIsUpdatingObjective(true);
      const res = await fetch(`/api/pacientes/${paciente.id}/metas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treatmentObjective: novo,
          focoMetabolico: novo,
        }),
      });
      if (res.ok) {
        setObjectiveSavedRecently(true);
        setTimeout(() => setObjectiveSavedRecently(false), 3000);
      }
    } catch (err) {
      console.error("Erro ao atualizar objetivo do paciente:", err);
    } finally {
      setIsUpdatingObjective(false);
    }
  };

  const imcCalculado =
    paciente.pesoAtual && paciente.alturaCm
      ? (paciente.pesoAtual / Math.pow(paciente.alturaCm / 100, 2)).toFixed(1)
      : null;

  return (
    <div className="w-full flex-1 min-h-screen bg-slate-50 flex flex-col font-sans">
      <TopMenu activePath="/pacientes" />

      {/* SUBHEADER DO PACIENTE - FULL WIDTH EDGE-TO-EDGE */}
      <div className="w-full bg-white border-b border-slate-200 px-4 md:px-6 lg:px-8 py-4 shadow-2xs">
        <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/pacientes"
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              title="Voltar para Lista de Pacientes"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
            </Link>

            {paciente.avatarUrl ? (
              <img
                src={paciente.avatarUrl}
                alt={paciente.nome}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-emerald-500/50 shadow-lg ring-2 ring-emerald-500/20 shrink-0"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-emerald-50 border-2 border-emerald-500/50 flex items-center justify-center text-emerald-700 shrink-0 font-black text-2xl shadow-lg ring-2 ring-emerald-500/20">
                {paciente.nome.charAt(0)}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  {paciente.nome}
                </h1>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                  {paciente.recordCode}
                </span>
                {paciente.planoFaaz && (
                  <span className="text-[10px] font-bold bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md border border-teal-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-teal-600" />
                    Plano FAAZ
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Prontuário Médico Digital • Sincronização Contínua Mobile
              </p>
            </div>
          </div>

          {/* OBJETIVO CLÍNICO INTERATIVO & AÇÕES RÁPIDAS NO TOPO */}
          <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 hover:border-teal-400/70 rounded-xl px-3 py-1.5 shadow-2xs transition-colors">
              <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200/70 flex items-center justify-center shrink-0">
                <Target className="w-3.5 h-3.5 text-teal-700" />
              </div>
              <div className="flex flex-col min-w-[200px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Objetivo do Tratamento
                  </span>
                  {isUpdatingObjective && (
                    <span className="text-[9px] font-bold text-teal-600 flex items-center gap-0.5 animate-pulse">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Salvando...
                    </span>
                  )}
                  {objectiveSavedRecently && (
                    <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Salvo no App!
                    </span>
                  )}
                </div>
                <select
                  value={currentObjective}
                  onChange={(e) => handleObjectiveChange(e.target.value)}
                  disabled={isUpdatingObjective}
                  className="text-xs font-extrabold text-slate-800 bg-transparent border-0 outline-hidden cursor-pointer p-0 pr-2 focus:ring-0"
                >
                  {CLINICAL_OBJECTIVES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ExportarPacienteLgpdButton
              pacienteId={paciente.id}
              pacienteNome={paciente.nome}
              currentUserCargo={currentUserCargo}
            />

            <Link
              href={`/dashboard/pacientes?prontuarioId=${paciente.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors shadow-2xs"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Abrir em Janela Modal</span>
            </Link>
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS DO PRONTUÁRIO - FLUIDO */}
        <div className="w-full flex items-center gap-2 mt-4 pt-2 border-t border-slate-100">
          <button
            onClick={() => setActiveTab("metas")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "metas"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Aba Metas & Sono</span>
          </button>

          <button
            onClick={() => setActiveTab("dieta")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "dieta"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Prescrição Dietética</span>
          </button>

          <button
            onClick={() => setActiveTab("exames")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "exames"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Exames</span>
          </button>

          <button
            onClick={() => setActiveTab("geral")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              activeTab === "geral"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Evolução & Anamnese</span>
          </button>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL FULL WIDTH EDGE-TO-EDGE */}
      <main className="w-full flex-1 px-4 md:px-6 lg:px-8 py-4 sm:py-6 flex flex-col min-h-0">
        {activeTab === "metas" ? (
          <div className="w-full flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <MetasTab
              pacienteId={paciente.id}
              pacienteNome={paciente.nome}
              pacienteMetaHidricaMl={paciente.metaDiariaMl}
              pacientePesoAtualKg={paciente.pesoAtual}
              pacienteAlturaCm={paciente.alturaCm}
              ultimoSonoInicial={ultimoSono}
            />
          </div>
        ) : activeTab === "exames" ? (
          <div className="w-full flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <ExamesTab
              pacienteId={paciente.id}
              pacienteNome={paciente.nome}
              pacienteRecordCode={paciente.recordCode}
              pacienteCpf={paciente.cpf}
              onCopiarParaEvolucao={(resumoTexto) => {
                setEvolucaoGeral((prev) => {
                  const base = prev.trim();
                  return base ? `${base}\n${resumoTexto}` : resumoTexto;
                });
              }}
            />
          </div>
        ) : activeTab === "dieta" ? (
          <div className="w-full flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <DietaTab
              pacienteId={paciente.id}
              pacienteNome={paciente.nome}
            />
          </div>
        ) : (
          <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
            {/* SIDEBAR DO PACIENTE (col-span-3) */}
            <aside className="col-span-1 lg:col-span-3 flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                  {paciente.avatarUrl ? (
                    <img
                      src={paciente.avatarUrl}
                      alt={paciente.nome}
                      className="w-14 h-14 rounded-full border border-slate-200 object-cover shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-800 font-black text-xl shrink-0">
                      {paciente.nome.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-black text-slate-900">{paciente.nome}</h3>
                    <p className="text-[11px] font-mono text-slate-500">{paciente.recordCode}</p>
                    <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {paciente.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Peso Atual</span>
                    <span className="font-bold text-slate-800">
                      {paciente.pesoAtual ? `${paciente.pesoAtual} kg` : "Não registrado"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Altura</span>
                    <span className="font-bold text-slate-800">
                      {paciente.alturaCm ? `${paciente.alturaCm} cm` : "Não registrada"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">IMC Calculado</span>
                    <span className="font-bold font-mono text-teal-700">
                      {imcCalculado ? `${imcCalculado} kg/m²` : "--"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-500 font-medium">Meta Hídrica</span>
                    <span className="font-bold text-sky-700">
                      {paciente.metaDiariaMl ? `${(paciente.metaDiariaMl / 1000).toFixed(1)} L/dia` : "2.5 L/dia"}
                    </span>
                  </div>
                  {ultimoSono && (
                    <div className="flex justify-between items-center py-1 border-b border-slate-50">
                      <span className="text-slate-500 font-medium">Último Sono</span>
                      <span className="font-bold text-indigo-700">
                        {ultimoSono.horas}h ({ultimoSono.qualidade})
                      </span>
                    </div>
                  )}
                </div>

                <Link
                  href={`/dashboard/pacientes?prontuarioId=${paciente.id}`}
                  className="w-full cl-btn-primary px-4 py-2.5 text-xs"
                >
                  <span>Abrir Atendimento Completo</span>
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-100" />
                </Link>
              </div>
            </aside>

            {/* ÁREA PRINCIPAL DE EVOLUÇÃO E ANOTAÇÕES MÉDICAS (col-span-9) */}
            <section className="col-span-1 lg:col-span-9 flex flex-col gap-5 min-h-0">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 md:p-6 flex flex-col flex-1 min-h-[420px]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/60">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900">
                        Evolução Clínica & Conduta Médica do Dia
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Espaço expansivo para anotações detalhadas, anamnese e conduta terapêutica.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>Hoje{dataHojeBR ? ` • ${dataHojeBR}` : ""}</span>
                  </span>
                </div>

                {/* TEXTAREA DINÂMICO FLEX-GROW / H-FULL */}
                <div className="flex-1 flex flex-col min-h-[220px] mt-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 shrink-0">
                    Anotações Clínicas / Evolução Médica (Full Width)
                  </label>
                  <textarea
                    value={evolucaoGeral}
                    onChange={(e) => setEvolucaoGeral(e.target.value)}
                    placeholder="Descreva a evolução do paciente, alterações metabólicas, ajuste de prescrição, metas e orientações..."
                    className="w-full flex-1 flex-grow h-full min-h-[220px] p-4 text-xs font-normal leading-relaxed text-slate-900 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all resize-y placeholder:text-slate-400"
                  />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 shrink-0">
                  <span className="text-xs text-slate-400">
                    As evoluções sincronizam em tempo real com o banco de dados clínico.
                  </span>
                  <Link
                    href={`/dashboard/pacientes?prontuarioId=${paciente.id}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                  >
                    <span>Salvar no Prontuário Oficial</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
