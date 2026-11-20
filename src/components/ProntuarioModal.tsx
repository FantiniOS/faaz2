'use client';

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  X,
  FileText,
  Utensils,
  Target,
  Dumbbell,
  ScrollText,
  Scale,
  Ruler,
  Activity,
  AlertTriangle,
  Pill,
  Save,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  ShieldAlert,
  Calendar,
  User,
  History,
  Stethoscope,
  Edit2,
  Trash2,
  TrendingDown,
  TrendingUp,
  HeartPulse,
  ChevronRight,
  Eye,
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Plus,
  Smartphone,
} from "lucide-react";
import { DietaTab } from "@/components/DietaTab";
import { MetasTab } from "@/components/MetasTab";
import { TreinosTab } from "@/components/TreinosTab";
import { MeasurementModal } from "@/components/MeasurementModal";
import { TermometroExecutivoCard } from "@/components/TermometroExecutivoCard";
import type { MeasurementDTO } from "@/actions/measurement-actions";
import {
  criarDataBR,
  formatarDataBR,
  formatarHoraBR,
  formatarParaDatetimeLocalBR,
  TIMEZONE_BR,
} from "@/lib/date-br";

const DocumentosTab = dynamic(
  () => import("@/components/DocumentosTab").then((mod) => mod.DocumentosTab),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
        <span>Carregando emissor de PDF...</span>
      </div>
    ),
  }
);
import { CLINICAL_OBJECTIVES } from "@/lib/clinical-objectives";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import { PacienteCadastral } from "@/app/dashboard/pacientes/page";

interface ProntuarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  paciente: PacienteCadastral | null;
  currentUserCargo?: string | null;
}

export interface HistoricoClinicoItem {
  id: string;
  pacienteId: string;
  dataAtendimento: string;
  pesoAtual: number | null;
  alturaCm: number | null;
  imc: number | null;
  queixaPrincipal?: string | null;
  condutaEvolucao: string;
  medicoResponsavel: string;
}

interface PacienteApiData {
  id: string;
  recordCode?: string;
  nome: string;
  cpf?: string;
  birthDate?: string | null;
  idade?: number | null;
  sexo?: string;
  status?: string;
  convenio?: string;
  telefoneWhatsapp?: string;
  heightCm?: number | null;
  clinicalFocus?: string | null;
  avatarUrl?: string | null;
  photoUrl?: string | null;
  glicemiaRecente?: number | null;
  glicemiaStatus?: string | null;
  circunferenciaAbdominal?: number | null;
  percentualGordura?: number | null;
}

interface BiometriaHistoricoItem {
  id: string;
  measuredAt: string;
  waistCircumferenceCm: number | null;
  bodyFatPercentage: number | null;
}

const PATIENT_APP_CREATED_BY = "PATIENT_APP_SELF_REPORT";

function isMeasurementFromApp(m: MeasurementDTO): boolean {
  return (m.createdBy || "").toUpperCase() === PATIENT_APP_CREATED_BY;
}

function isRegistroAutoMonitoramento(item: HistoricoClinicoItem): boolean {
  const medico = (item.medicoResponsavel || "").toUpperCase();
  const queixa = (item.queixaPrincipal || "").toUpperCase();
  const evolucaoTexto = (item.condutaEvolucao || "").toUpperCase();
  return (
    medico.includes("AUTO-MONITORAMENTO") ||
    queixa.includes("AUTO-MONITORAMENTO") ||
    evolucaoTexto.includes(
      "PESAGEM DE AUTO-MONITORAMENTO REGISTRADA VIA APP MOBILE"
    )
  );
}

type MeasurementNumericKey =
  | "bodyFatPercentage"
  | "waist"
  | "abdomen"
  | "hips"
  | "rightArm"
  | "leftArm"
  | "rightThigh"
  | "leftThigh";

type TapeMeasureKey = Exclude<MeasurementNumericKey, "bodyFatPercentage">;

const TAPE_MEASURE_PRIORITY: Array<{
  key: TapeMeasureKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "waist", label: "Cintura", shortLabel: "Cintura" },
  { key: "abdomen", label: "Abdômen", shortLabel: "Abdômen" },
  { key: "hips", label: "Quadril", shortLabel: "Quadril" },
  { key: "rightArm", label: "Braço Direito", shortLabel: "Braço Dir." },
  { key: "leftArm", label: "Braço Esquerdo", shortLabel: "Braço Esq." },
  { key: "rightThigh", label: "Coxa Direita", shortLabel: "Coxa Dir." },
  { key: "leftThigh", label: "Coxa Esquerda", shortLabel: "Coxa Esq." },
];

const ALL_MEASUREMENT_FIELDS: Array<{
  key: MeasurementNumericKey;
  label: string;
  shortLabel: string;
  unit: "%" | "cm";
}> = [
  {
    key: "bodyFatPercentage",
    label: "% de Gordura",
    shortLabel: "% Gordura",
    unit: "%",
  },
  ...TAPE_MEASURE_PRIORITY.map((f) => ({ ...f, unit: "cm" as const })),
];

function formatBrNumber(val: number, decimals = 1): string {
  return val.toFixed(decimals).replace(".", ",");
}

function getMeasurementChips(m: MeasurementDTO): Array<{
  key: MeasurementNumericKey;
  label: string;
  shortLabel: string;
  formatted: string;
}> {
  const chips: Array<{
    key: MeasurementNumericKey;
    label: string;
    shortLabel: string;
    formatted: string;
  }> = [];

  for (const field of ALL_MEASUREMENT_FIELDS) {
    const raw = m[field.key];
    if (raw !== null && raw !== undefined && !Number.isNaN(Number(raw))) {
      const num = Number(raw);
      chips.push({
        key: field.key,
        label: field.label,
        shortLabel: field.shortLabel,
        formatted:
          field.unit === "%"
            ? `${formatBrNumber(num)}%`
            : `${formatBrNumber(num)} cm`,
      });
    }
  }
  return chips;
}

type TimelineEntry =
  | {
      kind: "evolucao";
      id: string;
      timestamp: number;
      dataIso: string;
      isAutoApp: boolean;
      evolucao: HistoricoClinicoItem;
    }
  | {
      kind: "medicao";
      id: string;
      timestamp: number;
      dataIso: string;
      isAutoApp: boolean;
      medicao: MeasurementDTO;
    };

interface GlicemiaHistoricoItem {
  id: string;
  referenceDate: string;
  recordedValue: number | null;
  notes?: string | null;
}

export interface MetricDataPoint {
  id: string;
  data: string;
  dataFormatada: string;
  timestamp?: number;
  valor: number;
  unidade: string;
  variacao: number | null;
  variacaoTexto: string;
  status: string;
  observacao?: string;
  secundario?: string;
}

interface MiniSparklineProps {
  data: MetricDataPoint[];
  color: string;
  gradientId: string;
  isReductionGood?: boolean;
}

function MiniSparkline({
  data,
  color,
  gradientId,
  emptyLabel = "Sem dados",
}: MiniSparklineProps & { emptyLabel?: string }) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-end">
        <span className="text-[10px] font-medium text-slate-400 bg-slate-50 border border-dashed border-slate-200 px-2 py-1 rounded-md">
          {emptyLabel}
        </span>
      </div>
    );
  }

  if (data.length === 1) {
    const cy = 18;
    return (
      <svg viewBox="0 0 110 36" className="w-full h-full overflow-visible" aria-hidden="true">
        <line
          x1="6"
          y1={cy}
          x2="104"
          y2={cy}
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeOpacity="0.45"
        />
        <circle cx="55" cy={cy} r="5.5" fill={color} fillOpacity="0.18" />
        <circle cx="55" cy={cy} r="3" fill={color} stroke="#fff" strokeWidth="1.5" />
      </svg>
    );
  }

  const width = 110;
  const height = 36;
  const paddingX = 4;
  const paddingY = 6;

  const values = data.map((d) => d.valor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Mapeamento dos pontos normalizados no SVG
  const points = data.map((d, index) => {
    const x =
      data.length === 1
        ? width / 2
        : paddingX + (index / (data.length - 1)) * (width - paddingX * 2);
    const normalizedY = (d.valor - min) / range;
    const y = height - paddingY - normalizedY * (height - paddingY * 2);
    return { x, y };
  });

  // Curva suave cúbica
  let pathD = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    pathD += ` C ${midX.toFixed(1)},${current.y.toFixed(1)} ${midX.toFixed(1)},${next.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`;
  }

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaD = `${pathD} L ${lastPoint.x.toFixed(1)},${height} L ${firstPoint.x.toFixed(1)},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full overflow-visible"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0.03} />
        </linearGradient>
      </defs>

      {/* Área degradê */}
      <path d={areaD} fill={`url(#${gradientId})`} />

      {/* Linha de tendência */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Ponto inicial */}
      <circle
        cx={firstPoint.x}
        cy={firstPoint.y}
        r={2.5}
        fill="#ffffff"
        stroke={color}
        strokeWidth={1.5}
      />

      {/* Ponto mais recente com halo */}
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={4}
        fill={color}
        fillOpacity={0.25}
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

function CustomChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MetricDataPoint }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-md text-slate-900 px-3 py-2 rounded-xl shadow-lg border border-slate-200 text-xs">
        <span className="text-[10px] text-slate-500 block font-medium">
          {data.data} ({data.dataFormatada})
        </span>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-base font-black font-mono text-emerald-700 tabular-nums">
            {data.valor}
          </span>
          <span className="text-xs font-bold text-slate-600">
            {data.unidade}
          </span>
        </div>
        {data.variacaoTexto && (
          <span
            className={`text-[10px] font-bold block mt-0.5 ${
              data.variacao && data.variacao < 0
                ? "text-emerald-600"
                : data.variacao && data.variacao > 0
                ? "text-amber-600"
                : "text-slate-500"
            }`}
          >
            Variação: {data.variacaoTexto}
          </span>
        )}
        {data.secundario && (
          <span className="text-[10px] text-sky-700 block">
            {data.secundario}
          </span>
        )}
        {data.observacao && (
          <span className="text-[10px] text-slate-400 italic block mt-0.5 max-w-[220px]">
            {data.observacao}
          </span>
        )}
      </div>
    );
  }
  return null;
}

