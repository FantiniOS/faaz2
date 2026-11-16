'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Utensils,
  ChevronLeft,
  Clock,
  Flame,
  Sparkles,
  Info,
  CheckCircle2,
  Calendar,
  Coffee,
  Sun,
  Moon,
  Apple,
  Home as HomeIcon,
  MessageCircle,
  User,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface AlimentoItem {
  id: string;
  nome: string;
  categoria?: string;
  caloriasPorcao: number;
  proteinasPorcao: number;
  carboidratosPorcao: number;
  gordurasPorcao: number;
  fibrasPorcao?: number;
}

interface ItemRefeicao {
  id: string;
  quantidadeGramas: number;
  observacao?: string | null;
  alimento: AlimentoItem;
}

interface TotaisNutricionais {
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  fibras: number;
}

interface Refeicao {
  id: string;
  nome: string;
  horario: string;
  ordem: number;
  observacoes?: string | null;
  totais: TotaisNutricionais;
  itens: ItemRefeicao[];
}

interface VariacaoDieta {
  id: string;
  nome: string;
  descricao?: string | null;
  ordem: number;
  totais: TotaisNutricionais;
  refeicoes: Refeicao[];
}

interface PlanoAlimentarData {
  id: string;
  titulo: string;
  objetivo?: string | null;
  caloriasAlvo?: number | null;
  variacoes: VariacaoDieta[];
}

interface PacienteData {
  id: string;
  nome: string;
  medico: string;
  especialidade: string;
  focoClinico?: string | null;
}

