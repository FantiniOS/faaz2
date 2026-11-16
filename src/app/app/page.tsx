'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Calendar,
  Clock,
  Droplets,
  Flame,
  Dumbbell,
  Activity,
  Moon,
  Smile,
  ChevronRight,
  CheckCircle2,
  Home as HomeIcon,
  Utensils,
  MessageCircle,
  User,
  Sparkles,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { mockPatientHome } from "@/mocks/patientHome";

export default function PatientAppDashboard() {
  const [aguaAtual, setAguaAtual] = useState(mockPatientHome.metasHoje.agua.atual);
  const [treinoFeito, setTreinoFeito] = useState(mockPatientHome.metasHoje.treinoFeito);
  const [checkinsConcluidos, setCheckinsConcluidos] = useState<string[]>([]);
  const [pacienteInfo, setPacienteInfo] = useState<{
    id: string;
    nome: string;
    fase: string;
    proximaConsulta: string;
  }>({
    id: "92dab67a-1977-4690-ae23-7cc60499a0c5",
    nome: "Carlos",
    fase: "Queima Acelerada",
    proximaConsulta: "Sincronizando...",
  });

  // Modal de Check-in de Sono
  const [isModalSonoOpen, setIsModalSonoOpen] = useState(false);
  const [horasSonoModal, setHorasSonoModal] = useState<number>(7.5);
  const [qualidadeSonoModal, setQualidadeSonoModal] = useState<string>("BOM");
  const [obsSonoModal, setObsSonoModal] = useState<string>("");
  const [isSalvandoSono, setIsSalvandoSono] = useState(false);

  useEffect(() => {
    async function carregarDados() {
      try {
        const res = await fetch("/api/paciente/dieta", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.sucesso && data.paciente) {
            setPacienteInfo((prev) => ({
              ...prev,
              id: data.paciente.id || prev.id,
              nome: data.paciente.nome?.split(" ")[0] || prev.nome,
            }));
          }
        }
      } catch {
        // Fallback suave
      }
    }
    carregarDados();
  }, []);

  const metaAgua = mockPatientHome.metasHoje.agua.meta;
  const metaCalorias = mockPatientHome.metasHoje.calorias.meta;
  const caloriasAtual = mockPatientHome.metasHoje.calorias.atual;

  const percAgua = Math.min(Math.round((aguaAtual / metaAgua) * 100), 100);
  const percCal = Math.min(Math.round((caloriasAtual / metaCalorias) * 100), 100);

  function handleAddAgua(qtd: number) {
    setAguaAtual((prev) => parseFloat((prev + qtd).toFixed(2)));
  }

  function handleCheckinPress(id: string, titulo: string) {
    if (id === "sono") {
      setIsModalSonoOpen(true);
      return;
    }

    if (checkinsConcluidos.includes(id)) {
      alert(`Você já registrou seu check-in de ${titulo} hoje!`);
    } else {
      setCheckinsConcluidos((prev) => [...prev, id]);
      alert(`Check-in de ${titulo} registrado com sucesso na Clínica FAAZ!`);
    }
  }

  async function handleSalvarSonoModal() {
    try {
      setIsSalvandoSono(true);
      const res = await fetch("/api/checkin/sono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pacienteId: pacienteInfo.id,
          horas: horasSonoModal,
          horasDormidas: horasSonoModal,
          qualidade: qualidadeSonoModal,
          observacao: obsSonoModal.trim() ? obsSonoModal.trim().toUpperCase() : undefined,
        }),
      });

      if (res.ok) {
        setCheckinsConcluidos((prev) => Array.from(new Set([...prev, "sono"])));
        setIsModalSonoOpen(false);
        alert(`Check-in de sono (${horasSonoModal}h) sincronizado com seu prontuário na Clínica FAAZ!`);
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || "Erro ao salvar check-in de sono.");
      }
    } catch {
      alert("Falha ao comunicar com o servidor.");
    } finally {
      setIsSalvandoSono(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* CONTAINER RESPONSIVO MOBILE-FIRST */}
      <div className="w-full max-w-md min-h-screen bg-slate-50 flex flex-col border-x border-slate-200/80 shadow-2xl relative pb-24">
        {/* ======================================================== */}
        {/* 1. HEADER DO APP (PADRÃO CLÍNICA FAAZ) */}
        {/* ======================================================== */}
        <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 py-3 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-widest text-teal-400 uppercase block leading-tight">
                Clínica FAAZ
              </span>
              <span className="text-xs font-semibold text-slate-300">
                Portal do Paciente
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <ShieldCheck className="w-3 h-3 text-teal-400" />
              Ativo
            </span>
            <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center text-white text-xs font-bold border border-teal-500/30">
              {pacienteInfo.nome.charAt(0)}
            </div>
          </div>
        </header>

        {/* ======================================================== */}
        {/* 2. CONTEÚDO PRINCIPAL (DASHBOARD MOBILE) */}
        {/* ======================================================== */}
        <main className="flex-1 px-4 pt-4 pb-6 space-y-4">
          {/* SAUDAÇÃO */}
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">
              Bom dia, {pacienteInfo.nome} ✨
            </h1>
            <p className="text-xs text-slate-500">
              Seu plano de longevidade e nutrição para hoje.
            </p>
          </div>

          {/* CARD DARK: FASE & PROTOCOLO */}
          <div className="bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-4 text-white shadow-lg border border-teal-800/40 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-400/30">
                <Sparkles className="w-3 h-3 text-teal-300" />
                FASE ATUAL: QUEIMA ACELERADA
              </div>
              <span className="text-[10px] font-bold text-teal-400 bg-teal-900/60 px-2 py-0.5 rounded-full border border-teal-700/50">
                Confirmado
              </span>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block">
                  Próxima Consulta • Retorno
                </span>
                <span className="text-sm font-bold text-white block mt-0.5">
                  15 de Novembro • 14:30
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Dr. Carlos Fantini • Endocrinologia & Nutrologia
                </span>
              </div>
            </div>
          </div>

          {/* SESSÃO: SUAS METAS HOJE */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Suas Metas Hoje
              </h2>
              <span className="text-[11px] text-teal-700 font-semibold">
                Acompanhamento diário
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* CARD ÁGUA */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-sky-700">{percAgua}%</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    Água Ingerida
                  </span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {aguaAtual} <span className="text-xs font-normal text-slate-500">/ {metaAgua} L</span>
                  </span>
                </div>

                {/* BARRA DE PROGRESSO */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${percAgua}%` }}
                  />
                </div>

                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => handleAddAgua(0.25)}
                    className="flex-1 py-1 px-1 text-[10px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg border border-sky-200 text-center transition-colors cursor-pointer"
                  >
                    +250ml
                  </button>
                  <button
                    onClick={() => handleAddAgua(0.5)}
                    className="flex-1 py-1 px-1 text-[10px] font-bold bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-center transition-colors shadow-2xs cursor-pointer"
                  >
                    +500ml
                  </button>
                </div>
              </div>

              {/* CARD ALIMENTAÇÃO / DIETA (LINK CLICÁVEL DIRETO) */}
              <Link
                href="/app/dieta"
                className="bg-white rounded-2xl p-3.5 border border-slate-200/90 hover:border-teal-400 shadow-2xs space-y-2 block transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 group-hover:bg-teal-50 group-hover:text-teal-700 transition-colors">
                    <Flame className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-teal-700">{percCal}%</span>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block group-hover:text-teal-700 transition-colors">
                    Alimentação
                  </span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {caloriasAtual} <span className="text-xs font-normal text-slate-500">/ {metaCalorias} kcal</span>
                  </span>
                </div>

                {/* BARRA DE PROGRESSO */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-teal-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${percCal}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-bold text-teal-700">Ver Cardápio</span>
                  <ChevronRight className="w-3.5 h-3.5 text-teal-700 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            </div>

            {/* BOTÃO TREINO */}
            {!treinoFeito ? (
              <button
                onClick={() => setTreinoFeito(true)}
                className="w-full py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-teal-700/20 transition-all cursor-pointer"
              >
                <Dumbbell className="w-4 h-4" />
                Fiz meu treino de hoje!
              </button>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-emerald-800">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Treino de hoje registrado! 🎉</span>
                </div>
                <button
                  onClick={() => setTreinoFeito(false)}
                  className="text-[11px] text-emerald-700 underline cursor-pointer"
                >
                  Desfazer
                </button>
              </div>
            )}
          </div>

          {/* SESSÃO: CHECK-INS RÁPIDOS */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Check-ins Rápidos
              </h2>
              <span className="text-[11px] text-slate-400 font-medium">
                Menos de 1 minuto
              </span>
            </div>

            <div className="space-y-2">
              {mockPatientHome.checkinsPendentes.map((item) => {
                const isDone = checkinsConcluidos.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleCheckinPress(item.id, item.titulo)}
                    className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all text-left cursor-pointer ${
                      isDone
                        ? "bg-teal-50/50 border-teal-200 text-slate-600"
                        : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          item.id === "bristol"
                            ? "bg-amber-100 text-amber-700"
                            : item.id === "sono"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {item.id === "bristol" && <Activity className="w-5 h-5" />}
                        {item.id === "sono" && <Moon className="w-5 h-5" />}
                        {item.id === "humor" && <Smile className="w-5 h-5" />}
                      </div>

                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          {item.titulo}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {isDone ? "✓ Registrado hoje na Clínica FAAZ" : item.subtitulo}
                        </span>
                      </div>
                    </div>

                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-teal-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        {/* MODAL INTERATIVO DE CHECK-IN DE SONO */}
        {isModalSonoOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
                    <Moon className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Check-in de Sono</h3>
                    <p className="text-[10px] text-slate-500 font-medium">Sincronização com o Prontuário</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalSonoOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* SELETOR DE HORAS */}
              <div className="text-center py-2 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Tempo Dormido
                </span>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setHorasSonoModal((prev) => Math.max(1, Math.round((prev - 0.5) * 10) / 10))}
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-lg cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-3xl font-black text-slate-900 font-mono">
                    {horasSonoModal.toFixed(1)}h
                  </span>
                  <button
                    type="button"
                    onClick={() => setHorasSonoModal((prev) => Math.min(14, Math.round((prev + 0.5) * 10) / 10))}
                    className="w-9 h-9 rounded-xl bg-teal-100 hover:bg-teal-200 text-teal-800 font-black text-lg cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
                  {[6.0, 7.0, 7.5, 8.0, 8.5, 9.0].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHorasSonoModal(h)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                        horasSonoModal === h
                          ? "bg-violet-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* QUALIDADE */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                  Qualidade do Descanso
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["RUIM", "REGULAR", "BOM", "EXCELENTE"].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQualidadeSonoModal(q)}
                      className={`py-1 px-1 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                        qualidadeSonoModal === q
                          ? "bg-violet-50 text-violet-800 border-violet-400 shadow-2xs"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* OBSERVAÇÃO */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  value={obsSonoModal}
                  onChange={(e) => setObsSonoModal(e.target.value)}
                  placeholder="Ex: Acordei descansado, sem insônia"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-teal-500 uppercase"
                />
              </div>

              {/* BOTÃO SALVAR */}
              <button
                type="button"
                onClick={handleSalvarSonoModal}
                disabled={isSalvandoSono}
                className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isSalvandoSono ? "Sincronizando com Prontuário..." : "Salvar Check-in de Sono"}
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. BARRA DE NAVEGAÇÃO INFERIOR FIXA */}
        {/* ======================================================== */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 z-40 flex items-center justify-around shadow-lg">
          <Link
            href="/app"
            className="flex flex-col items-center gap-0.5 py-1 text-teal-700 font-bold"
          >
            <HomeIcon className="w-5 h-5 stroke-[2.5]" />
            <span className="text-[10px]">Home</span>
          </Link>

          <Link
            href="/app/dieta"
            className="flex flex-col items-center gap-0.5 py-1 text-slate-400 hover:text-teal-700 transition-colors"
          >
            <Utensils className="w-5 h-5" />
            <span className="text-[10px] font-medium">Dieta</span>
          </Link>

          <button
            onClick={() =>
              alert("O chat com a equipe médica está disponível em horário comercial.")
            }
            className="flex flex-col items-center gap-0.5 py-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-[10px] font-medium">Chat</span>
          </button>

          <button
            onClick={() =>
              alert(`Perfil: ${pacienteInfo.nome} • Clínica FAAZ`)
            }
            className="flex flex-col items-center gap-0.5 py-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-medium">Perfil</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