export function ProntuarioModal({
  isOpen,
  onClose,
  paciente,
  currentUserCargo,
}: ProntuarioModalProps) {
  // Controle da Aba Selecionada (Prontuário ativa por padrão)
  const [activeTab, setActiveTab] = useState<"prontuario" | "dieta" | "metas" | "treinos" | "documentos">("prontuario");

  // Estados de carregamento e salvamento
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Dados consolidados do paciente vindos da API
  const [pacienteApiData, setPacienteApiData] = useState<PacienteApiData | null>(null);

  // Campos clínicos da Ficha Base / Consulta Atual (Aba 1)
  const [pesoAtual, setPesoAtual] = useState<string>("");
  const [altura, setAltura] = useState<string>("");
  const [objetivo, setObjetivo] = useState<string>("");
  const [comorbidades, setComorbidades] = useState<string>("");
  const [alergias, setAlergias] = useState<string>("");
  const [medicacoes, setMedicacoes] = useState<string>("");
  const [evolucao, setEvolucao] = useState<string>("");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  // Lista do Histórico Clínico (Linha do Tempo de Atendimentos)
  const [historico, setHistorico] = useState<HistoricoClinicoItem[]>([]);
  const [filtroHistorico, setFiltroHistorico] = useState<"oficiais" | "todos">("oficiais");
  const [termometroRefreshKey, setTermometroRefreshKey] = useState(0);
  const [biometriaHistorico, setBiometriaHistorico] = useState<BiometriaHistoricoItem[]>([]);
  const [glicemiaHistorico, setGlicemiaHistorico] = useState<GlicemiaHistoricoItem[]>([]);
  const [measurementsHistorico, setMeasurementsHistorico] = useState<MeasurementDTO[]>([]);
  const [isMeasurementModalOpen, setIsMeasurementModalOpen] = useState(false);
  const [dataHojeBR, setDataHojeBR] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) setDataHojeBR(formatarDataBR(new Date()));
    });
    return () => {
      ativo = false;
    };
  }, [isOpen]);

  // ========================================================
  // ESTADOS PARA EDIÇÃO E EXCLUSÃO DO HISTÓRICO CLÍNICO
  // ========================================================
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<HistoricoClinicoItem | null>(null);
  const [editDataAtendimento, setEditDataAtendimento] = useState<string>("");
  const [editPesoAtual, setEditPesoAtual] = useState<string>("");
  const [editAlturaCm, setEditAlturaCm] = useState<string>("");
  const [editQueixaPrincipal, setEditQueixaPrincipal] = useState<string>("");
  const [editCondutaEvolucao, setEditCondutaEvolucao] = useState<string>("");
  const [editMedicoResponsavel, setEditMedicoResponsavel] = useState<string>("");
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);

  // Estado para exclusão de item do histórico
  const [itemToDelete, setItemToDelete] = useState<HistoricoClinicoItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Estado para o Modal Detalhado de Números Reais (aberto ao clicar em qualquer mini card)
  const [modalMetricaAtiva, setModalMetricaAtiva] = useState<
    "peso" | "imc" | "glicemia" | "circunferencia" | null
  >(null);

  // Fecha o modal de números reais com tecla ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && modalMetricaAtiva && !isMeasurementModalOpen) {
        setModalMetricaAtiva(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalMetricaAtiva, isMeasurementModalOpen]);

  // Permissões RBAC
  const isAuthorized =
    !currentUserCargo ||
    currentUserCargo === "DONO_CLINICA" ||
    currentUserCargo === "MEDICO" ||
    currentUserCargo === "ADMINISTRADOR";

  const canDelete =
    currentUserCargo === "DONO_CLINICA" || currentUserCargo === "ADMINISTRADOR";

  // Carrega os dados reais do prontuário e histórico ao abrir
  useEffect(() => {
    let ativo = true;

    async function fetchProntuario() {
      await Promise.resolve();
      if (!ativo) return;

      if (!isOpen || !paciente) {
        setActiveTab("prontuario");
        setIsAccessDenied(false);
        return;
      }

      if (!isAuthorized) {
        setIsAccessDenied(true);
        return;
      }

      try {
        setIsLoading(true);
        setIsAccessDenied(false);
        setPacienteApiData(null);
        setHistorico([]);
        setFiltroHistorico("oficiais");
        setBiometriaHistorico([]);
        setGlicemiaHistorico([]);
        setPesoAtual("");
        setAltura("");
        setObjetivo("");
        setComorbidades("");
        setAlergias("");
        setMedicacoes("");
        setEvolucao("");
        setUltimaAtualizacao(null);

        const res = await fetch(`/api/pacientes/${paciente.id}/prontuario`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });

        if (!ativo) return;

        if (res.status === 403) {
          setIsAccessDenied(true);
          return;
        }

        if (!res.ok) {
          console.error("Erro ao carregar prontuário.");
          return;
        }

        const json = await res.json();
        if (!ativo) return;
        if (json.success) {
          if (json.paciente) {
            setPacienteApiData(json.paciente);
          }
          if (json.prontuario) {
            const p = json.prontuario;
            setPesoAtual(p.pesoAtualKg ? String(p.pesoAtualKg) : "");
            setAltura(p.alturaCm ? String(p.alturaCm) : "");
            setObjetivo(p.objetivo || "");
            setComorbidades(p.comorbidades || "");
            setAlergias(p.alergias || "");
            setMedicacoes(p.medicacoes || "");
            // Mantém a caixa "Evolução e Conduta do Dia" sempre limpa ao abrir o prontuário
            // (nunca pré-preencher com auto-monitoramento do app ou rascunho anterior).
            setEvolucao("");
            setUltimaAtualizacao(p.ultimaAtualizacao || null);
          }
          if (Array.isArray(json.historico)) {
            setHistorico(json.historico);
          }
          if (Array.isArray(json.biometriaHistorico)) {
            setBiometriaHistorico(json.biometriaHistorico);
          }
          if (Array.isArray(json.glicemiaHistorico)) {
            setGlicemiaHistorico(json.glicemiaHistorico);
          }
          setMeasurementsHistorico(
            Array.isArray(json.measurementsHistorico) ? json.measurementsHistorico : []
          );
        }
      } catch (err) {
        if (ativo) {
          console.error("Erro ao buscar dados clínicos do paciente:", err);
        }
      } finally {
        if (ativo) {
          setIsLoading(false);
        }
      }
    }

    void fetchProntuario();

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, paciente?.id, isAuthorized]);

  // Cálculo de idade a partir de data de nascimento
  function calcularIdade(dataNascStr?: string | null): number | null {
    if (!dataNascStr) return null;
    const hoje = new Date();
    const nasc = new Date(dataNascStr);
    if (isNaN(nasc.getTime())) return null;
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
      idade--;
    }
    return idade >= 0 ? idade : null;
  }

  // Formatação de CPF
  function formatarCpf(val?: string | null) {
    if (!val) return "--";
    const d = val.replace(/\D/g, "");
    if (d.length === 11) {
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    return val;
  }

  // Formata data ISO para input type="datetime-local" (sempre em America/Sao_Paulo)
  function formatToDatetimeLocal(isoStr?: string | null) {
    return formatarParaDatetimeLocalBR(isoStr);
  }

  // Cálculo automático do IMC em tempo real para os campos editáveis
  const imcInfo = useMemo(() => {
    const p = parseFloat(pesoAtual.replace(",", "."));
    const a = parseFloat(altura.replace(",", "."));

    if (!p || !a || p <= 0 || a <= 0) {
      return { valor: null, classificacao: "Aguardando dados", cor: "slate" };
    }

    const alturaMetros = a > 3 ? a / 100 : a;
    const imc = Math.round((p / (alturaMetros * alturaMetros)) * 100) / 100;

    let classificacao = "Eutrofia (Peso Normal)";
    let cor = "emerald";

    if (imc < 18.5) {
      classificacao = "Abaixo do Peso";
      cor = "amber";
    } else if (imc <= 24.9) {
      classificacao = "Eutrofia (Peso Normal)";
      cor = "emerald";
    } else if (imc <= 29.9) {
      classificacao = "Sobrepeso";
      cor = "amber";
    } else if (imc <= 34.9) {
      classificacao = "Obesidade Grau I";
      cor = "orange";
    } else if (imc <= 39.9) {
      classificacao = "Obesidade Grau II";
      cor = "rose";
    } else {
      classificacao = "Obesidade Grau III";
      cor = "rose";
    }

    return { valor: imc, classificacao, cor };
  }, [pesoAtual, altura]);

  // Cálculo dinâmico do IMC no Modal de Edição de Atendimento
  const editImcInfo = useMemo(() => {
    const p = parseFloat(editPesoAtual.replace(",", "."));
    const a = parseFloat(editAlturaCm.replace(",", "."));

    if (!p || !a || p <= 0 || a <= 0) {
      return { valor: null, classificacao: "Aguardando dados", cor: "slate" };
    }

    const alturaMetros = a > 3 ? a / 100 : a;
    const imc = Math.round((p / (alturaMetros * alturaMetros)) * 100) / 100;

    let classificacao = "Eutrofia (Normal)";
    let cor = "emerald";

    if (imc < 18.5) {
      classificacao = "Abaixo do Peso";
      cor = "amber";
    } else if (imc <= 24.9) {
      classificacao = "Eutrofia (Normal)";
      cor = "emerald";
    } else if (imc <= 29.9) {
      classificacao = "Sobrepeso";
      cor = "amber";
    } else if (imc <= 34.9) {
      classificacao = "Obesidade I";
      cor = "orange";
    } else {
      classificacao = "Obesidade II/III";
      cor = "rose";
    }

    return { valor: imc, classificacao, cor };
  }, [editPesoAtual, editAlturaCm]);

  // Função auxiliar para classificar IMC de registros do histórico
  function getHistoricoImcBadge(imc: number | null | undefined) {
    if (!imc) return null;
    let label = "Normal";
    let style = "bg-emerald-50 text-emerald-700 border-emerald-200";

    if (imc < 18.5) {
      label = "Abaixo do Peso";
      style = "bg-amber-50 text-amber-700 border-amber-200";
    } else if (imc <= 24.9) {
      label = "Normal";
      style = "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (imc <= 29.9) {
      label = "Sobrepeso";
      style = "bg-amber-50 text-amber-700 border-amber-200";
    } else if (imc <= 34.9) {
      label = "Obesidade I";
      style = "bg-orange-50 text-orange-700 border-orange-200";
    } else {
      label = "Obesidade II/III";
      style = "bg-rose-50 text-rose-700 border-rose-200";
    }

    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style}`}>
        IMC {imc.toFixed(2)} • {label}
      </span>
    );
  }

  // ========================================================
  // DADOS SINCRONIZADOS PARA O CABEÇALHO PREMIUM
  // ========================================================
  const pacienteNome = pacienteApiData?.nome || paciente?.nome || "Paciente";
  const pacienteRecordCode = pacienteApiData?.recordCode || paciente?.recordCode || "Prontuário Digital";
  const pacienteCpf = pacienteApiData?.cpf || paciente?.cpf;
  const pacienteStatus = pacienteApiData?.status || paciente?.status || "Ativo";
  const pacienteConvenio = pacienteApiData?.convenio || paciente?.convenio || "Particular";
  const pacienteAvatarUrl =
    pacienteApiData?.avatarUrl ||
    pacienteApiData?.photoUrl ||
    paciente?.avatarUrl ||
    null;

  const generoDisplay =
    pacienteApiData?.sexo ||
    (paciente?.sexo === "MALE"
      ? "Masculino"
      : paciente?.sexo === "FEMALE"
      ? "Feminino"
      : "Outro");

  const idadeCalc =
    pacienteApiData?.idade !== undefined && pacienteApiData?.idade !== null
      ? pacienteApiData.idade
      : calcularIdade(pacienteApiData?.birthDate || paciente?.dataNascimento);

  const idadeDisplay = idadeCalc !== null ? `${idadeCalc} anos` : "Sem dados";

  // Indicadores Vitais sincronizados: puxam do registro histórico mais recente (ou da ficha base)
  const pesoHeader =
    historico.length > 0 && historico[0].pesoAtual !== null && !isNaN(Number(historico[0].pesoAtual))
      ? Number(historico[0].pesoAtual)
      : pesoAtual && !isNaN(parseFloat(pesoAtual.replace(",", ".")))
      ? parseFloat(pesoAtual.replace(",", "."))
      : null;

  const alturaHeader =
    altura && !isNaN(parseFloat(altura.replace(",", ".")))
      ? parseFloat(altura.replace(",", "."))
      : pacienteApiData?.heightCm
      ? Number(pacienteApiData.heightCm)
      : historico.length > 0 && historico[0].alturaCm
      ? Number(historico[0].alturaCm)
      : null;

  const imcHeader =
    historico.length > 0 && historico[0].imc !== null && !isNaN(Number(historico[0].imc))
      ? Number(historico[0].imc)
      : imcInfo.valor !== null
      ? imcInfo.valor
      : null;

  const objetivoHeader =
    objetivo || pacienteApiData?.clinicalFocus || null;

  // Badge da faixa do IMC no cabeçalho premium
  const imcFaixaHeaderBadge = useMemo(() => {
    if (imcHeader === null || isNaN(imcHeader)) {
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 text-slate-500 border border-slate-200 rounded">
          Sem dados
        </span>
      );
    }
    if (imcHeader < 18.5) {
      return (
        <span className="text-[10px] font-black px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded">
          Abaixo
        </span>
      );
    }
    if (imcHeader <= 24.9) {
      return (
        <span className="text-[10px] font-black px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
          Normal
        </span>
      );
    }
    if (imcHeader <= 29.9) {
      return (
        <span className="text-[10px] font-black px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded">
          Sobrepeso
        </span>
      );
    }
    if (imcHeader <= 34.9) {
      return (
        <span className="text-[10px] font-black px-1.5 py-0.2 bg-orange-50 text-orange-700 border border-orange-200 rounded">
          Obesidade I
        </span>
      );
    }
    return (
      <span className="text-[10px] font-black px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded">
        Obesidade II/III
      </span>
    );
  }, [imcHeader]);

  // ========================================================
  // 4 MINI CARDS DE INDICADORES CLÍNICOS (SOMENTE DADOS REAIS)
  // ========================================================
  // 1. Peso Atual e Delta comparado à consulta anterior
  const pesoExibicao =
    pesoHeader !== null
      ? `${pesoHeader.toFixed(1)} kg`
      : "Sem dados";

  const deltaPesoInfo = useMemo(() => {
    const comPeso = historico.filter(
      (h) => h.pesoAtual !== null && !isNaN(Number(h.pesoAtual))
    );
    if (comPeso.length >= 2) {
      const atual = Number(comPeso[0].pesoAtual);
      const anterior = Number(comPeso[1].pesoAtual);
      const diff = Math.round((atual - anterior) * 10) / 10;
      return {
        diff,
        label: diff < 0 ? `${diff.toFixed(1)} kg` : diff > 0 ? `+${diff.toFixed(1)} kg` : "0.0 kg",
        tipo: (diff < 0 ? "reducao" : diff > 0 ? "aumento" : "estavel") as "reducao" | "aumento" | "estavel" | "vazio",
        comparacao: "vs. consulta anterior",
      };
    }
    return {
      diff: null as number | null,
      label: "Sem dados",
      tipo: "vazio" as "reducao" | "aumento" | "estavel" | "vazio",
      comparacao: comPeso.length === 1 ? "1 registro no histórico" : "Sem histórico registrado",
    };
  }, [historico]);

  // 2. IMC e Classificação de Faixa
  const imcValor =
    imcHeader !== null && !isNaN(Number(imcHeader))
      ? Number(imcHeader)
      : imcInfo.valor !== null
      ? imcInfo.valor
      : null;

  const imcDisplay = imcValor !== null ? imcValor.toFixed(1) : "Sem dados";

  const imcFaixaTexto =
    imcValor === null
      ? "Sem dados"
      : imcValor < 18.5
      ? "Abaixo do Peso"
      : imcValor <= 24.9
      ? "Eutrofia"
      : imcValor <= 29.9
      ? "Sobrepeso"
      : imcValor <= 34.9
      ? "Obesidade I"
      : "Obesidade II/III";

  const imcFaixaCor =
    imcValor === null
      ? "bg-slate-100 text-slate-500 border-slate-200"
      : imcValor < 18.5
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : imcValor <= 24.9
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : imcValor <= 29.9
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";

  // 3. Glicemia / Metabolismo
  const glicemiaDisplay =
    pacienteApiData?.glicemiaRecente !== undefined && pacienteApiData?.glicemiaRecente !== null
      ? `${pacienteApiData.glicemiaRecente} mg/dL`
      : "Sem dados";

  const glicemiaStatusDisplay =
    pacienteApiData?.glicemiaStatus || "Sem dados";

  // 4. Antropometria & Composição Corporal — consolidação do último valor não-nulo por campo
  const measurementsOrdenadasDesc = useMemo(
    () =>
      [...measurementsHistorico].sort(
        (a, b) =>
          new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
      ),
    [measurementsHistorico]
  );

  const consolidatedMeasurement: MeasurementDTO | null = useMemo(() => {
    if (measurementsOrdenadasDesc.length === 0) return null;
    const newest = measurementsOrdenadasDesc[0];
    const pickLatest = (key: MeasurementNumericKey): number | null => {
      for (const m of measurementsOrdenadasDesc) {
        const v = m[key];
        if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
          return Number(v);
        }
      }
      return null;
    };

    return {
      ...newest,
      bodyFatPercentage: pickLatest("bodyFatPercentage"),
      waist: pickLatest("waist"),
      abdomen: pickLatest("abdomen"),
      hips: pickLatest("hips"),
      rightArm: pickLatest("rightArm"),
      leftArm: pickLatest("leftArm"),
      rightThigh: pickLatest("rightThigh"),
      leftThigh: pickLatest("leftThigh"),
    };
  }, [measurementsOrdenadasDesc]);

  const latestBodyFat: number | null =
    consolidatedMeasurement?.bodyFatPercentage ??
    (pacienteApiData?.percentualGordura !== undefined &&
    pacienteApiData?.percentualGordura !== null
      ? Number(pacienteApiData.percentualGordura)
      : null);

  const latestWaist: number | null =
    consolidatedMeasurement?.waist ??
    (pacienteApiData?.circunferenciaAbdominal !== undefined &&
    pacienteApiData?.circunferenciaAbdominal !== null
      ? Number(pacienteApiData.circunferenciaAbdominal)
      : null);

  const latestAbdomen: number | null = consolidatedMeasurement?.abdomen ?? null;

  // Todas as circunferências consolidadas disponíveis por ordem de prioridade clínica
  const availableTapeMeasures = useMemo(() => {
    const list: Array<{
      key: TapeMeasureKey;
      label: string;
      shortLabel: string;
      value: number;
    }> = [];

    for (const item of TAPE_MEASURE_PRIORITY) {
      const val =
        item.key === "waist"
          ? latestWaist
          : consolidatedMeasurement?.[item.key] ?? null;
      if (val !== null && val !== undefined && !Number.isNaN(Number(val))) {
        list.push({ ...item, value: Number(val) });
      }
    }
    return list;
  }, [consolidatedMeasurement, latestWaist]);

  const promotedTapeMetric = availableTapeMeasures[0] ?? null;

  const hasAnthropometryData =
    measurementsOrdenadasDesc.length > 0 ||
    latestBodyFat !== null ||
    availableTapeMeasures.length > 0;

  // Foco inteligente do Card 4:
  // - Com % Gordura: destaca % Gordura + Cintura e Abdômen abaixo
  // - Sem % Gordura: promove a principal medida de fita métrica (nunca "--%" nem "Sem % gord.")
  const card4Display = useMemo(() => {
    if (latestBodyFat !== null) {
      const subItems: Array<{ label: string; value: string }> = [
        {
          label: "Cintura",
          value: latestWaist !== null ? `${formatBrNumber(latestWaist)} cm` : "--",
        },
        {
          label: "Abdômen",
          value:
            latestAbdomen !== null ? `${formatBrNumber(latestAbdomen)} cm` : "--",
        },
      ];
      return {
        hasValue: true,
        headline: `${formatBrNumber(latestBodyFat)}%`,
        badgeLabel: "% Gordura",
        subItems,
        fallbackSubtext: null as string | null,
        chartUnit: "%" as const,
        chartMetricLabel: "% de Gordura Corporal",
      };
    }

    if (promotedTapeMetric) {
      const secondaryTape = availableTapeMeasures
        .filter((item) => item.key !== promotedTapeMetric.key)
        .slice(0, 2)
        .map((item) => ({
          label: item.shortLabel,
          value: `${formatBrNumber(item.value)} cm`,
        }));

      const fallbackSubtext =
        secondaryTape.length === 0
          ? consolidatedMeasurement?.measuredAt
            ? `Aferido em ${formatarDataBR(consolidatedMeasurement.measuredAt)}`
            : "Fita métrica registrada"
          : null;

      return {
        hasValue: true,
        headline: `${formatBrNumber(promotedTapeMetric.value)} cm`,
        badgeLabel: promotedTapeMetric.shortLabel,
        subItems: secondaryTape,
        fallbackSubtext,
        chartUnit: "cm" as const,
        chartMetricLabel: `${promotedTapeMetric.label} (cm)`,
      };
    }

    return {
      hasValue: false,
      headline: "Sem dados",
      badgeLabel: null as string | null,
      subItems: [] as Array<{ label: string; value: string }>,
      fallbackSubtext: null as string | null,
      chartUnit: "cm" as const,
      chartMetricLabel: "Circunferências (cm)",
    };
  }, [
    latestBodyFat,
    latestWaist,
    latestAbdomen,
    promotedTapeMetric,
    availableTapeMeasures,
    consolidatedMeasurement,
  ]);

  const circunferenciaDisplay = card4Display.headline;

  // Origem do último peso pré-preenchido no bloco ANTROPOMETRIA
  const origemUltimoPeso = useMemo(() => {
    const comPeso = [...historico]
      .filter(
        (h) =>
          h.pesoAtual !== null &&
          h.pesoAtual !== undefined &&
          !Number.isNaN(Number(h.pesoAtual))
      )
      .sort(
        (a, b) =>
          new Date(b.dataAtendimento).getTime() -
          new Date(a.dataAtendimento).getTime()
      );

    const ultimo = comPeso[0];
    if (!ultimo) return null;

    const ddMm = formatarDataBR(ultimo.dataAtendimento).slice(0, 5);
    const viaApp = isRegistroAutoMonitoramento(ultimo);
    return { viaApp, ddMm };
  }, [historico]);

  // ========================================================
  // SÉRIES HISTÓRICAS REAIS PARA OS SPARKLINES E MODAL
  // ========================================================
  // 1. SÉRIE DE PESO (kg) — estritamente a partir dos registros reais do banco
  const pesoSeries: MetricDataPoint[] = useMemo(() => {
    const registrosComPeso = historico.filter(
      (item) => item.pesoAtual !== null && !isNaN(Number(item.pesoAtual))
    );
    if (registrosComPeso.length === 0) return [];

    const ordenado = [...registrosComPeso].sort(
      (a, b) => new Date(a.dataAtendimento).getTime() - new Date(b.dataAtendimento).getTime()
    );

    const pontos: MetricDataPoint[] = [];
    ordenado.forEach((item, index) => {
      const d = new Date(item.dataAtendimento);
      const v = Number(item.pesoAtual);
      const anterior = pontos.length > 0 ? pontos[pontos.length - 1].valor : null;
      const diff = anterior !== null ? Math.round((v - anterior) * 10) / 10 : null;

      pontos.push({
        id: item.id || `peso-${index}`,
        timestamp: d.getTime(),
        data: formatarDataBR(d),
        dataFormatada: `${d.toLocaleDateString("pt-BR", { timeZone: TIMEZONE_BR, day: "numeric", month: "short" })}`,
        valor: v,
        unidade: "kg",
        variacao: diff,
        variacaoTexto:
          diff === null
            ? "Linha de Base"
            : diff < 0
            ? `${diff.toFixed(1)} kg`
            : diff > 0
            ? `+${diff.toFixed(1)} kg`
            : "0.0 kg",
        status:
          diff === null
            ? "Inicial"
            : diff < 0
            ? "Redução"
            : diff > 0
            ? "Ganho"
            : "Estável",
        observacao: item.queixaPrincipal || "Atendimento clínico registrado",
      });
    });

    return pontos;
  }, [historico]);

  // 2. SÉRIE DE IMC — estritamente a partir dos registros reais do banco
  const imcSeries: MetricDataPoint[] = useMemo(() => {
    const ordenado = [...historico]
      .filter((item) => {
        if (item.imc !== null && !isNaN(Number(item.imc))) return true;
        const alt = item.alturaCm || alturaHeader;
        return item.pesoAtual !== null && !isNaN(Number(item.pesoAtual)) && alt !== null && Number(alt) > 0;
      })
      .sort((a, b) => new Date(a.dataAtendimento).getTime() - new Date(b.dataAtendimento).getTime());

    if (ordenado.length === 0) return [];

    const pontos: MetricDataPoint[] = [];
    ordenado.forEach((item, index) => {
      const d = new Date(item.dataAtendimento);
      const aCm = item.alturaCm || alturaHeader;
      let imc = item.imc !== null && !isNaN(Number(item.imc)) ? Number(item.imc) : 0;
      if (!imc && item.pesoAtual && aCm) {
        const aM = Number(aCm) > 3 ? Number(aCm) / 100 : Number(aCm);
        imc = Math.round((Number(item.pesoAtual) / (aM * aM)) * 100) / 100;
      }

      let faixa = "Normal";
      if (imc < 18.5) faixa = "Abaixo do Peso";
      else if (imc <= 24.9) faixa = "Eutrofia (Normal)";
      else if (imc <= 29.9) faixa = "Sobrepeso";
      else if (imc <= 34.9) faixa = "Obesidade I";
      else faixa = "Obesidade II/III";

      const anterior = pontos.length > 0 ? pontos[pontos.length - 1].valor : null;
      const variacao = anterior !== null ? Math.round((imc - anterior) * 100) / 100 : null;
      const variacaoTexto =
        variacao === null
          ? "Linha de Base"
          : variacao < 0
          ? `${variacao.toFixed(2)}`
          : variacao > 0
          ? `+${variacao.toFixed(2)}`
          : "0.00";

      pontos.push({
        id: `imc-${item.id || index}`,
        timestamp: d.getTime(),
        data: formatarDataBR(d),
        dataFormatada: `${d.toLocaleDateString("pt-BR", { timeZone: TIMEZONE_BR, day: "numeric", month: "short" })}`,
        valor: imc,
        unidade: "kg/m²",
        variacao,
        variacaoTexto,
        status: faixa,
        observacao: aCm ? `Altura: ${aCm} cm • ${faixa}` : faixa,
      });
    });

    return pontos;
  }, [historico, alturaHeader]);

  // 3. SÉRIE DE GLICEMIA (mg/dL) — estritamente a partir dos registros reais do banco
  const glicemiaSeries: MetricDataPoint[] = useMemo(() => {
    const validos = glicemiaHistorico.filter(
      (g) => g.recordedValue !== null && !isNaN(Number(g.recordedValue))
    );
    if (validos.length === 0) return [];

    const ordenado = [...validos].sort(
      (a, b) => new Date(a.referenceDate).getTime() - new Date(b.referenceDate).getTime()
    );

    const pontos: MetricDataPoint[] = [];
    ordenado.forEach((item, idx) => {
      const d = new Date(item.referenceDate);
      const valorFinal = Math.round(Number(item.recordedValue));
      const prev = idx > 0 ? pontos[idx - 1].valor : null;
      const diff = prev !== null ? valorFinal - prev : null;

      let status = "Normal";
      if (valorFinal < 70) status = "Hipoglicemia (<70)";
      else if (valorFinal > 180) status = "Hiperglicemia (>180)";
      else if (valorFinal > 125) status = "Glicemia Alterada";
      else if (valorFinal >= 100) status = "Pré-Diabetes";
      else status = "Jejum Normal";

      pontos.push({
        id: item.id || `glicemia-${idx}`,
        timestamp: d.getTime(),
        data: formatarDataBR(d),
        dataFormatada: `${d.toLocaleDateString("pt-BR", { timeZone: TIMEZONE_BR, day: "numeric", month: "short" })}`,
        valor: valorFinal,
        unidade: "mg/dL",
        variacao: diff,
        variacaoTexto:
          diff === null
            ? "Linha de Base"
            : diff < 0
            ? `${diff} mg/dL`
            : diff > 0
            ? `+${diff} mg/dL`
            : "0 mg/dL",
        status,
        observacao: item.notes || "Medição de glicemia registrada",
      });
    });

    return pontos;
  }, [glicemiaHistorico]);

  // 4. SÉRIE HISTÓRICA DE ANTROPOMETRIA (% Gordura quando existir, ou principal circunferência promovida em cm)
  const circunferenciaSeries: MetricDataPoint[] = useMemo(() => {
    // Modo A: paciente tem % de Gordura registrada
    if (latestBodyFat !== null) {
      const newRecords = measurementsHistorico.filter(
        (m) =>
          m.bodyFatPercentage !== null &&
          !Number.isNaN(Number(m.bodyFatPercentage))
      );

      if (newRecords.length > 0) {
        const sorted = [...newRecords].sort(
          (a, b) =>
            new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()
        );

        const pontos: MetricDataPoint[] = [];
        sorted.forEach((item, idx) => {
          const d = new Date(item.measuredAt);
          const valorG = Number(item.bodyFatPercentage);
          const prev = idx > 0 ? pontos[idx - 1].valor : null;
          const diff =
            prev !== null ? Math.round((valorG - prev) * 10) / 10 : null;

          const secParts: string[] = [];
          if (item.waist !== null)
            secParts.push(`Cintura: ${formatBrNumber(item.waist)} cm`);
          if (item.abdomen !== null)
            secParts.push(`Abdômen: ${formatBrNumber(item.abdomen)} cm`);

          const detailParts = getMeasurementChips(item)
            .filter((c) => c.key !== "bodyFatPercentage")
            .map((c) => `${c.shortLabel}: ${c.formatted}`);
          if (item.notes) detailParts.push(item.notes);

          pontos.push({
            id: item.id || `bf-${idx}`,
            timestamp: d.getTime(),
            data: formatarDataBR(d),
            dataFormatada: d.toLocaleDateString("pt-BR", {
              timeZone: TIMEZONE_BR,
              day: "numeric",
              month: "short",
            }),
            valor: valorG,
            unidade: "%",
            variacao: diff,
            variacaoTexto:
              diff === null
                ? "Linha de Base"
                : diff < 0
                  ? `${formatBrNumber(diff)}%`
                  : diff > 0
                    ? `+${formatBrNumber(diff)}%`
                    : "0,0%",
            status: "% Gordura",
            secundario: secParts.length > 0 ? secParts.join(" • ") : undefined,
            observacao:
              detailParts.length > 0
                ? detailParts.join(" | ")
                : "Avaliação antropométrica registrada",
          });
        });

        return pontos;
      }

      const legacyValid = biometriaHistorico.filter(
        (b) =>
          b.bodyFatPercentage !== null &&
          !Number.isNaN(Number(b.bodyFatPercentage))
      );
      if (legacyValid.length === 0) return [];

      const ordenado = [...legacyValid].sort(
        (a, b) =>
          new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()
      );

      const pontos: MetricDataPoint[] = [];
      ordenado.forEach((item, idx) => {
        const d = new Date(item.measuredAt);
        const valorG = Number(item.bodyFatPercentage);
        const valorC =
          item.waistCircumferenceCm !== null
            ? Number(item.waistCircumferenceCm)
            : null;
        const prev = idx > 0 ? pontos[idx - 1].valor : null;
        const diff =
          prev !== null ? Math.round((valorG - prev) * 10) / 10 : null;

        pontos.push({
          id: item.id || `bf-legacy-${idx}`,
          timestamp: d.getTime(),
          data: formatarDataBR(d),
          dataFormatada: `${d.toLocaleDateString("pt-BR", { timeZone: TIMEZONE_BR, day: "numeric", month: "short" })}`,
          valor: valorG,
          unidade: "%",
          variacao: diff,
          variacaoTexto:
            diff === null
              ? "Linha de Base"
              : diff < 0
                ? `${formatBrNumber(diff)}%`
                : diff > 0
                  ? `+${formatBrNumber(diff)}%`
                  : "0,0%",
          status: "% Gordura",
          secundario:
            valorC !== null
              ? `Cintura: ${formatBrNumber(valorC)} cm`
              : undefined,
          observacao:
            valorC !== null
              ? `Cintura: ${formatBrNumber(valorC)} cm`
              : "Bioimpedância registrada",
        });
      });

      return pontos;
    }

    // Modo B: sem % de Gordura — plota a circunferência principal promovida (fita métrica em cm)
    if (!promotedTapeMetric) return [];

    const metricKey = promotedTapeMetric.key;
    const validTapeRecords = measurementsHistorico.filter(
      (m) => m[metricKey] !== null && !Number.isNaN(Number(m[metricKey]))
    );

    if (validTapeRecords.length > 0) {
      const sorted = [...validTapeRecords].sort(
        (a, b) =>
          new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()
      );

      const pontos: MetricDataPoint[] = [];
      sorted.forEach((item, idx) => {
        const d = new Date(item.measuredAt);
        const valorCm = Number(item[metricKey]);
        const prev = idx > 0 ? pontos[idx - 1].valor : null;
        const diff =
          prev !== null ? Math.round((valorCm - prev) * 10) / 10 : null;

        const otherChips = getMeasurementChips(item).filter(
          (c) => c.key !== metricKey
        );
        const detailParts = otherChips.map(
          (c) => `${c.shortLabel}: ${c.formatted}`
        );
        if (item.notes) detailParts.push(item.notes);

        pontos.push({
          id: item.id || `tape-${metricKey}-${idx}`,
          timestamp: d.getTime(),
          data: formatarDataBR(d),
          dataFormatada: d.toLocaleDateString("pt-BR", {
            timeZone: TIMEZONE_BR,
            day: "numeric",
            month: "short",
          }),
          valor: valorCm,
          unidade: "cm",
          variacao: diff,
          variacaoTexto:
            diff === null
              ? "Linha de Base"
              : diff < 0
                ? `${formatBrNumber(diff)} cm`
                : diff > 0
                  ? `+${formatBrNumber(diff)} cm`
                  : "0,0 cm",
          status: promotedTapeMetric.shortLabel,
          secundario:
            otherChips.length > 0
              ? otherChips
                  .slice(0, 2)
                  .map((c) => `${c.shortLabel}: ${c.formatted}`)
                  .join(" • ")
              : undefined,
          observacao:
            detailParts.length > 0
              ? detailParts.join(" | ")
              : "Medida de fita métrica registrada",
        });
      });

      return pontos;
    }

    if (metricKey === "waist") {
      const legacyWaist = biometriaHistorico.filter(
        (b) =>
          b.waistCircumferenceCm !== null &&
          !Number.isNaN(Number(b.waistCircumferenceCm))
      );
      if (legacyWaist.length > 0) {
        const sorted = [...legacyWaist].sort(
          (a, b) =>
            new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()
        );
        const pontos: MetricDataPoint[] = [];
        sorted.forEach((item, idx) => {
          const d = new Date(item.measuredAt);
          const valorCm = Number(item.waistCircumferenceCm);
          const prev = idx > 0 ? pontos[idx - 1].valor : null;
          const diff =
            prev !== null ? Math.round((valorCm - prev) * 10) / 10 : null;
          pontos.push({
            id: item.id || `waist-legacy-${idx}`,
            timestamp: d.getTime(),
            data: formatarDataBR(d),
            dataFormatada: d.toLocaleDateString("pt-BR", {
              timeZone: TIMEZONE_BR,
              day: "numeric",
              month: "short",
            }),
            valor: valorCm,
            unidade: "cm",
            variacao: diff,
            variacaoTexto:
              diff === null
                ? "Linha de Base"
                : diff < 0
                  ? `${formatBrNumber(diff)} cm`
                  : diff > 0
                    ? `+${formatBrNumber(diff)} cm`
                    : "0,0 cm",
            status: "Cintura",
            observacao: "Medida antropométrica legada",
          });
        });
        return pontos;
      }
    }

    return [];
  }, [measurementsHistorico, biometriaHistorico, latestBodyFat, promotedTapeMetric]);

  // Configuração ativa para o Modal Detalhado de Números Reais
  const activeModalConfig = useMemo(() => {
    if (!modalMetricaAtiva) return null;

    switch (modalMetricaAtiva) {
      case "peso": {
        const pInicial = pesoSeries[0]?.valor !== undefined ? `${pesoSeries[0].valor.toFixed(1)} kg` : "Sem dados";
        const pFinal = pesoSeries[pesoSeries.length - 1]?.valor !== undefined ? `${pesoSeries[pesoSeries.length - 1].valor.toFixed(1)} kg` : "Sem dados";
        const diffTotal = pesoSeries.length >= 2 ? (pesoSeries[pesoSeries.length - 1].valor - pesoSeries[0].valor) : null;
        const diffTexto =
          diffTotal === null
            ? "Sem dados"
            : diffTotal < 0
            ? `${diffTotal.toFixed(1)} kg`
            : diffTotal > 0
            ? `+${diffTotal.toFixed(1)} kg`
            : "0.0 kg";

        const tableSeries = [...pesoSeries].sort(
          (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
        );

        return {
          tipo: "peso",
          titulo: "Evolução Histórica do Peso Corporal",
          subtitulo: "Curva ponderal nas últimas consultas e acompanhamento clínico",
          unidade: "kg",
          corStroke: "#0d9488",
          corFill: "#0d9488",
          gradientId: "modalGradPeso",
          icon: Scale,
          series: pesoSeries,
          tableSeries,
          valorAtual: pesoExibicao,
          deltaGeral: diffTexto,
          pontoInicial: pInicial,
          pontoFinal: pFinal,
        };
      }
      case "imc": {
        const pInicial = imcSeries[0]?.valor !== undefined ? `${imcSeries[0].valor.toFixed(2)}` : "Sem dados";
        const pFinal = imcSeries[imcSeries.length - 1]?.valor !== undefined ? `${imcSeries[imcSeries.length - 1].valor.toFixed(2)}` : "Sem dados";
        const diffTotal = imcSeries.length >= 2 ? (imcSeries[imcSeries.length - 1].valor - imcSeries[0].valor) : null;
        const diffTexto =
          diffTotal === null
            ? "Sem dados"
            : diffTotal < 0
            ? `${diffTotal.toFixed(2)}`
            : diffTotal > 0
            ? `+${diffTotal.toFixed(2)}`
            : "0.00";

        const tableSeries = [...imcSeries].sort(
          (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
        );

        return {
          tipo: "imc",
          titulo: "Evolução do Índice de Massa Corporal (IMC)",
          subtitulo: "Trajetória da classificação nutricional e antropometria",
          unidade: "kg/m²",
          corStroke: "#059669",
          corFill: "#059669",
          gradientId: "modalGradImc",
          icon: Activity,
          series: imcSeries,
          tableSeries,
          valorAtual: imcDisplay,
          deltaGeral: diffTexto,
          pontoInicial: pInicial,
          pontoFinal: pFinal,
        };
      }
      case "glicemia": {
        const pInicial = glicemiaSeries[0]?.valor !== undefined ? `${glicemiaSeries[0].valor} mg/dL` : "Sem dados";
        const pFinal = glicemiaSeries[glicemiaSeries.length - 1]?.valor !== undefined ? `${glicemiaSeries[glicemiaSeries.length - 1].valor} mg/dL` : "Sem dados";
        const diffTotal = glicemiaSeries.length >= 2 ? (glicemiaSeries[glicemiaSeries.length - 1].valor - glicemiaSeries[0].valor) : null;
        const diffTexto =
          diffTotal === null
            ? "Sem dados"
            : diffTotal < 0
            ? `${diffTotal} mg/dL`
            : diffTotal > 0
            ? `+${diffTotal} mg/dL`
            : "0 mg/dL";

        const tableSeries = [...glicemiaSeries].sort(
          (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
        );

        return {
          tipo: "glicemia",
          titulo: "Curva Glicêmica & Metabolismo",
          subtitulo: "Histórico de glicemia de jejum e monitoramento metabólico",
          unidade: "mg/dL",
          corStroke: "#e11d48",
          corFill: "#e11d48",
          gradientId: "modalGradGlic",
          icon: HeartPulse,
          series: glicemiaSeries,
          tableSeries,
          valorAtual: glicemiaDisplay,
          deltaGeral: diffTexto,
          pontoInicial: pInicial,
          pontoFinal: pFinal,
        };
      }
      case "circunferencia": {
        const unit = card4Display.chartUnit;
        const formatVal = (v: number) =>
          unit === "%" ? `${formatBrNumber(v)}%` : `${formatBrNumber(v)} cm`;
        const pInicial =
          circunferenciaSeries[0]?.valor !== undefined
            ? formatVal(circunferenciaSeries[0].valor)
            : "Sem dados";
        const pFinal =
          circunferenciaSeries[circunferenciaSeries.length - 1]?.valor !==
          undefined
            ? formatVal(circunferenciaSeries[circunferenciaSeries.length - 1].valor)
            : "Sem dados";
        const diffTotal =
          circunferenciaSeries.length >= 2
            ? Math.round(
                (circunferenciaSeries[circunferenciaSeries.length - 1].valor -
                  circunferenciaSeries[0].valor) *
                  10
              ) / 10
            : null;
        const diffTexto =
          diffTotal === null
            ? "Sem dados"
            : diffTotal < 0
              ? formatVal(diffTotal)
              : diffTotal > 0
                ? `+${formatVal(diffTotal)}`
                : unit === "%"
                  ? "0,0%"
                  : "0,0 cm";

        const tableSeries = [...circunferenciaSeries].sort(
          (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)
        );

        return {
          tipo: "circunferencia",
          titulo: "Composição Corporal & Antropometria",
          subtitulo: `Curva de ${card4Display.chartMetricLabel} e histórico completo de aferições`,
          unidade: unit,
          metricLabel: card4Display.chartMetricLabel,
          corStroke: "#0284c7",
          corFill: "#0284c7",
          gradientId: "modalGradCirc",
          icon: Ruler,
          series: circunferenciaSeries,
          tableSeries,
          valorAtual: circunferenciaDisplay,
          deltaGeral: diffTexto,
          pontoInicial: pInicial,
          pontoFinal: pFinal,
        };
      }
      default:
        return null;
    }
  }, [
    modalMetricaAtiva,
    pesoSeries,
    imcSeries,
    glicemiaSeries,
    circunferenciaSeries,
    pesoExibicao,
    imcDisplay,
    glicemiaDisplay,
    circunferenciaDisplay,
    card4Display,
  ]);

  // Linha do tempo unificada: EVOLUCOES_CLINICAS + MEASUREMENTS (Consultório e App Mobile)
  const timelineUnificada: TimelineEntry[] = useMemo(() => {
    const evolucaoEntries: TimelineEntry[] = historico.map((item) => ({
      kind: "evolucao",
      id: `ev-${item.id}`,
      timestamp: new Date(item.dataAtendimento).getTime(),
      dataIso: item.dataAtendimento,
      isAutoApp: isRegistroAutoMonitoramento(item),
      evolucao: item,
    }));

    const medicaoEntries: TimelineEntry[] = measurementsHistorico.map((m) => ({
      kind: "medicao",
      id: `med-${m.id}`,
      timestamp: new Date(m.measuredAt).getTime(),
      dataIso: m.measuredAt,
      isAutoApp: isMeasurementFromApp(m),
      medicao: m,
    }));

    return [...evolucaoEntries, ...medicaoEntries].sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }, [historico, measurementsHistorico]);

  const totalAutoMonitoramento = useMemo(
    () => timelineUnificada.filter((entry) => entry.isAutoApp).length,
    [timelineUnificada]
  );

  const timelineFiltrada = useMemo(() => {
    if (filtroHistorico === "todos") return timelineUnificada;
    return timelineUnificada.filter((entry) => !entry.isAutoApp);
  }, [timelineUnificada, filtroHistorico]);

  // Salvar Ficha e Registrar Novo Atendimento na Linha do Tempo
  async function handleSalvarERegistrarAtendimento(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!paciente) return;

    try {
      setIsSaving(true);
      const res = await fetch(`/api/pacientes/${paciente.id}/prontuario`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pesoAtualKg: pesoAtual,
          alturaCm: altura,
          objetivo: objetivo ? objetivo.trim().toUpperCase() : objetivo,
          comorbidades: comorbidades ? comorbidades.trim().toUpperCase() : comorbidades,
          alergias: alergias ? alergias.trim().toUpperCase() : alergias,
          medicacoes: medicacoes ? medicacoes.trim().toUpperCase() : medicacoes,
          evolucao: evolucao ? evolucao.trim().toUpperCase() : evolucao,
          registrarAtendimento: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Erro ao salvar prontuário.");
        return;
      }

      setUltimaAtualizacao(new Date().toISOString());
      if (Array.isArray(json.historico)) {
        setHistorico(json.historico);
      }
      setEvolucao("");
      setTermometroRefreshKey((k) => k + 1);

      setSuccessToast("Atendimento registrado e histórico clínico atualizado com sucesso!");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      console.error("Erro ao registrar atendimento:", err);
      alert("Falha de comunicação ao salvar o prontuário.");
    } finally {
      setIsSaving(false);
    }
  }

  // ========================================================
  // AÇÕES DE EDIÇÃO DE ATENDIMENTO HISTÓRICO
  // ========================================================
  function handleOpenEditItem(item: HistoricoClinicoItem) {
    setEditingItem(item);
    setEditDataAtendimento(formatToDatetimeLocal(item.dataAtendimento));
    setEditPesoAtual(item.pesoAtual ? String(item.pesoAtual) : "");
    setEditAlturaCm(
      item.alturaCm
        ? String(item.alturaCm)
        : altura
        ? altura
        : pacienteApiData?.heightCm
        ? String(pacienteApiData.heightCm)
        : ""
    );
    setEditQueixaPrincipal(item.queixaPrincipal || "");
    setEditCondutaEvolucao(item.condutaEvolucao || "");
    setEditMedicoResponsavel(item.medicoResponsavel || "Dr. Carlos Fantini");
    setIsEditModalOpen(true);
  }

  async function handleSalvarEdicaoItem(e: React.FormEvent) {
    e.preventDefault();
    if (!paciente || !editingItem) return;

    try {
      setIsUpdatingItem(true);
      const res = await fetch(`/api/pacientes/${paciente.id}/prontuario/evolucoes/${editingItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataAtendimento: editDataAtendimento
            ? (() => {
                const [dPart, hPart] = editDataAtendimento.split("T");
                return dPart && hPart
                  ? criarDataBR(dPart, hPart).toISOString()
                  : new Date(editDataAtendimento).toISOString();
              })()
            : undefined,
          pesoAtual: editPesoAtual,
          alturaCm: editAlturaCm,
          queixaPrincipal: editQueixaPrincipal ? editQueixaPrincipal.trim().toUpperCase() : editQueixaPrincipal,
          condutaEvolucao: editCondutaEvolucao ? editCondutaEvolucao.trim().toUpperCase() : editCondutaEvolucao,
          medicoResponsavel: editMedicoResponsavel ? editMedicoResponsavel.trim().toUpperCase() : editMedicoResponsavel,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Erro ao atualizar atendimento.");
        return;
      }

      if (Array.isArray(json.historico)) {
        setHistorico(json.historico);
      }

      setIsEditModalOpen(false);
      setEditingItem(null);
      setSuccessToast("Atendimento histórico atualizado com sucesso!");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      console.error("Erro ao atualizar atendimento:", err);
      alert("Erro ao salvar alterações no atendimento histórico.");
    } finally {
      setIsUpdatingItem(false);
    }
  }

  // ========================================================
  // AÇÕES DE EXCLUSÃO DE ATENDIMENTO HISTÓRICO
  // ========================================================
  async function handleConfirmDeleteAtendimento() {
    if (!paciente || !itemToDelete) return;

    try {
      setIsDeletingItem(true);
      const res = await fetch(`/api/pacientes/${paciente.id}/prontuario/evolucoes/${itemToDelete.id}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Erro ao excluir atendimento.");
        return;
      }

      if (Array.isArray(json.historico)) {
        setHistorico(json.historico);
      }

      setItemToDelete(null);
      setSuccessToast("Atendimento histórico excluído com sucesso!");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err) {
      console.error("Erro ao excluir atendimento:", err);
      alert("Erro ao excluir registro histórico.");
    } finally {
      setIsDeletingItem(false);
    }
  }

  if (!isOpen || !paciente) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 md:p-4 lg:p-6 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-200">
      {/* CONTAINER PRINCIPAL FULL-WIDTH (EDGE-TO-EDGE) SEM TRAVAS DE LARGURA */}
      <div className="bg-white w-full flex-1 h-full min-h-[580px] max-h-screen sm:max-h-[96vh] md:max-h-full rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative">
        {/* TOAST DE SUCESSO FLUTUANTE */}
        {successToast && (
          <div className="absolute top-4 right-4 z-70 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-100" />
            <span>{successToast}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* 1. CABEÇALHO CLINICAL LIGHT GLASS (HEADER DE RESUMO)     */}
        {/* ======================================================== */}
        <div className="cl-modal-header shrink-0">
          {/* Brilho radial esmeralda/ciano claro sutil */}
          <div
            className="pointer-events-none absolute -top-20 -left-16 w-72 h-72 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(16,185,129,0.13) 0%, rgba(20,184,166,0.04) 55%, transparent 75%)",
            }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 right-10 w-72 h-72 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(6,182,212,0.10) 0%, rgba(16,185,129,0.03) 55%, transparent 75%)",
            }}
          />

          {/* LINHA SUPERIOR: IDENTIFICAÇÃO DO PACIENTE + STATUS + BOTÃO FECHAR */}
          <div className="relative z-10 px-4 md:px-6 lg:px-8 py-3 sm:py-3.5 flex flex-row items-center justify-between gap-4 sm:gap-6">
            <div className="flex flex-row items-center gap-4 sm:gap-5 min-w-0 flex-1">
              {/* AVATAR DO PACIENTE — CLINICAL LIGHT */}
              {pacienteAvatarUrl ? (
                <img
                  src={pacienteAvatarUrl}
                  alt={pacienteNome}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-emerald-300/80 shadow-sm ring-4 ring-emerald-500/10 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-emerald-200 shadow-sm ring-4 ring-emerald-500/10 bg-gradient-to-br from-emerald-50 via-teal-50/70 to-white flex items-center justify-center text-emerald-600 shrink-0">
                  <User className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-600/85" />
                </div>
              )}

              {/* BLOCO DE TEXTOS E METADADOS */}
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                {/* LINHA 1: NOME DO PACIENTE EM DESTAQUE + TAGS */}
                <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                  <h2 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate">
                    {pacienteNome}
                  </h2>
                  <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 tabular-nums shrink-0">
                    {pacienteRecordCode}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{pacienteStatus}</span>
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200 shrink-0">
                    {pacienteConvenio}
                  </span>
                </div>

                {/* LINHA 2: DADOS SECUNDÁRIOS COMPACTOS (CPF, GÊNERO, IDADE, ATENDIMENTO, OBJETIVO) */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-[13px] text-slate-500 font-medium mt-1.5">
                  <span>
                    CPF: <strong className="font-mono tabular-nums text-slate-800 font-semibold">{formatarCpf(pacienteCpf)}</strong>
                  </span>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <span>
                    Gênero: <strong className="text-slate-800 font-semibold">{generoDisplay}</strong>
                  </span>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <span>
                    Idade: <strong className="text-emerald-700 font-bold">{idadeDisplay}</strong>
                  </span>
                  {ultimaAtualizacao && (
                    <>
                      <span className="text-slate-300 hidden sm:inline">•</span>
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Último atendimento: <strong className="text-slate-800 font-semibold tabular-nums">{formatarDataBR(ultimaAtualizacao)}</strong></span>
                      </span>
                    </>
                  )}
                  {objetivoHeader && (
                    <>
                      <span className="text-slate-300 hidden sm:inline">•</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50/90 border border-emerald-200/80 text-emerald-800 text-xs font-semibold">
                        <Target className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="text-emerald-700/80 font-medium">Objetivo:</span>
                        <span className="font-bold truncate max-w-xs md:max-w-md" title={objetivoHeader}>
                          {objetivoHeader}
                        </span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* BOTÃO FECHAR DISCRETO */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors cursor-pointer shrink-0 self-center"
              title="Fechar prontuário"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ======================================================== */}
        {/* 2. LINHA DOS 4 MINI CARDS COM GRÁFICOS (SPARKLINES)      */}
        {/*    Diretamente abaixo do Cabeçalho Premium e antes       */}
        {/*    da barra de abas (shrink-0, fixo e responsivo)        */}
        {/* ======================================================== */}
        <div className="bg-slate-50/95 px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200/90 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* CARD 1: PESO ATUAL + SPARKLINE */}
            <button
              type="button"
              onClick={() => setModalMetricaAtiva("peso")}
              className="bg-white border border-slate-200/90 hover:border-teal-500 hover:shadow-md rounded-xl p-3 shadow-2xs flex flex-col justify-between transition-all cursor-pointer group text-left relative overflow-hidden"
              title="Clique para ver os números reais e datas exatas"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-teal-700 transition-colors">
                  <Scale className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>Peso Atual</span>
                </span>
                <div className="flex items-center gap-1">
                  {deltaPesoInfo.tipo === "reducao" ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0"
                      title="Redução em relação à consulta anterior"
                    >
                      <TrendingDown className="w-3 h-3 text-emerald-600" />
                      <span>{deltaPesoInfo.label}</span>
                    </span>
                  ) : deltaPesoInfo.tipo === "aumento" ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
                      title="Aumento em relação à consulta anterior"
                    >
                      <TrendingUp className="w-3 h-3 text-amber-600" />
                      <span>{deltaPesoInfo.label}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                      {deltaPesoInfo.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span
                  className={`font-black font-mono tracking-tight ${
                    pesoExibicao === "Sem dados"
                      ? "text-base sm:text-lg text-slate-400 font-sans font-bold"
                      : "text-xl sm:text-2xl text-slate-900"
                  }`}
                >
                  {pesoExibicao}
                </span>
                <div className="w-20 sm:w-24 md:w-28 h-9 shrink-0 flex items-center">
                  <MiniSparkline
                    data={pesoSeries}
                    color="#0d9488"
                    gradientId="sparkPeso"
                    isReductionGood={true}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 mt-1">
                <span className="truncate">{deltaPesoInfo.comparacao}</span>
                <span className="text-[10px] font-semibold text-teal-600 group-hover:text-teal-700 shrink-0 inline-flex items-center gap-0.5">
                  <span>Ver números</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>

            {/* CARD 2: IMC + SPARKLINE */}
            <button
              type="button"
              onClick={() => setModalMetricaAtiva("imc")}
              className="bg-white border border-slate-200/90 hover:border-emerald-500 hover:shadow-md rounded-xl p-3 shadow-2xs flex flex-col justify-between transition-all cursor-pointer group text-left relative overflow-hidden"
              title="Clique para ver os números reais e datas exatas"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-emerald-700 transition-colors">
                  <Activity className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>IMC</span>
                </span>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 ${imcFaixaCor}`}>
                  {imcFaixaTexto}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span
                  className={`font-black font-mono tracking-tight ${
                    imcDisplay === "Sem dados"
                      ? "text-base sm:text-lg text-slate-400 font-sans font-bold"
                      : "text-xl sm:text-2xl text-slate-900"
                  }`}
                >
                  {imcDisplay}
                </span>
                <div className="w-20 sm:w-24 md:w-28 h-9 shrink-0 flex items-center">
                  <MiniSparkline
                    data={imcSeries}
                    color="#059669"
                    gradientId="sparkImc"
                    isReductionGood={true}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 mt-1">
                <span className="truncate">{alturaHeader ? `Alt: ${alturaHeader} cm` : "Altura: Sem dados"}</span>
                <span className="text-[10px] font-semibold text-emerald-600 group-hover:text-emerald-700 shrink-0 inline-flex items-center gap-0.5">
                  <span>Ver números</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>

            {/* CARD 3: GLICEMIA / METABOLISMO + SPARKLINE */}
            <button
              type="button"
              onClick={() => setModalMetricaAtiva("glicemia")}
              className="bg-white border border-slate-200/90 hover:border-rose-500 hover:shadow-md rounded-xl p-3 shadow-2xs flex flex-col justify-between transition-all cursor-pointer group text-left relative overflow-hidden"
              title="Clique para ver os números reais e datas exatas"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-rose-700 transition-colors">
                  <HeartPulse className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>Glicemia / Metabolismo</span>
                </span>
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 ${
                    glicemiaStatusDisplay === "Sem dados"
                      ? "bg-slate-100 text-slate-500 border-slate-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {glicemiaStatusDisplay}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span
                  className={`font-black font-mono tracking-tight ${
                    glicemiaDisplay === "Sem dados"
                      ? "text-base sm:text-lg text-slate-400 font-sans font-bold"
                      : "text-xl sm:text-2xl text-slate-900"
                  }`}
                >
                  {glicemiaDisplay}
                </span>
                <div className="w-20 sm:w-24 md:w-28 h-9 shrink-0 flex items-center">
                  <MiniSparkline
                    data={glicemiaSeries}
                    color="#e11d48"
                    gradientId="sparkGlic"
                    isReductionGood={true}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 mt-1">
                <span className="truncate">
                  {glicemiaSeries.length > 0
                    ? `${glicemiaSeries.length} medição(ões) registrada(s)`
                    : "Sem medições registradas"}
                </span>
                <span className="text-[10px] font-semibold text-rose-600 group-hover:text-rose-700 shrink-0 inline-flex items-center gap-0.5">
                  <span>Ver números</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>

            {/* CARD 4: CIRCUNFERÊNCIA / MEDIDA + SPARKLINE */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setModalMetricaAtiva("circunferencia")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setModalMetricaAtiva("circunferencia");
                }
              }}
              className="bg-white border border-slate-200/90 hover:border-sky-500 hover:shadow-md rounded-xl p-3 shadow-2xs flex flex-col justify-between transition-all cursor-pointer group text-left relative overflow-hidden"
              title="Clique para visualizar o histórico detalhado de medidas corporais"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 group-hover:text-sky-700 transition-colors">
                  <Ruler className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Circunferência / Medida</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMeasurementModalOpen(true);
                  }}
                  title="Adicionar nova avaliação antropométrica"
                  className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md border bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 hover:border-sky-300 transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>Medida</span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span
                      className={`font-black font-mono tracking-tight ${
                        !card4Display.hasValue
                          ? "text-base sm:text-lg text-slate-400 font-sans font-bold"
                          : "text-xl sm:text-2xl text-slate-900"
                      }`}
                    >
                      {card4Display.headline}
                    </span>
                    {card4Display.badgeLabel && (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">
                        {card4Display.badgeLabel}
                      </span>
                    )}
                  </div>
                  {card4Display.subItems.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-600 mt-0.5 truncate">
                      {card4Display.subItems.map((sub, idx) => (
                        <React.Fragment key={sub.label}>
                          {idx > 0 && <span className="text-slate-300">•</span>}
                          <span className="truncate">
                            {sub.label}:{" "}
                            <strong className="font-mono text-slate-800">
                              {sub.value}
                            </strong>
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : card4Display.fallbackSubtext ? (
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {card4Display.fallbackSubtext}
                    </div>
                  ) : null}
                </div>
                <div className="w-20 sm:w-24 md:w-28 h-9 shrink-0 flex items-center">
                  <MiniSparkline
                    data={circunferenciaSeries}
                    color="#0284c7"
                    gradientId="sparkCirc"
                    isReductionGood={true}
                    emptyLabel="Sem dados"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 mt-1">
                <span className="truncate">
                  {hasAnthropometryData
                    ? `${Math.max(measurementsOrdenadasDesc.length, circunferenciaSeries.length, 1)} avaliação(ões)`
                    : "Sem medições registradas"}
                </span>
                <span className="text-[10px] font-semibold text-sky-600 group-hover:text-sky-700 shrink-0 inline-flex items-center gap-0.5">
                  <span>Ver números</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. BARRA DE NAVEGAÇÃO DE ABAS ESTRUTURAIS (FIXA NO TOPO) */}
        <div className="bg-slate-50/90 px-4 md:px-6 lg:px-8 pt-2 border-b border-slate-200/80 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {/* ABA 1: PRONTUÁRIO & HISTÓRICO (ATIVA) */}
            <button
              type="button"
              onClick={() => setActiveTab("prontuario")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 ${
                activeTab === "prontuario"
                  ? "bg-white text-emerald-800 border-emerald-600 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-white/70"
              }`}
            >
              <FileText className={`w-4 h-4 ${activeTab === "prontuario" ? "text-emerald-600" : "text-slate-400"}`} />
              <span>Prontuário & Histórico</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>

            {/* ABA 2: DIETA (DATA-DRIVEN) */}
            <button
              type="button"
              onClick={() => setActiveTab("dieta")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 ${
                activeTab === "dieta"
                  ? "bg-white text-emerald-800 border-emerald-600 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-white/70"
              }`}
            >
              <Utensils className={`w-4 h-4 ${activeTab === "dieta" ? "text-emerald-600" : "text-slate-400"}`} />
              <span>Dieta</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>

            {/* ABA 3: METAS (ATIVADA) */}
            <button
              type="button"
              onClick={() => setActiveTab("metas")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 ${
                activeTab === "metas"
                  ? "bg-white text-emerald-800 border-emerald-600 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-white/70"
              }`}
            >
              <Target className={`w-4 h-4 ${activeTab === "metas" ? "text-emerald-600" : "text-slate-400"}`} />
              <span>Metas</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>

            {/* ABA 4: TREINOS & HABIT TRACKER */}
            <button
              type="button"
              onClick={() => setActiveTab("treinos")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 ${
                activeTab === "treinos"
                  ? "bg-white text-emerald-800 border-emerald-600 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-white/70"
              }`}
            >
              <Dumbbell className={`w-4 h-4 ${activeTab === "treinos" ? "text-emerald-600" : "text-slate-400"}`} />
              <span>Treinos</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>

            {/* ABA 5: DOCUMENTOS & RECEITAS (PDF NATIVO) */}
            <button
              type="button"
              onClick={() => setActiveTab("documentos")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 ${
                activeTab === "documentos"
                  ? "bg-white text-emerald-800 border-emerald-600 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 border-transparent hover:bg-white/70"
              }`}
            >
              <ScrollText className={`w-4 h-4 ${activeTab === "documentos" ? "text-emerald-600" : "text-slate-400"}`} />
              <span>Receitas & Atestados</span>
              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                PDF
              </span>
            </button>
          </div>
        </div>

        {/* 3. CORPO CENTRAL COM ROLAGEM INTERNA CONTROLADA (overflow-y-auto e min-h-0) */}
        {isAccessDenied ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-8 flex flex-col items-center justify-center space-y-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800">
              Acesso Restrito ao Corpo Médico
            </h3>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              Por sigilo médico e normas do Conselho Federal de Medicina (CFM), os prontuários,
              diagnósticos e histórico de atendimentos só podem ser acessados por Médicos credenciados e
              pelo Responsável Técnico da Clínica FAAZ.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 cl-btn-primary px-4 py-2 text-xs"
            >
              Voltar à Lista de Pacientes
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            <span className="text-xs font-semibold text-slate-600">Carregando prontuário e histórico clínico...</span>
          </div>
        ) : activeTab === "prontuario" ? (
          /* CONTEÚDO PRINCIPAL: ESTRUTURA FLUIDA FULL-WIDTH (GRID 12 COLUNAS) */
          <div className="flex-1 min-h-0 flex flex-col w-full">
            {/* ÁREA ROLÁVEL COM TERMÔMETRO EXECUTIVO + ESTRUTURA FLUIDA EM GRID 12 COLUNAS */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 lg:px-8 py-5 sm:py-6 w-full space-y-5">
              {/* TERMÔMETRO EXECUTIVO DE 10 SEGUNDOS (100% ADITIVO) */}
              {paciente?.id ? (
                <TermometroExecutivoCard
                  pacienteId={paciente.id}
                  refreshTrigger={termometroRefreshKey}
                />
              ) : null}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-full w-full">

                {/* ======================================================== */}
                {/* 1. SIDEBAR DO PACIENTE E PARÂMETROS (col-span-3)        */}
                {/* ======================================================== */}
                <div className="col-span-1 lg:col-span-3 flex flex-col gap-4">
                  {/* CARD ANTROPOMÉTRICO */}
                  <div className="bg-slate-50/80 rounded-2xl border border-slate-200/90 p-4 space-y-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                      <Scale className="w-4 h-4 text-teal-600" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Antropometria
                      </h4>
                    </div>

                    {/* Peso Atual */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Peso Atual (kg)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={pesoAtual}
                          onChange={(e) => setPesoAtual(e.target.value)}
                          placeholder="Ex: 84.5"
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 text-xs font-bold pointer-events-none">
                          kg
                        </span>
                      </div>
                      {origemUltimoPeso && (
                        <p
                          className={`mt-1.5 flex items-start gap-1 text-[10px] leading-snug font-medium ${
                            origemUltimoPeso.viaApp
                              ? "text-amber-700"
                              : "text-slate-500"
                          }`}
                        >
                          {origemUltimoPeso.viaApp ? (
                            <Smartphone className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                          ) : (
                            <Stethoscope className="w-3 h-3 text-teal-600 shrink-0 mt-0.5" />
                          )}
                          <span>
                            {origemUltimoPeso.viaApp
                              ? `Último registro via App Mobile (${origemUltimoPeso.ddMm}) — confirme na balança da consulta`
                              : `Última pesagem em consulta oficial (${origemUltimoPeso.ddMm})`}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Altura */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Altura (cm)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={altura}
                          onChange={(e) => setAltura(e.target.value)}
                          placeholder="Ex: 178 ou 1.78"
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 text-xs font-bold pointer-events-none">
                          cm
                        </span>
                      </div>
                    </div>

                    {/* IMC Calculado Automaticamente */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                        <span>IMC Calculado</span>
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200/60 px-1.5 py-0.2 rounded">
                          Tempo Real
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-black text-slate-900 font-mono">
                          {imcInfo.valor !== null ? imcInfo.valor : "--"}
                        </span>
                        {imcInfo.valor !== null && (
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              imcInfo.cor === "emerald"
                                ? "bg-emerald-100 text-emerald-800"
                                : imcInfo.cor === "amber"
                                ? "bg-amber-100 text-amber-800"
                                : imcInfo.cor === "orange"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {imcInfo.classificacao}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CARD CAMPOS CLÍNICOS E METAS */}
                  <div className="bg-slate-50/80 rounded-2xl border border-slate-200/90 p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                      <Target className="w-4 h-4 text-teal-600" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        Foco Clínico & Alertas
                      </h4>
                    </div>

                    {/* Patologias / Comorbidades */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Patologias / Comorbidades</span>
                      </label>
                      <input
                        type="text"
                        value={comorbidades}
                        onChange={(e) => setComorbidades(e.target.value.toUpperCase())}
                        placeholder="Ex: Diabetes Tipo 2, Hipertensão..."
                        className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white uppercase"
                      />
                    </div>

                    {/* Alergias e Intolerâncias */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>Alergias e Intolerâncias</span>
                      </label>
                      <input
                        type="text"
                        value={alergias}
                        onChange={(e) => setAlergias(e.target.value.toUpperCase())}
                        placeholder="Ex: Dipirona, Glúten, Lactose..."
                        className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white uppercase"
                      />
                    </div>

                    {/* Medicações em Uso */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                        <Pill className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span>Medicações em Uso</span>
                      </label>
                      <input
                        type="text"
                        value={medicacoes}
                        onChange={(e) => setMedicacoes(e.target.value.toUpperCase())}
                        placeholder="Ex: Metformina 500mg, Ozempic..."
                        className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white uppercase"
                      />
                    </div>

                    {/* Objetivo Principal */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span>Objetivo do Tratamento (Diretriz Clínica)</span>
                      </label>
                      <select
                        value={objetivo || "Otimização Metabólica & Saúde Integrativa"}
                        onChange={(e) => setObjetivo(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white cursor-pointer"
                      >
                        {CLINICAL_OBJECTIVES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* 2. ÁREA PRINCIPAL: ANOTAÇÕES & HISTÓRICO (col-span-9)   */}
                {/* ======================================================== */}
                <div className="col-span-1 lg:col-span-9 flex flex-col gap-6 min-h-0 flex-1">
                  {/* SEÇÃO SUPERIOR: CONSULTA / ATENDIMENTO ATUAL */}
                  <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col gap-4 shadow-2xs">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-teal-100/80 text-teal-800">
                          <Stethoscope className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                            Atendimento Atual • Consulta Clínica
                          </h3>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Registre a evolução, anamnese e conduta médica do paciente.
                          </p>
                        </div>
                      </div>

                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs flex items-center gap-1.5 shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-teal-600" />
                        <span>Hoje{dataHojeBR ? ` • ${dataHojeBR}` : ""}</span>
                      </span>
                    </div>

                    {/* CAMPO DE EVOLUÇÃO E CONDUTA DO DIA - TEXTAREA DINÂMICO FLEX-GROW / H-FULL */}
                    <div className="flex-1 flex flex-col min-h-[180px]">
                      <div className="flex items-center justify-between mb-1.5 shrink-0">
                        <label className="block text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>Evolução e Conduta do Dia</span>
                        </label>
                        <span className="text-[11px] font-semibold text-slate-400">
                          Registro Médico Oficial
                        </span>
                      </div>
                      <textarea
                        value={evolucao}
                        onChange={(e) => setEvolucao(e.target.value.toUpperCase())}
                        placeholder="Descreva a anamnese do dia, queixas trazidas pelo paciente, evolução dos sintomas (sono, água, intestino), conduta médica instituída, ajustes de doses e orientações para retorno..."
                        className="w-full flex-1 flex-grow min-h-[180px] h-full text-xs font-normal leading-relaxed p-4 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all placeholder:text-slate-400 bg-white resize-y shadow-2xs uppercase"
                      />
                    </div>

                    {/* BARRA DE AÇÃO DA SEÇÃO SUPERIOR COM BOTÃO DE DESTAQUE */}
                    <div className="flex items-center justify-between pt-1 shrink-0">
                      <span className="text-[11px] text-slate-400 font-medium">
                        Ao salvar, um novo registro com data e hora atual será inserido no Histórico Clínico abaixo.
                      </span>

                      <button
                        type="button"
                        onClick={() => handleSalvarERegistrarAtendimento()}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-xs font-extrabold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Gravando Atendimento...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-teal-200" />
                            <span>Salvar e Registrar Atendimento</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* SEÇÃO INFERIOR: HISTÓRICO CLÍNICO / LINHA DO TEMPO */}
                  <div className="space-y-4 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                      <History className="w-4 h-4 text-teal-700" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Histórico Clínico e Linha do Tempo
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Consultas e evoluções anteriores ordenadas da mais recente para a mais antiga (totalmente editáveis).
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Filtro não-destrutivo em pílula */}
                    <div
                      role="tablist"
                      aria-label="Filtrar histórico clínico"
                      className="inline-flex items-center p-0.5 rounded-full bg-slate-100 border border-slate-200/90"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={filtroHistorico === "oficiais"}
                        onClick={() => setFiltroHistorico("oficiais")}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                          filtroHistorico === "oficiais"
                            ? "bg-white text-teal-800 shadow-2xs border border-slate-200/80"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Consultas Oficiais
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={filtroHistorico === "todos"}
                        onClick={() => setFiltroHistorico("todos")}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                          filtroHistorico === "todos"
                            ? "bg-white text-teal-800 shadow-2xs border border-slate-200/80"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Todos os Registros
                        {totalAutoMonitoramento > 0 ? (
                          <span className="ml-1 text-[10px] font-semibold text-slate-400">
                            (+{totalAutoMonitoramento})
                          </span>
                        ) : null}
                      </button>
                    </div>

                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {timelineFiltrada.length}{" "}
                      {timelineFiltrada.length === 1
                        ? "registro"
                        : "registros"}
                    </span>
                  </div>
                </div>

                {/* TIMELINE DE ATENDIMENTOS E AFERIÇÕES ANTROPOMÉTRICAS */}
                {timelineFiltrada.length === 0 ? (
                  <div className="bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-2">
                    <History className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-bold text-slate-700">
                      {filtroHistorico === "oficiais" && totalAutoMonitoramento > 0
                        ? "Nenhuma consulta médica oficial registrada ainda"
                        : "Nenhum atendimento anterior registrado ainda"}
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-sm">
                      {filtroHistorico === "oficiais" && totalAutoMonitoramento > 0
                        ? `Existem ${totalAutoMonitoramento} registro(s) de auto-monitoramento via App Mobile ocultos neste filtro.`
                        : 'Assim que você preencher os dados acima e clicar em "Salvar e Registrar Atendimento", a consulta ficará gravada nesta linha do tempo.'}
                    </p>
                    {filtroHistorico === "oficiais" && totalAutoMonitoramento > 0 ? (
                      <button
                        type="button"
                        onClick={() => setFiltroHistorico("todos")}
                        className="mt-1 px-3 py-1.5 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Exibir todos os registros ({timelineUnificada.length})
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                    {timelineFiltrada.map((entry, idx) => {
                      const isFirst = idx === 0;

                      if (entry.kind === "medicao") {
                        const m = entry.medicao;
                        const dataFormatada = formatarDataBR(m.measuredAt);
                        const horaFormatada = formatarHoraBR(m.measuredAt);
                        const chips = getMeasurementChips(m);

                        return (
                          <div key={entry.id} className="relative group">
                            {/* Marcador na Linha do Tempo */}
                            <div
                              className={`absolute -left-6 top-3.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                isFirst
                                  ? "bg-sky-600 border-white ring-4 ring-sky-100 text-white"
                                  : "bg-white border-sky-300 text-sky-500 group-hover:border-sky-500"
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            </div>

                            {/* Card de Medição Antropométrica */}
                            <div
                              className={`bg-white rounded-xl border p-4 transition-all shadow-2xs space-y-2.5 ${
                                isFirst
                                  ? "border-sky-200 ring-1 ring-sky-500/20"
                                  : "border-slate-200 hover:border-sky-200"
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                    <Ruler className="w-3.5 h-3.5 text-sky-600" />
                                    <span>
                                      {dataFormatada} às {horaFormatada}
                                    </span>
                                  </span>
                                  {isFirst && (
                                    <span className="text-[10px] font-black px-1.5 py-0.2 bg-teal-50 text-teal-700 border border-teal-200 rounded">
                                      Mais recente
                                    </span>
                                  )}
                                  {entry.isAutoApp ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded">
                                      AUTO-MONITORAMENTO (APP)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                      <Stethoscope className="w-3 h-3" />
                                      <span>Antropometria (Consultório)</span>
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 self-start sm:self-auto">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/60">
                                    {entry.isAutoApp ? (
                                      <>
                                        <Smartphone className="w-3.5 h-3.5 text-sky-500" />
                                        <span>Paciente (App Mobile)</span>
                                      </>
                                    ) : (
                                      <>
                                        <User className="w-3.5 h-3.5 text-slate-400" />
                                        <span>
                                          {m.createdByName || "Equipe Clínica FAAZ"}
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setModalMetricaAtiva("circunferencia")}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer"
                                    title="Abrir histórico completo de medidas corporais"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>Ver medidas</span>
                                  </button>
                                </div>
                              </div>

                              {/* Valores aferidos nesta avaliação */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {chips.map((chip) => (
                                  <span
                                    key={chip.key}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 bg-slate-50 text-slate-700 rounded-lg border border-slate-200/90"
                                  >
                                    <span className="text-slate-500">
                                      {chip.shortLabel}:
                                    </span>
                                    <strong className="font-mono font-bold text-slate-900">
                                      {chip.formatted}
                                    </strong>
                                  </span>
                                ))}
                              </div>

                              {/* Observações opcionais da avaliação */}
                              {m.notes && (
                                <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 leading-relaxed">
                                  {m.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const item = entry.evolucao;
                      const dataFormatada = formatarDataBR(item.dataAtendimento);
                      const horaFormatada = formatarHoraBR(item.dataAtendimento);
                      const isAutoApp = entry.isAutoApp;

                      return (
                        <div key={entry.id} className="relative group">
                          {/* Marcador na Linha do Tempo */}
                          <div
                            className={`absolute -left-6 top-3.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              isFirst
                                ? "bg-teal-600 border-white ring-4 ring-teal-100 text-white"
                                : "bg-white border-slate-300 text-slate-400 group-hover:border-teal-500"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          </div>

                          {/* Card do Atendimento */}
                          <div
                            className={`bg-white rounded-xl border p-4.5 transition-all shadow-2xs space-y-3 ${
                              isFirst
                                ? "border-teal-200 ring-1 ring-teal-500/20"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {/* Cabeçalho do Card com Ações de Edição / Exclusão */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                                  <span>{dataFormatada} às {horaFormatada}</span>
                                </span>
                                {isFirst && (
                                  <span className="text-[10px] font-black px-1.5 py-0.2 bg-teal-50 text-teal-700 border border-teal-200 rounded">
                                    Mais recente
                                  </span>
                                )}
                                {isAutoApp && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded">
                                    AUTO-MONITORAMENTO (APP)
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 self-start sm:self-auto">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/60">
                                  <User className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{item.medicoResponsavel || "Dr. Carlos Fantini"}</span>
                                </div>

                                {/* BOTÕES DE AÇÃO: EDITAR E EXCLUIR */}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditItem(item)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-50 hover:bg-teal-50 hover:text-teal-800 border border-slate-200 hover:border-teal-300 rounded-lg transition-colors cursor-pointer"
                                    title="Editar atendimento passado"
                                  >
                                    <Edit2 className="w-3 h-3 text-teal-600" />
                                    <span>Editar</span>
                                  </button>

                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => setItemToDelete(item)}
                                      className="inline-flex items-center gap-1 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
                                      title="Excluir atendimento (Apenas Dono/Admin)"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Métricas Registradas na Ocasião (Peso e IMC) */}
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {item.pesoAtual && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-lg border border-slate-200">
                                  <Scale className="w-3 h-3 text-slate-500" />
                                  <span>Peso: {item.pesoAtual.toFixed(1)} kg</span>
                                </span>
                              )}

                              {item.imc && getHistoricoImcBadge(item.imc)}

                              {item.queixaPrincipal && (
                                <span className="text-[11px] text-slate-500 italic">
                                  • Foco: {item.queixaPrincipal}
                                </span>
                              )}
                            </div>

                            {/* Conteúdo da Evolução / Conduta */}
                            <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 text-xs text-slate-800 leading-relaxed font-normal whitespace-pre-line">
                              {item.condutaEvolucao}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Fechamento da coluna lg:col-span-9 e do grid 12 colunas */}
              </div>
            </div>
          </div>

          {/* 4. RODAPÉ FIXO DO MODAL COM INFORMAÇÃO E AÇÕES RÁPIDAS */}
          <div className="bg-slate-50 border-t border-slate-200 px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between shrink-0">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Prontuário Médico Digital • Clínica FAAZ • Sigilo CFM</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>

              <button
                type="button"
                onClick={() => handleSalvarERegistrarAtendimento()}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-5 py-1.5 text-xs font-extrabold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar e Registrar Atendimento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === "dieta" ? (
          /* CONTEÚDO ATIVO DA ABA DIETA (DATA-DRIVEN) */
          <DietaTab
            pacienteId={paciente?.id || ""}
            pacienteNome={paciente?.nome || "Paciente"}
          />
        ) : activeTab === "metas" ? (
          /* CONTEÚDO ATIVO DA ABA METAS */
          <MetasTab
            pacienteId={paciente?.id || ""}
            pacienteNome={paciente?.nome || "Paciente"}
            pacientePesoAtualKg={pesoAtual}
            pacienteAlturaCm={altura}
          />
        ) : activeTab === "treinos" ? (
          /* CONTEÚDO DA ABA TREINOS & HABIT TRACKER */
          <TreinosTab
            pacienteId={paciente?.id || ""}
            pacienteNome={paciente?.nome || "Paciente"}
          />
        ) : (
          /* CONTEÚDO DA ABA RECEITAS, EXAMES & ATESTADOS (PDF NATIVO) */
          <DocumentosTab
            pacienteId={paciente?.id || ""}
            pacienteNome={pacienteNome}
            pacienteCpf={pacienteCpf}
            pacienteRecordCode={pacienteRecordCode}
          />
        )}

        {/* ======================================================== */}
        {/* MODAL LIMPO E ESTÁTICO DE EDIÇÃO DE ATENDIMENTO HISTÓRICO */}
        {/* ======================================================== */}
        {isEditModalOpen && editingItem && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Cabeçalho do Modal de Edição — Clinical Light Glass */}
              <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                      Editar Atendimento Histórico
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Modifique os parâmetros clínicos e a conduta registrada nesta consulta.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Formulário de Edição */}
              <form onSubmit={handleSalvarEdicaoItem} className="p-5 space-y-4 text-xs">
                {/* Linha 1: Data e Médico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Data e Hora da Consulta
                    </label>
                    <input
                      type="datetime-local"
                      value={editDataAtendimento}
                      onChange={(e) => setEditDataAtendimento(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Médico Responsável
                    </label>
                    <input
                      type="text"
                      value={editMedicoResponsavel}
                      onChange={(e) => setEditMedicoResponsavel(e.target.value.toUpperCase())}
                      placeholder="DR. CARLOS FANTINI"
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white uppercase"
                    />
                  </div>
                </div>

                {/* Linha 2: Antropometria do Atendimento */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Peso Registrado (kg)
                    </label>
                    <input
                      type="text"
                      value={editPesoAtual}
                      onChange={(e) => setEditPesoAtual(e.target.value)}
                      placeholder="84.5"
                      className="w-full text-xs font-semibold px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Altura (cm)
                    </label>
                    <input
                      type="text"
                      value={editAlturaCm}
                      onChange={(e) => setEditAlturaCm(e.target.value)}
                      placeholder="178"
                      className="w-full text-xs font-semibold px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white"
                    />
                  </div>

                  <div className="flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-500">IMC Recalculado</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-base font-black text-slate-900 font-mono">
                        {editImcInfo.valor !== null ? editImcInfo.valor : "--"}
                      </span>
                      {editImcInfo.valor !== null && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-100 text-teal-800">
                          {editImcInfo.classificacao}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Linha 3: Queixa Principal */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Queixa Principal / Foco Clínico
                  </label>
                  <input
                    type="text"
                    value={editQueixaPrincipal}
                    onChange={(e) => setEditQueixaPrincipal(e.target.value.toUpperCase())}
                    placeholder="EX: RETORNO DE AVALIAÇÃO DE EXAMES..."
                    className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white uppercase"
                  />
                </div>

                {/* Linha 4: Conduta e Evolução */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Conduta e Evolução Clínica
                  </label>
                  <textarea
                    rows={6}
                    value={editCondutaEvolucao}
                    onChange={(e) => setEditCondutaEvolucao(e.target.value.toUpperCase())}
                    className="w-full text-xs font-normal leading-relaxed p-3 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all bg-white resize-none uppercase"
                    required
                  />
                </div>

                {/* Ações do Modal de Edição */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isUpdatingItem}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-extrabold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUpdatingItem ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Salvar Alterações</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE ATENDIMENTO          */}
        {/* ======================================================== */}
        {itemToDelete && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Excluir Registro de Atendimento?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Esta ação removerá este atendimento da linha do tempo histórica do paciente.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 space-y-1">
                <div>
                  <strong>Data:</strong>{" "}
                  {formatarDataBR(itemToDelete.dataAtendimento)}{" "}
                  às {formatarHoraBR(itemToDelete.dataAtendimento)}
                </div>
                <div>
                  <strong>Médico:</strong> {itemToDelete.medicoResponsavel || "Dr. Carlos Fantini"}
                </div>
                {itemToDelete.pesoAtual && (
                  <div>
                    <strong>Peso:</strong> {itemToDelete.pesoAtual.toFixed(1)} kg
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setItemToDelete(null)}
                  disabled={isDeletingItem}
                  className="px-3.5 py-1.5 rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAtendimento}
                  disabled={isDeletingItem}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isDeletingItem && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Sim, Excluir Atendimento</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL DETALHADO INTERATIVO: NÚMEROS REAIS & SPARKLINE    */}
        {/* ======================================================== */}
        {activeModalConfig && (
          <div className="fixed inset-0 z-70 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
            <div
              className={`bg-white w-full ${
                activeModalConfig.tipo === "circunferencia"
                  ? "max-w-3xl"
                  : "max-w-2xl"
              } rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150`}
            >
              {/* CABEÇALHO CLINICAL LIGHT GLASS */}
              <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                    <activeModalConfig.icon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                      {activeModalConfig.titulo}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">
                      {pacienteNome} • <span className="font-mono text-emerald-700 font-bold">{pacienteRecordCode}</span> • {idadeDisplay}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalMetricaAtiva(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                  title="Fechar detalhes (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* CORPO DO MODAL COM ROLAGEM INTERNA */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                {/* 1. GRÁFICO RECHARTS INTERATIVO EXPANDIDO */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 sm:p-4 shadow-2xs">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>
                        Curva de Tendência Histórica
                        {"metricLabel" in activeModalConfig && activeModalConfig.metricLabel
                          ? ` · ${activeModalConfig.metricLabel}`
                          : ""}{" "}
                        ({activeModalConfig.series.length} ponto
                        {activeModalConfig.series.length === 1 ? "" : "s"})
                      </span>
                    </span>
                    {activeModalConfig.series.length >= 2 && (
                      <span className="text-[10px] font-medium text-slate-400 shrink-0">
                        Passe o mouse sobre os pontos para ver detalhes
                      </span>
                    )}
                  </div>
                  {activeModalConfig.series.length >= 2 ? (
                    <div className="w-full h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activeModalConfig.series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id={activeModalConfig.gradientId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={activeModalConfig.corStroke} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={activeModalConfig.corStroke} stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis
                            dataKey="dataFormatada"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={{ stroke: "#cbd5e1" }}
                          />
                          <YAxis
                            domain={["auto", "auto"]}
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={false}
                            unit={` ${activeModalConfig.unidade}`}
                          />
                          <RechartsTooltip content={<CustomChartTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="valor"
                            stroke={activeModalConfig.corStroke}
                            strokeWidth={2.5}
                            fill={`url(#${activeModalConfig.gradientId})`}
                            dot={{ r: 4, fill: activeModalConfig.corStroke, strokeWidth: 2, stroke: "#fff" }}
                            activeDot={{ r: 6, fill: activeModalConfig.corStroke, stroke: "#fff", strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="w-full h-32 rounded-xl border border-dashed border-slate-200 bg-white flex flex-col items-center justify-center text-center p-4">
                      <span className="text-xs font-bold text-slate-500">Sem dados suficientes para curva de tendência</span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        São necessários pelo menos 2 registros reais no banco de dados para traçar a evolução histórica.
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. CARDS DE RESUMO ESTATÍSTICO */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Ponto Inicial
                    </span>
                    <span className="text-sm sm:text-base font-black text-slate-800 font-mono">
                      {activeModalConfig.pontoInicial}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Ponto Atual
                    </span>
                    <span className="text-sm sm:text-base font-black text-slate-800 font-mono">
                      {activeModalConfig.pontoFinal}
                    </span>
                  </div>
                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                      Evolução Total (Δ)
                    </span>
                    <span className="text-sm sm:text-base font-black text-emerald-800 font-mono">
                      {activeModalConfig.deltaGeral}
                    </span>
                  </div>
                </div>

                {/* 3. TABELA COMPLETA DE NÚMEROS REAIS, DATAS EXATAS E VARIAÇÕES */}
                {activeModalConfig.tipo === "circunferencia" ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="bg-slate-100/90 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Ruler className="w-3.5 h-3.5 text-sky-600" />
                        <span>
                          Histórico Completo de Medidas ({measurementsOrdenadasDesc.length > 0 ? measurementsOrdenadasDesc.length : biometriaHistorico.length})
                        </span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        Origem e todos os campos aferidos
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2">Origem</th>
                            <th className="px-3 py-2">Medidas Aferidas</th>
                            <th className="px-3 py-2">Observações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {measurementsOrdenadasDesc.length === 0 && biometriaHistorico.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-7 text-center">
                                <p className="text-xs font-semibold text-slate-500">
                                  Nenhuma medida corporal registrada ainda para este paciente.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalMetricaAtiva(null);
                                    setIsMeasurementModalOpen(true);
                                  }}
                                  className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Registrar primeira medida</span>
                                </button>
                              </td>
                            </tr>
                          ) : measurementsOrdenadasDesc.length > 0 ? (
                            measurementsOrdenadasDesc.map((m, idx) => {
                              const fromApp = isMeasurementFromApp(m);
                              const chips = getMeasurementChips(m);
                              return (
                                <tr key={m.id || idx} className="hover:bg-slate-50/80 transition-colors align-top">
                                  <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span>{formatarDataBR(m.measuredAt)}</span>
                                      {idx === 0 && (
                                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200">
                                          Mais recente
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 pl-4.5 block">
                                      {formatarHoraBR(m.measuredAt)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    {fromApp ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                                        <Smartphone className="w-2.5 h-2.5" />
                                        <span>App Mobile</span>
                                      </span>
                                    ) : (
                                      <div className="flex flex-col items-start gap-0.5">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          <Stethoscope className="w-2.5 h-2.5" />
                                          <span>Consultório</span>
                                        </span>
                                        {m.createdByName && (
                                          <span className="text-[10px] text-slate-400 pl-0.5">
                                            {m.createdByName}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex flex-wrap gap-1">
                                      {chips.length > 0 ? (
                                        chips.map((chip) => (
                                          <span
                                            key={chip.key}
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80"
                                          >
                                            <span className="text-slate-500">{chip.shortLabel}:</span>
                                            <strong className="font-mono text-slate-900">
                                              {chip.formatted}
                                            </strong>
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-[11px] text-slate-400">--</span>
                                      )}
                                    </div>
                                  </td>
                                  <td
                                    className="px-3 py-2.5 text-[11px] text-slate-500 max-w-[180px] truncate"
                                    title={m.notes || undefined}
                                  >
                                    {m.notes || "--"}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            biometriaHistorico.map((b, idx) => (
                              <tr key={b.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3 h-3 text-slate-400" />
                                    <span>{formatarDataBR(b.measuredAt)}</span>
                                    {idx === 0 && (
                                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200">
                                        Mais recente
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Stethoscope className="w-2.5 h-2.5" />
                                    <span>Consultório</span>
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex flex-wrap gap-1">
                                    {b.bodyFatPercentage !== null && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80">
                                        <span className="text-slate-500">% Gordura:</span>
                                        <strong className="font-mono text-slate-900">
                                          {formatBrNumber(b.bodyFatPercentage)}%
                                        </strong>
                                      </span>
                                    )}
                                    {b.waistCircumferenceCm !== null && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80">
                                        <span className="text-slate-500">Cintura:</span>
                                        <strong className="font-mono text-slate-900">
                                          {formatBrNumber(b.waistCircumferenceCm)} cm
                                        </strong>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-[11px] text-slate-400">
                                  Registro biométrico legado
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <div className="bg-slate-100/90 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span>Tabela de Medições Detalhadas</span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        Datas exatas e variações
                      </span>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2 text-right">Valor Real</th>
                            <th className="px-3 py-2 text-center">Variação (Δ)</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Observações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(!activeModalConfig.tableSeries || activeModalConfig.tableSeries.length === 0) ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-xs font-semibold text-slate-400">
                                Sem dados registrados no banco de dados para este indicador.
                              </td>
                            </tr>
                          ) : (
                            activeModalConfig.tableSeries.map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-3 py-2.5 font-medium text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>{item.data}</span>
                                  {idx === 0 && (
                                    <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200">
                                      Mais recente
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-black font-mono text-slate-900 whitespace-nowrap">
                                  {item.valor} <span className="text-[10px] font-semibold text-slate-500">{item.unidade}</span>
                                </td>
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  {item.variacao === null ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      Base
                                    </span>
                                  ) : item.variacao < 0 ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <TrendingDown className="w-2.5 h-2.5 text-emerald-600" />
                                      <span>{item.variacaoTexto}</span>
                                    </span>
                                  ) : item.variacao > 0 ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                      <TrendingUp className="w-2.5 h-2.5 text-amber-600" />
                                      <span>{item.variacaoTexto}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      0.0
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                    {item.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-[11px] text-slate-500 truncate max-w-[200px]" title={item.observacao}>
                                  {item.observacao || "--"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* RODAPÉ DO MODAL */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] text-slate-400">
                  Dica: Pressione <strong className="text-slate-600 font-mono">ESC</strong> para fechar
                </span>
                <div className="flex items-center gap-2">
                  {activeModalConfig.tipo === "circunferencia" && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalMetricaAtiva(null);
                        setIsMeasurementModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nova Medida</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalMetricaAtiva(null)}
                    className="cl-btn-secondary px-4 py-1.5 text-xs"
                  >
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {paciente && (
          <MeasurementModal
            open={isOpen && isMeasurementModalOpen}
            onOpenChange={setIsMeasurementModalOpen}
            patientId={paciente.id}
            patientName={pacienteNome}
            latestMeasurement={consolidatedMeasurement}
            totalRecords={measurementsOrdenadasDesc.length}
            onOpenHistory={
              measurementsOrdenadasDesc.length > 0
                ? () => setModalMetricaAtiva("circunferencia")
                : undefined
            }
            onSaved={(created) => {
              const next = [
                created,
                ...measurementsHistorico.filter((m) => m.id !== created.id),
              ].sort(
                (a, b) =>
                  new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
              );
              setMeasurementsHistorico(next);
              setTermometroRefreshKey((k) => k + 1);
              setPacienteApiData((prevApi) => {
                if (!prevApi) return prevApi;
                const firstBodyFat =
                  next.find((m) => m.bodyFatPercentage !== null)?.bodyFatPercentage ??
                  prevApi.percentualGordura;
                const firstWaist = next.find((m) => m.waist !== null)?.waist;
                const firstAbdomen = next.find((m) => m.abdomen !== null)?.abdomen;
                return {
                  ...prevApi,
                  percentualGordura: firstBodyFat,
                  circunferenciaAbdominal:
                    firstWaist ?? firstAbdomen ?? prevApi.circunferenciaAbdominal,
                };
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