export default function AppDietaPage() {
  const [plano, setPlano] = useState<PlanoAlimentarData | null>(null);
  const [paciente, setPaciente] = useState<PacienteData | null>(null);
  const [variacaoAtivaId, setVariacaoAtivaId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function carregarDieta() {
      try {
        setCarregando(true);
        setErro(null);

        // Busca os dados da dieta ativa do paciente
        const res = await fetch("/api/paciente/dieta", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Falha ao carregar prescrição (${res.status})`);
        }
        const data = await res.json();

        if (isMounted) {
          if (data.sucesso && data.plano) {
            setPlano(data.plano);
            setPaciente(data.paciente);
            if (data.plano.variacoes?.length > 0) {
              setVariacaoAtivaId(data.plano.variacoes[0].id);
            }
          } else if (data.sucesso && !data.temPlano) {
            setPaciente(data.paciente);
            setPlano(null);
          } else {
            setErro(data.error || "Não foi possível carregar seu plano.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Erro ao carregar dieta do paciente:", err);
          setErro(
            err.message ||
              "Erro de conexão ao sincronizar com a Clínica FAAZ."
          );
        }
      } finally {
        if (isMounted) setCarregando(false);
      }
    }

    carregarDieta();
    return () => {
      isMounted = false;
    };
  }, []);

  const variacaoAtiva =
    plano?.variacoes?.find((v) => v.id === variacaoAtivaId) ||
    plano?.variacoes?.[0] ||
    null;

  function getMealIcon(nome: string) {
    const n = nome.toLowerCase();
    if (n.includes("desjejum") || n.includes("manhã") || n.includes("café")) {
      return <Coffee className="w-4 h-4 text-amber-600" />;
    }
    if (n.includes("almoço")) {
      return <Sun className="w-4 h-4 text-orange-500" />;
    }
    if (n.includes("lanche")) {
      return <Apple className="w-4 h-4 text-emerald-600" />;
    }
    if (n.includes("jantar") || n.includes("noite") || n.includes("ceia")) {
      return <Moon className="w-4 h-4 text-indigo-500" />;
    }
    return <Utensils className="w-4 h-4 text-teal-600" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* CONTAINER RESPONSIVO MOBILE-FIRST (Estilo Aplicativo Nativo) */}
      <div className="w-full max-w-md min-h-screen bg-slate-50 flex flex-col border-x border-slate-200/80 shadow-2xl relative pb-24">
        {/* ======================================================== */}
        {/* 1. HEADER DO APP (PADRÃO CLÍNICA FAAZ) */}
        {/* ======================================================== */}
        <header className="sticky top-0 z-30 bg-slate-900 text-white px-4 py-3 shadow-md flex items-center justify-between">
          <Link
            href="/app"
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors py-1 px-1.5 -ml-1 rounded-lg active:bg-slate-800"
          >
            <ChevronLeft className="w-5 h-5 text-teal-400" />
            <span className="text-xs font-semibold">Voltar</span>
          </Link>

          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold tracking-widest text-teal-400 uppercase">
              Clínica FAAZ
            </span>
            <span className="text-xs font-bold text-white tracking-tight">
              Meu Plano Alimentar
            </span>
          </div>

          <div className="w-12 flex justify-end">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <ShieldCheck className="w-3 h-3 text-teal-400" />
              Médico
            </span>
          </div>
        </header>

        {/* ======================================================== */}
        {/* 2. CONTEÚDO PRINCIPAL (LEITURA LIMPA E CONSUMO) */}
        {/* ======================================================== */}
        <main className="flex-1 px-4 pt-4 pb-6 space-y-4">
          {/* BANNER DO PLANO & MÉDICO RESPONSÁVEL */}
          {paciente && (
            <div className="bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-4 text-white shadow-lg border border-teal-800/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-6 -mt-6 w-28 h-28 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-400/30">
                  <Sparkles className="w-3 h-3 text-teal-300" />
                  Prescrição Médica Ativa
                </span>
                <span className="text-[11px] text-slate-400">
                  {paciente.nome}
                </span>
              </div>

              <h1 className="text-base font-bold text-white leading-snug">
                {plano?.titulo || "Plano Alimentar Individualizado"}
              </h1>

              {plano?.objetivo && (
                <p className="text-xs text-teal-100/90 mt-1.5 leading-relaxed font-normal">
                  {plano.objetivo}
                </p>
              )}

              <div className="mt-3 pt-3 border-t border-teal-800/40 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">
                  Médico:{" "}
                  <strong className="text-slate-200">
                    {paciente.medico}
                  </strong>
                </span>
                <span className="text-teal-400 font-medium">
                  {paciente.especialidade}
                </span>
              </div>
            </div>
          )}

          {/* ESTADO DE CARREGANDO */}
          {carregando && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-teal-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">
                Sincronizando prescrição nutricional...
              </p>
            </div>
          )}

          {/* ESTADO DE ERRO */}
          {!carregando && erro && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
              <h3 className="text-xs font-bold text-rose-900">
                Aviso de Sincronização
              </h3>
              <p className="text-xs text-rose-700">{erro}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-2 text-xs font-bold text-teal-700 bg-white border border-teal-300 px-3 py-1.5 rounded-lg shadow-2xs hover:bg-teal-50"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* ESTADO SEM PLANO ATIVO */}
          {!carregando && !erro && !plano && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto text-teal-700">
                <Utensils className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Plano Alimentar em Preparação
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sua equipe médica está calibrando seus macronutrientes na Clínica
                FAAZ. Assim que a prescrição for concluída, ela aparecerá
                automaticamente aqui.
              </p>
            </div>
          )}

          {/* PLANO ATIVO DISPONÍVEL */}
          {!carregando && !erro && plano && plano.variacoes?.length > 0 && (
            <>
              {/* ======================================================== */}
              {/* 3. TOPO: SELETOR HORIZONTAL DE VARIAÇÕES (PILLS / TABS) */}
              {/* ======================================================== */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Opções de Cardápio ({plano.variacoes.length})
                  </span>
                  <span className="text-[11px] text-teal-700 font-semibold">
                    Selecione para ver o dia
                  </span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-1 px-1">
                  {plano.variacoes.map((variacao, idx) => {
                    const isAtiva = variacao.id === variacaoAtivaId;
                    return (
                      <button
                        key={variacao.id}
                        onClick={() => setVariacaoAtivaId(variacao.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                          isAtiva
                            ? "bg-teal-700 text-white shadow-md shadow-teal-700/20 scale-[1.02]"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 shadow-2xs"
                        }`}
                      >
                        <Calendar
                          className={`w-3.5 h-3.5 ${
                            isAtiva ? "text-teal-200" : "text-slate-400"
                          }`}
                        />
                        <span>{variacao.nome}</span>
                        {isAtiva && (
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-300 ml-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {variacaoAtiva?.descricao && (
                  <p className="text-[11px] text-slate-500 italic px-1 pt-0.5">
                    💡 {variacaoAtiva.descricao}
                  </p>
                )}
              </div>

              {/* CARD RESUMO DE MACROS DO DIA ESCOLHIDO */}
              {variacaoAtiva && (
                <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold text-slate-800">
                        Total do Dia:
                      </span>
                    </div>
                    <span className="text-sm font-extrabold text-teal-700">
                      {variacaoAtiva.totais.calorias} kcal
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
                      <span className="block text-[10px] font-bold text-slate-500 uppercase">
                        Proteínas
                      </span>
                      <span className="text-xs font-black text-emerald-700">
                        {variacaoAtiva.totais.proteinas}g
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
                      <span className="block text-[10px] font-bold text-slate-500 uppercase">
                        Carbos
                      </span>
                      <span className="text-xs font-black text-amber-600">
                        {variacaoAtiva.totais.carboidratos}g
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
                      <span className="block text-[10px] font-bold text-slate-500 uppercase">
                        Gorduras
                      </span>
                      <span className="text-xs font-black text-indigo-600">
                        {variacaoAtiva.totais.gorduras}g
                      </span>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
                      <span className="block text-[10px] font-bold text-slate-500 uppercase">
                        Fibras
                      </span>
                      <span className="text-xs font-black text-teal-700">
                        {variacaoAtiva.totais.fibras}g
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* 4. CORPO: CARDS VERTICAIS PARA CADA REFEIÇÃO */}
              {/* ======================================================== */}
              <div className="space-y-3.5 pt-1">
                {variacaoAtiva?.refeicoes?.map((refeicao) => (
                  <div
                    key={refeicao.id}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all hover:border-teal-200"
                  >
                    {/* TOPO DO CARD DA REFEIÇÃO */}
                    <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-teal-50 border border-teal-100/80">
                          {getMealIcon(refeicao.nome)}
                        </div>
                        <div>
                          <h2 className="text-xs font-bold text-slate-900 leading-tight">
                            {refeicao.nome}
                          </h2>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span className="text-[11px] font-medium text-slate-500">
                              {refeicao.horario}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* BADGE DE CALORIAS DA REFEIÇÃO */}
                      <div className="text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-teal-50 text-teal-800 border border-teal-200">
                          {refeicao.totais.calorias} kcal
                        </span>
                        <span className="block text-[9px] text-slate-400 mt-0.5">
                          P: {refeicao.totais.proteinas}g • C:{" "}
                          {refeicao.totais.carboidratos}g
                        </span>
                      </div>
                    </div>

                    {/* ORIENTAÇÃO / OBSERVAÇÃO MÉDICA DA REFEIÇÃO */}
                    {refeicao.observacoes && (
                      <div className="bg-teal-50/60 border-b border-teal-100/60 px-3.5 py-2 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-teal-900 leading-relaxed font-normal">
                          {refeicao.observacoes}
                        </p>
                      </div>
                    )}

                    {/* LISTA DE ALIMENTOS (READ-ONLY PARA O PACIENTE) */}
                    <div className="p-3.5 space-y-2.5">
                      {refeicao.itens.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-1 text-center">
                          Nenhum alimento cadastrado nesta refeição.
                        </p>
                      ) : (
                        refeicao.itens.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100/80"
                          >
                            <div className="flex-1 pr-3">
                              <span className="text-xs font-bold text-slate-800 block">
                                {item.alimento.nome}
                              </span>

                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="inline-block text-[11px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-100">
                                  {item.quantidadeGramas}g
                                </span>
                                {item.observacao && (
                                  <span className="text-[11px] text-slate-500 truncate max-w-[170px]">
                                    ({item.observacao})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* SELO DE CALORIAS E MACROS DO ITEM */}
                            <div className="text-right shrink-0">
                              <span className="text-xs font-extrabold text-slate-900 block">
                                {item.alimento.caloriasPorcao} kcal
                              </span>
                              <span className="text-[9px] text-slate-400 block font-medium">
                                P: {item.alimento.proteinasPorcao}g • C:{" "}
                                {item.alimento.carboidratosPorcao}g
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* CARD DE NOTA MÉDICA DE CONSUMO */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-2.5 text-amber-900 text-xs">
                <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed text-[11px]">
                  <strong>Dica do seu Médico:</strong> Se tiver dúvidas sobre
                  substituições de alimentos ou sentir desconfortos, envie uma
                  mensagem para a equipe médica no chat da clínica.
                </div>
              </div>
            </>
          )}
        </main>

        {/* ======================================================== */}
        {/* 5. BARRA DE NAVEGAÇÃO INFERIOR FIXA (MOBILE-FIRST) */}
        {/* ======================================================== */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 z-40 flex items-center justify-around shadow-lg">
          <Link
            href="/app"
            className="flex flex-col items-center gap-0.5 py-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <HomeIcon className="w-5 h-5" />
            <span className="text-[10px] font-medium">Home</span>
          </Link>

          <Link
            href="/app/dieta"
            className="flex flex-col items-center gap-0.5 py-1 text-teal-700 font-bold"
          >
            <Utensils className="w-5 h-5 stroke-[2.5]" />
            <span className="text-[10px]">Dieta</span>
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
              alert(`Perfil: ${paciente?.nome || "Paciente"} • Clínica FAAZ`)
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
