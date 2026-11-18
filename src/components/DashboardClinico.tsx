'use client';

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import {
  SlidersHorizontal,
  Sparkles,
  CalendarDays,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { TopMenu } from "@/components/TopMenu";
import {
  SortableWidgetCard,
  WidgetCard,
  BristolLiveSummary,
  HidratacaoConsolidada,
  CheckinDbItem,
} from "@/components/DashboardCards";
import { AuditoriaDiariaModal } from "@/components/AuditoriaDiariaModal";
import {
  AlertasGlicemicosModal,
  GlicemiaLiveSummary,
  AlertaGlicemicoItem,
} from "@/components/AlertasGlicemicosModal";
import { ProntuarioModal } from "@/components/ProntuarioModal";
import { PacienteCadastral } from "@/app/dashboard/pacientes/page";
import { HeroCardImpactoGlobal } from "@/components/HeroCardImpactoGlobal";
import type { MetricaPesoEliminadoData } from "@/lib/metrica-peso-eliminado";
import {
  mockUserSession,
  mockDashboardConfig,
  DashboardWidgetConfig,
} from "@/mocks/dashboard";

interface DashboardClinicoProps {
  user?: {
    nome?: string;
    cargo?: string;
    role?: string;
  } | null;
}

export function DashboardClinico({ user }: DashboardClinicoProps) {
  const [widgets, setWidgets] =
    useState<DashboardWidgetConfig[]>(mockDashboardConfig);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Estados vivos sincronizados sem re-render desnecessário
  const [intestinoData, setIntestinoData] = useState<BristolLiveSummary | null>(null);
  const [hidratacaoData, setHidratacaoData] = useState<HidratacaoConsolidada | null>(null);
  const [glicemiaData, setGlicemiaData] = useState<GlicemiaLiveSummary | null>(null);
  const [metricaPesoData, setMetricaPesoData] = useState<MetricaPesoEliminadoData | null>(null);
  const [isLoadingMetricaPeso, setIsLoadingMetricaPeso] = useState<boolean>(true);

  const lastIntestinoSigRef = useRef<string>("");
  const lastHidratacaoSigRef = useRef<string>("");
  const lastGlicemiaSigRef = useRef<string>("");
  const lastMetricaPesoSigRef = useRef<string>("");

  // Modal / Gaveta de Auditoria Diária (Botão "Detalhes >")
  const [auditoriaModalOpen, setAuditoriaModalOpen] = useState(false);
  const [auditoriaModulo, setAuditoriaModulo] = useState<"bristol" | "hidrico">("bristol");

  // Modal de Detalhamento de Alertas Glicêmicos (Card 1) + Prontuário Direto
  const [alertasGlicemicosModalOpen, setAlertasGlicemicosModalOpen] = useState(false);
  const [pacienteProntuarioSelecionado, setPacienteProntuarioSelecionado] =
    useState<PacienteCadastral | null>(null);

  function handleOpenDetails(widgetId: string) {
    if (widgetId === "alertas-glicemicos") {
      setAlertasGlicemicosModalOpen(true);
    } else if (widgetId === "escala-bristol") {
      setAuditoriaModulo("bristol");
      setAuditoriaModalOpen(true);
    } else if (widgetId === "aderencia-hidrica") {
      setAuditoriaModulo("hidrico");
      setAuditoriaModalOpen(true);
    }
  }

  function handleOpenProntuarioFromAlerta(item: AlertaGlicemicoItem) {
    setAlertasGlicemicosModalOpen(false);
    setPacienteProntuarioSelecionado({
      id: item.pacienteId,
      recordCode: item.pacienteRecordCode || undefined,
      nome: item.pacienteNome,
      cpf: item.pacienteCpf || "",
      telefoneWhatsapp: item.pacienteTelefone || "",
      dataNascimento: item.pacienteDataNascimento || undefined,
      sexo: item.pacienteSexo || undefined,
      convenio: item.pacienteConvenio || "Particular",
      status: item.pacienteStatus || "Ativo",
    });
  }

  // Polling unificado e blindado contra cache no Dashboard Clínico
  const fetchLiveData = useCallback(async () => {
    try {
      const [resIntestino, resHidratacao, resGlicemia, resPeso] = await Promise.allSettled([
        fetch("/api/checkins/intestino?limit=20", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        }),
        fetch("/api/checkins/hidratacao", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        }),
        fetch("/api/checkins/glicemia", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        }),
        fetch("/api/dashboard/peso-eliminado", {
          headers: {
            "Cache-Control": "max-age=60",
          },
        }),
      ]);

      if (resIntestino.status === "fulfilled" && resIntestino.value.ok) {
        const json = await resIntestino.value.json();
        if (json.success) {
          const registros = (json.registrosHoje || json.data || []) as CheckinDbItem[];
          const summary: BristolLiveSummary = {
            countHoje: json.countHoje ?? registros.length,
            countIdealHoje:
              json.countIdealHoje ??
              registros.filter((r) => r.categoria === "ideal").length,
            countConstipacaoHoje:
              json.countConstipacaoHoje ??
              registros.filter((r) => r.categoria === "constipacao").length,
            countDiarreiaHoje:
              json.countDiarreiaHoje ??
              registros.filter((r) => r.categoria === "diarreia").length,
            ultimoRegistroHoje:
              json.ultimoRegistroHoje ??
              (registros.length > 0 ? registros[0] : null),
            registrosHoje: registros,
          };
          const sig = JSON.stringify({
            c: summary.countHoje,
            i: summary.countIdealHoje,
            co: summary.countConstipacaoHoje,
            d: summary.countDiarreiaHoje,
            u: summary.ultimoRegistroHoje?.id || null,
          });
          if (sig !== lastIntestinoSigRef.current) {
            lastIntestinoSigRef.current = sig;
            setIntestinoData(summary);
          }
        }
      }

      if (resHidratacao.status === "fulfilled" && resHidratacao.value.ok) {
        const json = await resHidratacao.value.json();
        if (json.success && typeof json.totalConsumidoHojeL === "number") {
          const nextHidratacao: HidratacaoConsolidada = {
            totalConsumidoHojeL: json.totalConsumidoHojeL,
            metaTotalHojeL: json.metaTotalHojeL ?? 0,
            percentualAderencia: json.percentualAderencia ?? 0,
            pacientesAtivosProtocolo: json.pacientesAtivosProtocolo ?? 0,
            pacientesQueRegistraramHoje: json.pacientesQueRegistraramHoje ?? 0,
            totalRegistrosHoje: json.totalRegistrosHoje ?? 0,
            engajamentoApp: json.engajamentoApp ?? {
              percentual: 0,
              pacientesEngajados7d: 0,
              totalPacientesAtivos: json.pacientesAtivosProtocolo ?? 0,
            },
            riscoEvasao: json.riscoEvasao ?? {
              pacientesEmRisco: 0,
              totalPacientesAtivos: json.pacientesAtivosProtocolo ?? 0,
            },
          };
          const sig = JSON.stringify(nextHidratacao);
          if (sig !== lastHidratacaoSigRef.current) {
            lastHidratacaoSigRef.current = sig;
            setHidratacaoData(nextHidratacao);
          }
        }
      }

      if (resGlicemia.status === "fulfilled" && resGlicemia.value.ok) {
        const json = await resGlicemia.value.json();
        if (json.success) {
          const nextGlicemia: GlicemiaLiveSummary = {
            totalAlertasHoje: json.totalAlertasHoje ?? 0,
            pacientesCriticosHoje: json.pacientesCriticosHoje ?? 0,
            totalRegistrosHoje: json.totalRegistrosHoje ?? 0,
            alertasHoje: json.alertasHoje || [],
            registrosHoje: json.registrosHoje || [],
          };
          const sig = JSON.stringify({
            ta: nextGlicemia.totalAlertasHoje,
            pc: nextGlicemia.pacientesCriticosHoje,
            tr: nextGlicemia.totalRegistrosHoje,
            ids: nextGlicemia.alertasHoje.map((a) => a.id),
          });
          if (sig !== lastGlicemiaSigRef.current) {
            lastGlicemiaSigRef.current = sig;
            setGlicemiaData(nextGlicemia);
          }
        }
      }

      if (resPeso.status === "fulfilled" && resPeso.value.ok) {
        const jsonPeso = await resPeso.value.json();
        if (jsonPeso.success && jsonPeso.data) {
          const sig = JSON.stringify(jsonPeso.data);
          if (sig !== lastMetricaPesoSigRef.current) {
            lastMetricaPesoSigRef.current = sig;
            setMetricaPesoData(jsonPeso.data);
          }
        }
      }
    } catch (err) {
      console.error("[DashboardClinico] Erro no polling unificado:", err);
    } finally {
      setIsLoadingMetricaPeso(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    try {
      const ghostIds = new Set(["qualidade-sono", "sintomas-frequentes"]);
      const saved = localStorage.getItem("faaz_dashboard_layout_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter(
            (w: DashboardWidgetConfig) => w && !ghostIds.has(w.id)
          );
          if (filtered.length > 0) {
            setWidgets(filtered);
          }
        }
      }
    } catch (e) {
      console.error("Erro ao carregar layout salvo:", e);
    }
  }, []);

  // Inicia o polling contínuo a cada 5 segundos assim que a página estiver visível
  useEffect(() => {
    if (typeof window === "undefined") return;

    fetchLiveData();
    const interval = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        fetchLiveData();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchLiveData]);

  // Sensores com suporte a Touch Nativo e Pointer/Mouse
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const updated = arrayMove(items, oldIndex, newIndex);
        try {
          localStorage.setItem("faaz_dashboard_layout_v2", JSON.stringify(updated));
        } catch (e) {
          console.error("Erro ao salvar layout:", e);
        }
        return updated;
      });

      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 2500);
    }
  }

  function handleResetLayout() {
    setWidgets(mockDashboardConfig);
    try {
      localStorage.removeItem("faaz_dashboard_layout_v2");
      localStorage.removeItem("faaz_dashboard_layout");
    } catch (e) {
      console.error("Erro ao resetar layout:", e);
    }
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  }

  const nomeExibicao = user?.nome || mockUserSession.nome;
  const cargoAtivo = user?.cargo || user?.role || mockUserSession.cargo;

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col font-sans">
      {/* MENU SUPERIOR DINÂMICO */}
      <TopMenu activePath="/dashboard" />

      {/* ÁREA DE TRABALHO CLÍNICA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* CABEÇALHO DO DASHBOARD CLÍNICO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
              <span>Hoje • Painel Clínico Geral</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-bold">
                Endocrinologia & Nutrologia
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Olá, {nomeExibicao}
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              Acompanhamento de aderência metabólica, biomarcadores e saúde intestinal dos pacientes.
            </p>
          </div>

          {/* BOTÃO PERSONALIZAR PAINEL */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            {isCustomizing && (
              <button
                type="button"
                onClick={handleResetLayout}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs"
                title="Restaurar posições originais"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCustomizing(!isCustomizing)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-2xs ${
                isCustomizing
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/30"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>{isCustomizing ? "Concluir Edição" : "Personalizar Painel"}</span>
            </button>
          </div>
        </div>

        {/* BANNER INFORMATIVO SE MODO DE EDIÇÃO ESTIVER ATIVO */}
        {isCustomizing && (
          <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between text-xs text-emerald-900 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Modo de Edição Ativo:</strong> Clique e segure no ícone de grade dos cards para reposicionar seu painel de acordo com sua rotina de atendimento.
              </span>
            </div>
          </div>
        )}

        {/* TOAST DE FEEDBACK DE ORDENAÇÃO SALVA */}
        {showSavedToast && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Layout do painel atualizado com sucesso!</span>
          </div>
        )}

        {/* HERO CARD DE DESTAQUE: IMPACTO GLOBAL DA CLÍNICA (TOTAL DE PESO ELIMINADO) */}
        <HeroCardImpactoGlobal
          data={metricaPesoData}
          isLoading={isLoadingMetricaPeso}
          onRefresh={fetchLiveData}
        />

        {/* ÁREA DE CONTEÚDO COM DND-KIT (GRID 3x2 HARMÔNICO SEM CARDS FANTASMAS) */}
        {!isMounted ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {widgets.map((widget) => (
              <WidgetCard
                key={widget.id}
                widget={widget}
                intestinoData={intestinoData}
                hidratacaoData={hidratacaoData}
                glicemiaData={glicemiaData}
                metricaPesoData={metricaPesoData}
                onOpenDetails={handleOpenDetails}
              />
            ))}
          </div>
        ) : (
          <DndContext
            id="faaz-dashboard-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={widgets.map((w) => w.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {widgets.map((widget) => (
                  <SortableWidgetCard
                    key={widget.id}
                    widget={widget}
                    intestinoData={intestinoData}
                    hidratacaoData={hidratacaoData}
                    glicemiaData={glicemiaData}
                    metricaPesoData={metricaPesoData}
                    onOpenDetails={handleOpenDetails}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* MODAL / GAVETA DE AUDITORIA DIÁRIA DOS CHECK-INS ("Detalhes >") */}
        <AuditoriaDiariaModal
          isOpen={auditoriaModalOpen}
          onClose={() => setAuditoriaModalOpen(false)}
          initialModulo={auditoriaModulo}
        />

        {/* MODAL ESTÁTICO DE DETALHAMENTO DE ALERTAS GLICÊMICOS (CARD 1) */}
        <AlertasGlicemicosModal
          isOpen={alertasGlicemicosModalOpen}
          onClose={() => setAlertasGlicemicosModalOpen(false)}
          liveData={glicemiaData}
          onOpenProntuario={handleOpenProntuarioFromAlerta}
        />

        {/* PRONTUÁRIO CLÍNICO DO PACIENTE */}
        <ProntuarioModal
          isOpen={Boolean(pacienteProntuarioSelecionado)}
          onClose={() => {
            setPacienteProntuarioSelecionado(null);
            fetchLiveData();
          }}
          paciente={pacienteProntuarioSelecionado}
          currentUserCargo={cargoAtivo}
        />
      </main>
    </div>
  );
}
export default DashboardClinico;
