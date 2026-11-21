"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Edit2,
  Search,
  User,
  FileText,
  X,
  Loader2,
  ChevronDown,
  AlertCircle,
  Sparkles,
  Smartphone,
  RotateCcw,
  CalendarPlus,
} from "lucide-react";
import { TopMenu } from "@/components/TopMenu";
import { mockUserSession } from "@/mocks/dashboard";
import {
  AgendaMonthView,
  AgendaSemesterView,
  buildMonthGrid,
  getSemesterInfo,
  MESES_PT_FULL,
  stepMonthsIso,
  type AgendaViewMode,
} from "@/components/AgendaExtendedViews";
import {
  adicionarDiasDataBR,
  criarDataBR,
  formatarHoraBR,
  getDataDiaBR,
  getHojeBR,
  getPartesDataHoraBR,
  subtrairDiasDataBR,
  TIMEZONE_BR,
} from "@/lib/date-br";

export type TipoAgendamento = "PRIMEIRA_CONSULTA" | "RETORNO" | "EXAME";
export type EspecialidadeAgendamento = "ENDOCRINOLOGIA" | "CIRURGIA_PLASTICA";
export type StatusAgendamento =
  | "AGENDADO"
  | "CONFIRMADO"
  | "CANCELADO"
  | "FINALIZADO";

export interface MedicoOption {
  id: string;
  nome: string;
  especialidade?: string | null;
  corHex: string;
}

export interface AgendamentoItem {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteRecordCode?: string;
  pacienteCpf?: string;
  pacienteTelefone?: string;
  pacienteConvenio?: string;
  pacientePlanoFaaz?: boolean;
  paciente?: {
    id?: string;
    planoFaaz?: boolean;
  };
  medicoId?: string;
  medicoNome?: string;
  medicoEspecialidade?: string | null;
  medicoCorHex?: string;
  especialidade?: EspecialidadeAgendamento;
  especialidadeLegivel?: string;
  dataHora: string;
  data: string; // YYYY-MM-DD
  horario: string; // HH:mm
  duracaoMinutos: number;
  encaixe?: boolean;
  tipo: TipoAgendamento;
  tipoLegivel: string;
  status: StatusAgendamento;
  statusLegivel: string;
  observacao?: string;
}

interface PacienteOption {
  id: string;
  nome: string;
  cpf: string;
  recordCode?: string;
  convenio?: string;
  planoFaaz?: boolean;
  telefoneWhatsapp?: string;
}

interface PositionedAgendamento {
  item: AgendamentoItem;
  topPercent: number;
  heightPercent: number;
  leftPercent: number;
  widthPercent: number;
  colIndex: number;
  totalCols: number;
  horarioFim: string;
}

// Janela padrão do calendário: das 08:00 às 19:00 (expande dinamicamente se houver consulta fora)
const DEFAULT_GRID_START_HOUR = 8;
const DEFAULT_GRID_END_HOUR = 19;

const DURACAO_OPCOES = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora (60 min)" },
  { value: 90, label: "1h 30m (90 min)" },
];

function getLocalIsoDate(d?: Date): string {
  return d ? getDataDiaBR(d) : getHojeBR();
}

function parseLocalIsoDate(isoDate: string): Date {
  return criarDataBR(isoDate, "12:00");
}

function getAgendamentoHorarioBR(item: AgendamentoItem): string {
  if (item.dataHora) {
    const dt = new Date(item.dataHora);
    if (!Number.isNaN(dt.getTime())) {
      return formatarHoraBR(dt);
    }
  }
  return item.horario || "09:00";
}

function getAgendamentoDataBR(item: AgendamentoItem): string {
  if (item.dataHora) {
    const dt = new Date(item.dataHora);
    if (!Number.isNaN(dt.getTime())) {
      return getDataDiaBR(dt);
    }
  }
  return item.data;
}

function isConfirmadoViaApp(item: AgendamentoItem): boolean {
  if (item.status !== "CONFIRMADO") return false;
  return (item.observacao || "")
    .toLowerCase()
    .includes("confirmado pelo paciente via app");
}

function isCanceladoViaApp(item: AgendamentoItem): boolean {
  if (item.status !== "CANCELADO") return false;
  return (item.observacao || "")
    .toLowerCase()
    .includes("cancelado pelo paciente via app");
}

function parseTimeToMinutes(horario: string): number {
  if (!horario || !horario.includes(":")) return 9 * 60;
  const [hh, mm] = horario.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function formatMinutesToTime(totalMin: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const clamped = Math.max(0, Math.min(24 * 60, totalMin));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${pad(hh)}:${pad(mm)}`;
}

/**
 * Gera a query string da API puramente a partir de strings primitivas em America/Sao_Paulo
 */
function buildAgendamentosQuery(
  selectedDateIso: string,
  mode: AgendaViewMode,
  medicoIdFiltro: string,
  especialidadeFiltro: "TODAS" | EspecialidadeAgendamento
): string {
  const medicoSuffix =
    medicoIdFiltro && medicoIdFiltro !== "TODOS"
      ? `&medicoId=${encodeURIComponent(medicoIdFiltro)}`
      : "";
  const especialidadeSuffix =
    especialidadeFiltro && especialidadeFiltro !== "TODAS"
      ? `&especialidade=${encodeURIComponent(especialidadeFiltro)}`
      : "";

  if (mode === "dia") {
    return `data=${selectedDateIso}${medicoSuffix}${especialidadeSuffix}`;
  }
  if (mode === "mes") {
    const [y, m] = selectedDateIso.split("-").map(Number);
    const { gridStartIso, gridEndIso } = buildMonthGrid(y || 2026, m || 1, "");
    return `dataInicio=${gridStartIso}&dataFim=${gridEndIso}${medicoSuffix}${especialidadeSuffix}`;
  }
  if (mode === "semestre") {
    const { startIso, endIso } = getSemesterInfo(selectedDateIso);
    return `dataInicio=${startIso}&dataFim=${endIso}${medicoSuffix}${especialidadeSuffix}`;
  }
  const dayOfWeek = getPartesDataHoraBR(selectedDateIso).weekdayIndex;
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayIso = subtrairDiasDataBR(selectedDateIso, diffToMonday);
  const sundayIso = adicionarDiasDataBR(mondayIso, 6);
  return `dataInicio=${mondayIso}&dataFim=${sundayIso}${medicoSuffix}${especialidadeSuffix}`;
}

/**
 * Motor de Cálculo de Colisões (Overlap Algorithm - Side-by-Side) com régua horária dinâmica
 */
function computeDayLayout(
  items: AgendamentoItem[],
  gridStartHour: number,
  totalGridMinutes: number
): PositionedAgendamento[] {
  if (!items || items.length === 0) return [];

  const startDayMin = gridStartHour * 60;

  const parsed = items
    .map((item) => {
      const horarioBr = getAgendamentoHorarioBR(item);
      const startMin = parseTimeToMinutes(horarioBr);
      const duracao = Math.max(Number(item.duracaoMinutos) || 30, 15);
      const endMin = startMin + duracao;
      return { item: { ...item, horario: horarioBr }, startMin, endMin, duracao };
    })
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
        Number(a.item.status === "CANCELADO") -
          Number(b.item.status === "CANCELADO") ||
        Number(Boolean(a.item.encaixe)) - Number(Boolean(b.item.encaixe)) ||
        b.duracao - a.duracao
    );

  // Agrupa eventos que se sobrepõem em clusters conectados (Overlap Clusters)
  type ParsedEntry = (typeof parsed)[number];
  const clusters: ParsedEntry[][] = [];
  let currentCluster: ParsedEntry[] = [];
  let clusterMaxEnd = -1;

  for (const entry of parsed) {
    if (currentCluster.length === 0 || entry.startMin < clusterMaxEnd) {
      currentCluster.push(entry);
      clusterMaxEnd = Math.max(clusterMaxEnd, entry.endMin);
    } else {
      clusters.push(currentCluster);
      currentCluster = [entry];
      clusterMaxEnd = entry.endMin;
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const results: PositionedAgendamento[] = [];

  for (const cluster of clusters) {
    const columnsEndTimes: number[] = [];
    const assigned = cluster.map((entry) => {
      let placedCol = -1;
      for (let c = 0; c < columnsEndTimes.length; c++) {
        if (columnsEndTimes[c] <= entry.startMin) {
          placedCol = c;
          columnsEndTimes[c] = entry.endMin;
          break;
        }
      }
      if (placedCol === -1) {
        placedCol = columnsEndTimes.length;
        columnsEndTimes.push(entry.endMin);
      }
      return { ...entry, colIndex: placedCol };
    });

    const totalCols = Math.max(columnsEndTimes.length, 1);
    const widthPercent = 100 / totalCols;

    for (const entry of assigned) {
      const leftPercent = entry.colIndex * widthPercent;

      const rawTop =
        ((entry.startMin - startDayMin) / totalGridMinutes) * 100;
      const topPercent = Math.max(0, Math.min(97, rawTop));

      const rawHeight = (entry.duracao / totalGridMinutes) * 100;
      const heightPercent = Math.max(
        3.2,
        Math.min(100 - topPercent, rawHeight)
      );

      results.push({
        item: entry.item,
        topPercent,
        heightPercent,
        leftPercent,
        widthPercent,
        colIndex: entry.colIndex,
        totalCols,
        horarioFim: formatMinutesToTime(entry.endMin),
      });
    }
  }

  return results;
}

export default function AgendaPage() {
  // Datas inicializadas vazias no SSR e hidratadas em useEffect (evita hydration mismatch #418)
  const [hojeIso, setHojeIso] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<AgendaViewMode>("dia");
  const [reloadTrigger, setReloadTrigger] = useState<number>(0);

  const [agendamentos, setAgendamentos] = useState<AgendamentoItem[]>([]);
  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [medicos, setMedicos] = useState<MedicoOption[]>([]);
  const [filtroMedicoId, setFiltroMedicoId] = useState<string>("TODOS");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState<
    "TODAS" | EspecialidadeAgendamento
  >("TODAS");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Card ocupado selecionado (Popover / Modal de Gestão Rápida)
  const [selectedCard, setSelectedCard] = useState<AgendamentoItem | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // Controle de horários cancelados (ocultos na grade por padrão para liberar o slot)
  const [mostrarCanceladosNaGrade, setMostrarCanceladosNaGrade] =
    useState<boolean>(false);
  const [canceladosPopoverOpen, setCanceladosPopoverOpen] =
    useState<boolean>(false);

  // Controle do Modal de Agendamento Rápido (Novo / Editar)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAgendamento, setEditingAgendamento] =
    useState<AgendamentoItem | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Campos do Modal de Agendamento Flexível
  const [especialidadeForm, setEspecialidadeForm] =
    useState<EspecialidadeAgendamento>("ENDOCRINOLOGIA");
  const [medicoIdForm, setMedicoIdForm] = useState<string>("");
  const [pacienteIdForm, setPacienteIdForm] = useState<string>("");
  const [pacienteBusca, setPacienteBusca] = useState<string>("");
  const [comboboxOpen, setComboboxOpen] = useState<boolean>(false);
  const [isQuickCreateMode, setIsQuickCreateMode] = useState<boolean>(false);
  const [novoPacienteTelefone, setNovoPacienteTelefone] = useState<string>("");
  const [dataForm, setDataForm] = useState<string>(selectedDate);
  const [horarioForm, setHorarioForm] = useState<string>("09:00");
  const [duracaoForm, setDuracaoForm] = useState<number>(30);
  const [encaixeForm, setEncaixeForm] = useState<boolean>(false);
  const [tipoForm, setTipoForm] = useState<TipoAgendamento>("RETORNO");
  const [observacaoForm, setObservacaoForm] = useState<string>("");

  // Perfil RBAC do Usuário Logado
  const [currentUserCargo, setCurrentUserCargo] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  function formatWhatsAppInput(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length === 0) return "";
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  const comboboxRef = useRef<HTMLDivElement>(null);
  const canceladosPopoverRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  }

  // Fecha o combobox de pacientes / popover de cancelados ao clicar fora e trava rolagem global no html/body
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    function handleClickOutside(e: MouseEvent) {
      if (
        comboboxRef.current &&
        !comboboxRef.current.contains(e.target as Node)
      ) {
        setComboboxOpen(false);
      }
      if (
        canceladosPopoverRef.current &&
        !canceladosPopoverRef.current.contains(e.target as Node)
      ) {
        setCanceladosPopoverOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCanceladosPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Hidrata data corrente em America/Sao_Paulo apenas no cliente após montagem
  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (!ativo) return;
      const hoje = getLocalIsoDate(new Date());
      setHojeIso(hoje);
      setSelectedDate((prev) => prev || hoje);
      setDataForm((prev) => prev || hoje);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Colunas visíveis na grade (1 coluna no modo "dia", 7 colunas no modo "semana")
  const visibleColumns = useMemo(() => {
    if (!selectedDate || (viewMode !== "dia" && viewMode !== "semana")) {
      return [];
    }
    const baseDate = parseLocalIsoDate(selectedDate);

    if (viewMode === "dia") {
      const dStr = getLocalIsoDate(baseDate);
      const diaSemanaCurto = baseDate
        .toLocaleDateString("pt-BR", {
          timeZone: TIMEZONE_BR,
          weekday: "short",
        })
        .replace(".", "")
        .toUpperCase();
      const diaSemanaLongo = baseDate.toLocaleDateString("pt-BR", {
        timeZone: TIMEZONE_BR,
        weekday: "long",
      });
      return [
        {
          isoDate: dStr,
          dayNumber: dStr.slice(8, 10),
          weekdayShort: diaSemanaCurto,
          weekdayLong:
            diaSemanaLongo.charAt(0).toUpperCase() + diaSemanaLongo.slice(1),
          monthShort: baseDate
            .toLocaleDateString("pt-BR", {
              timeZone: TIMEZONE_BR,
              month: "short",
            })
            .replace(".", ""),
          isToday: dStr === hojeIso,
          isSelected: true,
        },
      ];
    }

    // Modo Semana: Segunda a Domingo da semana selecionada (100% America/Sao_Paulo)
    const dayOfWeek = getPartesDataHoraBR(selectedDate).weekdayIndex;
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayIso = subtrairDiasDataBR(selectedDate, diffToMonday);

    const cols = [];
    for (let i = 0; i < 7; i++) {
      const dStr = adicionarDiasDataBR(mondayIso, i);
      const d = parseLocalIsoDate(dStr);
      const diaSemanaCurto = d
        .toLocaleDateString("pt-BR", {
          timeZone: TIMEZONE_BR,
          weekday: "short",
        })
        .replace(".", "")
        .toUpperCase();
      const diaSemanaLongo = d.toLocaleDateString("pt-BR", {
        timeZone: TIMEZONE_BR,
        weekday: "long",
      });
      cols.push({
        isoDate: dStr,
        dayNumber: dStr.slice(8, 10),
        weekdayShort: diaSemanaCurto,
        weekdayLong:
          diaSemanaLongo.charAt(0).toUpperCase() + diaSemanaLongo.slice(1),
        monthShort: d
          .toLocaleDateString("pt-BR", {
            timeZone: TIMEZONE_BR,
            month: "short",
          })
          .replace(".", ""),
        isToday: dStr === hojeIso,
        isSelected: dStr === selectedDate,
      });
    }
    return cols;
  }, [selectedDate, viewMode, hojeIso]);

  // Título formatado do período no cabeçalho
  const headerPeriodTitle = useMemo(() => {
    if (!selectedDate) return "Agenda Clínica";
    const d = parseLocalIsoDate(selectedDate);
    if (viewMode === "dia") {
      const diaSemanaRaw = d.toLocaleDateString("pt-BR", {
        timeZone: TIMEZONE_BR,
        weekday: "long",
      });
      const diaSemana =
        diaSemanaRaw.charAt(0).toUpperCase() + diaSemanaRaw.slice(1);
      const dia = selectedDate.slice(8, 10);
      const mesRaw = d.toLocaleDateString("pt-BR", {
        timeZone: TIMEZONE_BR,
        month: "long",
      });
      const mes = mesRaw.charAt(0).toUpperCase() + mesRaw.slice(1);
      return `${diaSemana}, ${dia} de ${mes} de ${selectedDate.slice(0, 4)}`;
    }

    if (viewMode === "mes") {
      const [y, m] = selectedDate.split("-").map(Number);
      const mesNome = MESES_PT_FULL[(m || 1) - 1] || "Mês";
      return `${mesNome} de ${y}`;
    }

    if (viewMode === "semestre") {
      return getSemesterInfo(selectedDate).title;
    }

    if (visibleColumns.length === 0) return "Agenda Clínica";
    const first = visibleColumns[0];
    const last = visibleColumns[visibleColumns.length - 1];
    const ano = selectedDate.slice(0, 4);
    return `${first.dayNumber} ${first.monthShort} – ${last.dayNumber} ${last.monthShort} de ${ano}`;
  }, [selectedDate, viewMode, visibleColumns]);

  // Efeito 1: Carrega a lista de pacientes e médicos apenas 1 vez na montagem (dependência [])
  useEffect(() => {
    if (typeof window === "undefined") return;
    let isMounted = true;
    const controller = new AbortController();

    async function loadInitialCatalogsOnce() {
      try {
        const [resPacientes, resMedicos, resAuth] = await Promise.all([
          fetch("/api/pacientes", {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
            signal: controller.signal,
          }),
          fetch("/api/medicos", {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
            signal: controller.signal,
          }),
          fetch("/api/auth/me", {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
            signal: controller.signal,
          }),
        ]);

        if (!isMounted) return;

        if (resAuth.ok) {
          const jsonAuth = await resAuth.json();
          if (isMounted && jsonAuth.autenticado && jsonAuth.usuario) {
            if (jsonAuth.usuario.cargo) setCurrentUserCargo(jsonAuth.usuario.cargo);
            if (jsonAuth.usuario.role) setCurrentUserRole(jsonAuth.usuario.role);
          }
        }

        if (resPacientes.ok) {
          const jsonPac = await resPacientes.json();
          if (isMounted && Array.isArray(jsonPac.pacientes)) {
            setPacientes(
              jsonPac.pacientes.map((p: PacienteOption) => ({
                id: p.id,
                nome: p.nome,
                cpf: p.cpf || "",
                recordCode: p.recordCode || "",
                convenio: p.convenio || "Particular",
                planoFaaz: Boolean(p.planoFaaz),
                telefoneWhatsapp: p.telefoneWhatsapp || "",
              }))
            );
          }
        }

        if (resMedicos.ok) {
          const jsonMed = await resMedicos.json();
          if (isMounted && Array.isArray(jsonMed.medicos)) {
            const listaMedicos: MedicoOption[] = jsonMed.medicos.map(
              (m: MedicoOption) => ({
                id: m.id,
                nome: m.nome,
                especialidade: m.especialidade || "Medicina Geral",
                corHex: m.corHex || "#059669",
              })
            );
            setMedicos(listaMedicos);
            // Regra de Zero Atrito: pré-seleciona o médico principal automaticamente
            if (listaMedicos.length > 0) {
              setMedicoIdForm((prev) => prev || listaMedicos[0].id);
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("[AgendaPage] Erro ao buscar catálogos iniciais:", err);
        }
      }
    }

    loadInitialCatalogsOnce();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  // Efeito Auxiliar: Se redirecionado com ?pacienteId=... da lista de pacientes, abre o modal de Novo Agendamento
  const hasCheckedAgendaParamRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined" || pacientes.length === 0 || hasCheckedAgendaParamRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const paramPacId = params.get("pacienteId");
    if (!paramPacId) return;

    hasCheckedAgendaParamRef.current = true;
    let ativo = true;
    void Promise.resolve().then(() => {
      if (!ativo) return;
      const pac = pacientes.find((p) => p.id === paramPacId);
      if (pac) {
        setPacienteIdForm(pac.id);
        setPacienteBusca(pac.nome);
        setIsModalOpen(true);
      }
      window.history.replaceState({}, "", window.location.pathname);
    });
    return () => {
      ativo = false;
    };
  }, [pacientes]);

  // Efeito 2: Carrega agendamentos apenas quando valores primitivos [selectedDate, viewMode, filtroMedicoId, filtroEspecialidade, reloadTrigger] mudam
  useEffect(() => {
    if (!selectedDate) return;
    let isMounted = true;
    const controller = new AbortController();
    const query = buildAgendamentosQuery(
      selectedDate,
      viewMode,
      filtroMedicoId,
      filtroEspecialidade
    );

    async function loadAgendamentosByPeriod() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/agendamentos?${query}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
          signal: controller.signal,
        });
        if (!res.ok || !isMounted) return;
        const json = await res.json();
        if (isMounted && json.success && Array.isArray(json.agendamentos)) {
          setAgendamentos(json.agendamentos);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("[AgendaPage] Erro ao carregar agendamentos:", err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadAgendamentosByPeriod();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [
    selectedDate,
    viewMode,
    filtroMedicoId,
    filtroEspecialidade,
    reloadTrigger,
  ]);

  // Agendamentos filtrados por especialidade com data/horário normalizados em America/Sao_Paulo
  const agendamentosNormalizados = useMemo(() => {
    return agendamentos
      .filter((item) => {
        const espItem =
          item.especialidade === "CIRURGIA_PLASTICA"
            ? "CIRURGIA_PLASTICA"
            : "ENDOCRINOLOGIA";
        return filtroEspecialidade === "TODAS" || espItem === filtroEspecialidade;
      })
      .map((item) => ({
        ...item,
        data: getAgendamentoDataBR(item),
        horario: getAgendamentoHorarioBR(item),
      }));
  }, [agendamentos, filtroEspecialidade]);

  // Agendamentos pertencentes ao período principal (em "Mês", contabiliza exatamente o mês selecionado)
  const agendamentosDoPeriodoResumo = useMemo(() => {
    if (viewMode === "mes" && selectedDate) {
      const mesPrefix = selectedDate.slice(0, 7);
      return agendamentosNormalizados.filter((a) =>
        a.data.startsWith(mesPrefix)
      );
    }
    return agendamentosNormalizados;
  }, [agendamentosNormalizados, viewMode, selectedDate]);

  // Lista ordenada de agendamentos cancelados no período visível (para o popover Cancelados: N)
  const canceladosPeriodo = useMemo(() => {
    return agendamentosDoPeriodoResumo
      .filter((a) => a.status === "CANCELADO")
      .sort(
        (a, b) =>
          a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario)
      );
  }, [agendamentosDoPeriodoResumo]);

  // Itens efetivamente exibidos na grade (por padrão oculta CANCELADO para liberar o slot)
  const itensVisiveisNaGrade = useMemo(() => {
    if (mostrarCanceladosNaGrade) return agendamentosNormalizados;
    return agendamentosNormalizados.filter((a) => a.status !== "CANCELADO");
  }, [agendamentosNormalizados, mostrarCanceladosNaGrade]);

  // Régua horária dinâmica: padrão 08:00–19:00, expandindo automaticamente se existir consulta antes das 08:00 ou após as 18:30
  const gridRange = useMemo(() => {
    let startHour = DEFAULT_GRID_START_HOUR;
    let endHour = DEFAULT_GRID_END_HOUR;

    for (const item of itensVisiveisNaGrade) {
      const startMin = parseTimeToMinutes(item.horario);
      const duracao = Math.max(Number(item.duracaoMinutos) || 30, 15);
      const endMin = startMin + duracao;

      if (startMin < startHour * 60) {
        startHour = Math.max(0, Math.floor(startMin / 60));
      }
      if (endMin > endHour * 60) {
        endHour = Math.min(24, Math.ceil(endMin / 60));
      }
    }

    const totalHours = Math.max(1, endHour - startHour);
    const totalMinutes = totalHours * 60;
    const hourBlocks = Array.from(
      { length: totalHours },
      (_, idx) => startHour + idx
    );

    return { startHour, endHour, totalHours, totalMinutes, hourBlocks };
  }, [itensVisiveisNaGrade]);

  // Agendamentos posicionados matematicamente por coluna de data (puro via useMemo)
  const positionedByDate = useMemo(() => {
    const grouped: Record<string, AgendamentoItem[]> = {};
    for (const item of itensVisiveisNaGrade) {
      if (!grouped[item.data]) {
        grouped[item.data] = [];
      }
      grouped[item.data].push(item);
    }

    const result: Record<string, PositionedAgendamento[]> = {};
    for (const col of visibleColumns) {
      result[col.isoDate] = computeDayLayout(
        grouped[col.isoDate] || [],
        gridRange.startHour,
        gridRange.totalMinutes
      );
    }
    return result;
  }, [itensVisiveisNaGrade, visibleColumns, gridRange]);

  // Indicadores rápidos do período visível
  const resumoPeriodo = useMemo(() => {
    return {
      total: agendamentosDoPeriodoResumo.length,
      confirmados: agendamentosDoPeriodoResumo.filter(
        (a) => a.status === "CONFIRMADO"
      ).length,
      agendados: agendamentosDoPeriodoResumo.filter(
        (a) => a.status === "AGENDADO"
      ).length,
      encaixes: agendamentosDoPeriodoResumo.filter(
        (a) => Boolean(a.encaixe) && a.status !== "CANCELADO"
      ).length,
      cancelados: canceladosPeriodo.length,
    };
  }, [agendamentosDoPeriodoResumo, canceladosPeriodo]);

  const isCurrentTodayPeriod = useMemo(() => {
    if (!selectedDate || !hojeIso) return false;
    if (viewMode === "dia") return selectedDate === hojeIso;
    if (viewMode === "mes") {
      return selectedDate.slice(0, 7) === hojeIso.slice(0, 7);
    }
    if (viewMode === "semestre") {
      const selSem = getSemesterInfo(selectedDate);
      const hojeSem = getSemesterInfo(hojeIso);
      return selSem.year === hojeSem.year && selSem.semester === hojeSem.semester;
    }
    return visibleColumns.some((c) => c.isoDate === hojeIso);
  }, [selectedDate, hojeIso, viewMode, visibleColumns]);

  function handleStepPeriod(direction: -1 | 1) {
    if (!selectedDate) return;
    if (viewMode === "mes") {
      setSelectedDate(stepMonthsIso(selectedDate, direction));
      return;
    }
    if (viewMode === "semestre") {
      setSelectedDate(stepMonthsIso(selectedDate, direction * 6));
      return;
    }
    const delta = viewMode === "semana" ? 7 : 1;
    setSelectedDate(
      direction > 0
        ? adicionarDiasDataBR(selectedDate, delta)
        : subtrairDiasDataBR(selectedDate, delta)
    );
  }

  function handleGoToday() {
    setSelectedDate(getLocalIsoDate(new Date()));
  }

  // Reagendar paciente a partir de um agendamento cancelado (abre modal pré-preenchido como novo agendamento)
  function handleReagendarCancelado(item: AgendamentoItem) {
    setCanceladosPopoverOpen(false);
    setSelectedCard(null);
    setEditingAgendamento(null);
    setFormError(null);
    setEspecialidadeForm(
      item.especialidade === "CIRURGIA_PLASTICA"
        ? "CIRURGIA_PLASTICA"
        : "ENDOCRINOLOGIA"
    );
    setMedicoIdForm(item.medicoId || medicos[0]?.id || "");
    setPacienteIdForm(item.pacienteId);
    setPacienteBusca(item.pacienteNome);
    setComboboxOpen(false);
    setIsQuickCreateMode(false);
    setNovoPacienteTelefone("");
    setDataForm(item.data || selectedDate || getDataDiaBR());
    setHorarioForm(item.horario || "09:00");
    setDuracaoForm(item.duracaoMinutos || 30);
    setEncaixeForm(false);
    setTipoForm(item.tipo || "RETORNO");
    setObservacaoForm("");
    setIsModalOpen(true);
  }

  // INTERAÇÃO ZERO ATRITO: Clicar na grade pré-preenche Data, Horário exato, Especialidade e Médico
  function handleSlotClick(dateIso: string, horarioSlot: string) {
    setEditingAgendamento(null);
    setFormError(null);
    const defaultEspecialidade: EspecialidadeAgendamento =
      filtroEspecialidade !== "TODAS"
        ? filtroEspecialidade
        : "ENDOCRINOLOGIA";
    setEspecialidadeForm(defaultEspecialidade);
    const defaultMedicoId =
      filtroMedicoId !== "TODOS"
        ? filtroMedicoId
        : medicos[0]?.id || medicoIdForm || "";
    setMedicoIdForm(defaultMedicoId);
    setPacienteIdForm("");
    setPacienteBusca("");
    setComboboxOpen(false);
    setIsQuickCreateMode(false);
    setNovoPacienteTelefone("");
    setDataForm(dateIso);
    setHorarioForm(horarioSlot);
    setDuracaoForm(30);
    setEncaixeForm(false);
    setTipoForm("RETORNO");
    setObservacaoForm("");
    setIsModalOpen(true);
  }

  function handleOpenNovoModal() {
    handleSlotClick(selectedDate, "09:00");
  }

  function handleOpenEditModal(item: AgendamentoItem) {
    setSelectedCard(null);
    setEditingAgendamento(item);
    setFormError(null);
    setEspecialidadeForm(
      item.especialidade === "CIRURGIA_PLASTICA"
        ? "CIRURGIA_PLASTICA"
        : "ENDOCRINOLOGIA"
    );
    setMedicoIdForm(item.medicoId || medicos[0]?.id || "");
    setPacienteIdForm(item.pacienteId);
    setPacienteBusca(item.pacienteNome);
    setComboboxOpen(false);
    setIsQuickCreateMode(false);
    setNovoPacienteTelefone("");
    setDataForm(item.data);
    setHorarioForm(item.horario);
    setDuracaoForm(item.duracaoMinutos || 30);
    setEncaixeForm(Boolean(item.encaixe));
    setTipoForm(item.tipo);
    setObservacaoForm(item.observacao || "");
    setIsModalOpen(true);
  }

  // Atalho para ajustar apenas os minutos (:00, :15, :30, :45) no modal
  function handleQuickMinuteSelect(minStr: string) {
    const [hh] = (horarioForm || "09:00").split(":");
    const cleanHh = String(
      Math.min(Math.max(parseInt(hh, 10) || 9, 0), 23)
    ).padStart(2, "0");
    setHorarioForm(`${cleanHh}:${minStr}`);
  }

  async function handleUpdateStatus(
    item: AgendamentoItem,
    novoStatus: "AGENDADO" | "CONFIRMADO" | "CANCELADO"
  ) {
    setUpdatingStatusId(item.id);
    try {
      const res = await fetch(`/api/agendamentos/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "Não foi possível atualizar o status.");
        return;
      }

      setSelectedCard(null);
      setReloadTrigger((v) => v + 1);
      showToast(
        novoStatus === "CONFIRMADO"
          ? `Consulta de ${item.pacienteNome} confirmada!`
          : novoStatus === "AGENDADO"
            ? `Consulta de ${item.pacienteNome} restaurada na agenda!`
            : `Agendamento de ${item.pacienteNome} cancelado — horário liberado!`
      );
    } catch (err) {
      console.error("[AgendaPage] Erro ao atualizar status:", err);
      alert("Erro de conexão ao atualizar status.");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleSaveAgendamento(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nomeTrim = pacienteBusca.trim();
    const telTrim = novoPacienteTelefone.trim();

    if (isQuickCreateMode) {
      if (!nomeTrim) {
        setFormError("Informe o nome do novo paciente para cadastro expresso.");
        return;
      }
      if (!telTrim) {
        setFormError("Informe o Telefone (WhatsApp) do novo paciente.");
        return;
      }
    } else if (!pacienteIdForm) {
      setFormError(
        "Selecione um paciente existente ou clique em '+ Cadastrar rapidamente'."
      );
      return;
    }

    if (!especialidadeForm) {
      setFormError(
        "Selecione a especialidade (Endocrinologia ou Cirurgia Plástica)."
      );
      return;
    }

    if (!dataForm || !horarioForm) {
      setFormError("Preencha a data e o horário.");
      return;
    }

    setIsSaving(true);
    try {
      const url = editingAgendamento
        ? `/api/agendamentos/${editingAgendamento.id}`
        : "/api/agendamentos";
      const method = editingAgendamento ? "PATCH" : "POST";

      const resolvedMedicoId = medicoIdForm || medicos[0]?.id || undefined;

      const payload = isQuickCreateMode
        ? {
            medicoId: resolvedMedicoId,
            especialidade: especialidadeForm,
            novoPaciente: {
              nome: nomeTrim,
              telefone: telTrim,
            },
            data: dataForm,
            horario: horarioForm,
            duracaoMinutos: duracaoForm,
            encaixe: encaixeForm,
            tipo: tipoForm,
            observacao: observacaoForm,
          }
        : {
            medicoId: resolvedMedicoId,
            especialidade: especialidadeForm,
            pacienteId: pacienteIdForm,
            data: dataForm,
            horario: horarioForm,
            duracaoMinutos: duracaoForm,
            encaixe: encaixeForm,
            tipo: tipoForm,
            observacao: observacaoForm,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.error || "Erro ao salvar agendamento.");
        return;
      }

      if (json.novoPacienteCriado) {
        setPacientes((prev) => [...prev, json.novoPacienteCriado]);
      }

      setIsModalOpen(false);
      if (dataForm !== selectedDate && viewMode === "dia") {
        setSelectedDate(dataForm);
      } else {
        setReloadTrigger((v) => v + 1);
      }

      showToast(
        editingAgendamento
          ? "Agendamento atualizado na grade!"
          : isQuickCreateMode
          ? `Paciente "${nomeTrim}" cadastrado e agendado às ${horarioForm}!`
          : `Agendado às ${horarioForm} (${duracaoForm} min) com sucesso!`
      );
    } catch (err) {
      console.error("[AgendaPage] Erro ao salvar agendamento:", err);
      setFormError("Erro de conexão com o servidor.");
    } finally {
      setIsSaving(false);
    }
  }

  const pacientesFiltrados = useMemo(() => {
    const q = pacienteBusca.trim().toLowerCase();
    if (!q) return pacientes;
    const qDigits = q.replace(/\D/g, "");
    return pacientes.filter((p) => {
      const matchNome = p.nome.toLowerCase().includes(q);
      const matchCode = (p.recordCode || "").toLowerCase().includes(q);
      const matchCpf =
        qDigits.length > 0 && p.cpf.replace(/\D/g, "").includes(qDigits);
      return matchNome || matchCode || matchCpf;
    });
  }, [pacientes, pacienteBusca]);

  // Motor de Cores da Agenda baseado na Especialidade (Endocrinologia = Verde, Cirurgia Plástica = Azul)
  // Regra de Encaixe: mantém a cor da especialidade e exibe badge sólida "ENCAIXE" no topo do card
  function getCardStyles(
    status: StatusAgendamento,
    especialidade?: EspecialidadeAgendamento
  ) {
    if (status === "CANCELADO") {
      return {
        container:
          "bg-rose-50/85 hover:bg-rose-100/90 border-rose-200 border-l-4 border-l-rose-400 text-rose-950 opacity-75 backdrop-blur-[1px]",
        badge: "bg-rose-100 text-rose-700 border border-rose-200",
      };
    }

    if (especialidade === "CIRURGIA_PLASTICA") {
      return {
        container:
          "bg-blue-50 hover:bg-blue-100/95 border-blue-300 border-l-4 border-l-blue-500 text-blue-900 backdrop-blur-[2px] shadow-xs",
        badge:
          status === "CONFIRMADO"
            ? "bg-blue-600 text-white"
            : "bg-blue-100 text-blue-800 border border-blue-200",
      };
    }

    return {
      container:
        "bg-emerald-50 hover:bg-emerald-100/95 border-emerald-300 border-l-4 border-l-emerald-500 text-emerald-900 backdrop-blur-[2px] shadow-xs",
      badge:
        status === "CONFIRMADO"
          ? "bg-emerald-600 text-white"
          : "bg-emerald-100 text-emerald-800 border border-emerald-200",
    };
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-slate-50 overflow-hidden font-sans">
      {/* MENU SUPERIOR FIXO SEM COMPRESSÃO */}
      <div className="flex-none shrink-0">
        <TopMenu user={mockUserSession} activePath="/agenda" />
      </div>

      {/* TOAST DE FEEDBACK — CLINICAL LIGHT */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 cl-toast px-4 py-2.5 flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* CABEÇALHO SEM COMPRESSÃO (flex-none shrink-0) */}
      {/* ======================================================== */}
      <header className="flex-none shrink-0 bg-white border-b border-slate-200">
        <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
          {/* ESQUERDA: Botão Hoje + Setas < > + Data / Semana em Destaque + Seletor Rápido */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleGoToday}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isCurrentTodayPeriod
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
              }`}
            >
              Hoje
            </button>

            <div className="inline-flex items-center bg-slate-50 border border-slate-200/80 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => handleStepPeriod(-1)}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
                title={
                  viewMode === "semestre"
                    ? "Semestre anterior"
                    : viewMode === "mes"
                      ? "Mês anterior"
                      : viewMode === "semana"
                        ? "Semana anterior"
                        : "Dia anterior"
                }
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleStepPeriod(1)}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
                title={
                  viewMode === "semestre"
                    ? "Próximo semestre"
                    : viewMode === "mes"
                      ? "Próximo mês"
                      : viewMode === "semana"
                        ? "Próxima semana"
                        : "Próximo dia"
                }
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              {headerPeriodTitle}
            </h1>

            {/* Seletor Rápido de Data */}
            <div className="relative inline-flex items-center bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-600 mr-1.5 pointer-events-none" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                title="Selecionar data rapidamente"
              />
            </div>

            {/* Filtro Rápido de Especialidade (Toggle no Balcão da Secretária) */}
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setFiltroEspecialidade("TODAS")}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  filtroEspecialidade === "TODAS"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todas as Especialidades
              </button>
              <button
                type="button"
                onClick={() => setFiltroEspecialidade("ENDOCRINOLOGIA")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  filtroEspecialidade === "ENDOCRINOLOGIA"
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs"
                    : "text-slate-600 hover:text-emerald-800"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>Endocrinologia</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroEspecialidade("CIRURGIA_PLASTICA")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  filtroEspecialidade === "CIRURGIA_PLASTICA"
                    ? "bg-blue-50 text-blue-900 border border-blue-300 shadow-2xs"
                    : "text-slate-600 hover:text-blue-800"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span>Cirurgia Plástica</span>
              </button>
            </div>

            {/* Filtro Global de Profissional (Múltiplos Médicos) */}
            <div className="hidden 2xl:inline-flex relative items-center bg-slate-50 border border-slate-200/80 rounded-xl pl-3 pr-2 py-1 shadow-2xs">
              <span
                className="w-2.5 h-2.5 rounded-full mr-2 shrink-0 transition-colors"
                style={{
                  backgroundColor:
                    filtroMedicoId === "TODOS"
                      ? "#059669"
                      : medicos.find((m) => m.id === filtroMedicoId)?.corHex ||
                        "#059669",
                }}
              />
              <select
                value={filtroMedicoId}
                onChange={(e) => setFiltroMedicoId(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-slate-800 focus:outline-none cursor-pointer pr-1"
                title="Filtrar agenda por profissional"
              >
                <option value="TODOS">Todos os Médicos</option>
                {medicos.map((m) => (
                  <option key={m.id} value={m.id}>
                    Agenda: {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* DIREITA: Legenda de Status + Pílula Interativa Cancelados + Alternador Dia/Semana + Botão Novo Agendamento */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Confirmados: {resumoPeriodo.confirmados}
              </span>
              <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Agendados: {resumoPeriodo.agendados}
              </span>
              {resumoPeriodo.encaixes > 0 && (
                <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Encaixes: {resumoPeriodo.encaixes}
                </span>
              )}

              {/* PÍLULA INTERATIVA CANCELADOS: N + POPOVER DE GESTÃO */}
              <div className="relative" ref={canceladosPopoverRef}>
                <button
                  type="button"
                  onClick={() => setCanceladosPopoverOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    canceladosPopoverOpen
                      ? "bg-rose-100 text-rose-800 border-rose-300 shadow-2xs"
                      : resumoPeriodo.cancelados > 0
                        ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/80"
                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                  }`}
                  title="Ver horários cancelados, reagendar, restaurar ou exibir na grade"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      resumoPeriodo.cancelados > 0
                        ? "bg-rose-500"
                        : "bg-slate-300"
                    }`}
                  />
                  <span>Cancelados: {resumoPeriodo.cancelados}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      canceladosPopoverOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {canceladosPopoverOpen && (
                  <div className="absolute right-0 top-full mt-2 w-[360px] sm:w-[410px] max-w-[92vw] cl-card shadow-2xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    {/* Cabeçalho Clinical Light do Popover */}
                    <div className="cl-modal-header px-4 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>
                            Cancelados ({canceladosPeriodo.length})
                          </span>
                        </h3>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Horários cancelados ficam livres na grade para novos agendamentos.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCanceladosPopoverOpen(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Toggle Mostrar cancelados na grade (DESLIGADO por padrão) */}
                    <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-slate-700 block">
                          Mostrar cancelados na grade
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          Exibe faixa compacta sem bloquear novo agendamento
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={mostrarCanceladosNaGrade}
                        onClick={() =>
                          setMostrarCanceladosNaGrade((prev) => !prev)
                        }
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                          mostrarCanceladosNaGrade
                            ? "bg-emerald-600"
                            : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                            mostrarCanceladosNaGrade
                              ? "translate-x-4.5"
                              : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Lista de Cancelados do Período */}
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {canceladosPeriodo.length === 0 ? (
                        <div className="px-4 py-8 text-center space-y-1">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                          <p className="text-xs font-bold text-slate-700">
                            Nenhum cancelamento neste período
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Todos os agendamentos visíveis estão ativos.
                          </p>
                        </div>
                      ) : (
                        canceladosPeriodo.map((item) => {
                          const viaApp = isCanceladoViaApp(item);
                          const isPlastica =
                            item.especialidade === "CIRURGIA_PLASTICA";
                          const dataDdMm = item.data
                            ? `${item.data.slice(8, 10)}/${item.data.slice(5, 7)}`
                            : "";

                          return (
                            <div
                              key={item.id}
                              className="px-4 py-3 hover:bg-slate-50/70 transition-colors space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-black font-mono tabular-nums text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                      {viewMode !== "dia" && dataDdMm
                                        ? `${dataDdMm} • `
                                        : ""}
                                      {item.horario}
                                    </span>
                                    {viaApp && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                                        <Smartphone className="w-2.5 h-2.5" />
                                        <span>via App</span>
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          isPlastica
                                            ? "bg-blue-500"
                                            : "bg-emerald-500"
                                        }`}
                                      />
                                      <span>
                                        {isPlastica
                                          ? "Cir. Plástica"
                                          : "Endocrinologia"}
                                      </span>
                                    </span>
                                  </div>
                                  <p className="text-xs font-extrabold text-slate-800 truncate">
                                    {item.pacienteNome}
                                  </p>
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {item.medicoNome || "Equipe Clínica FAAZ"}
                                    {item.observacao
                                      ? ` • ${item.observacao}`
                                      : ""}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={updatingStatusId === item.id}
                                  onClick={() =>
                                    void handleUpdateStatus(item, "AGENDADO")
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {updatingStatusId === item.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3 text-slate-500" />
                                  )}
                                  <span>Restaurar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReagendarCancelado(item)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                                >
                                  <CalendarPlus className="w-3 h-3" />
                                  <span>Reagendar</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cl-segmented inline-flex items-center p-1 rounded-xl">
              {(
                [
                  { id: "dia", label: "Dia" },
                  { id: "semana", label: "Semana" },
                  { id: "mes", label: "Mês" },
                  { id: "semestre", label: "Semestre" },
                ] as Array<{ id: AgendaViewMode; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewMode(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === tab.id
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleOpenNovoModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Novo Agendamento</span>
            </button>
          </div>
        </div>

        {/* CABEÇALHO FIXO DAS COLUNAS DO CALENDÁRIO (Dia / Semana) */}
        {(viewMode === "dia" || viewMode === "semana") && (
          <div className="flex bg-slate-50/60">
            <div className="w-20 shrink-0 border-r border-slate-100 py-2 px-2 flex items-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                GMT-3
              </span>
            </div>

            <div
              className="flex-1 grid"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, visibleColumns.length)}, minmax(0, 1fr))`,
              }}
            >
              {visibleColumns.map((col) => (
                <div
                  key={col.isoDate}
                  onClick={() => setSelectedDate(col.isoDate)}
                  className={`py-2 px-3 border-r border-slate-100 last:border-r-0 flex items-center justify-between sm:justify-center gap-2 cursor-pointer transition-colors ${
                    col.isToday
                      ? "bg-emerald-50/40"
                      : col.isSelected
                      ? "bg-slate-100/50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`text-[11px] font-extrabold uppercase tracking-wider ${
                      col.isToday ? "text-emerald-700" : "text-slate-500"
                    }`}
                  >
                    {viewMode === "dia" ? col.weekdayLong : col.weekdayShort}
                  </span>
                  <span
                    className={`w-7 h-7 rounded-full text-xs font-black font-mono tabular-nums flex items-center justify-center ${
                      col.isToday
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : col.isSelected
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                        : "text-slate-800"
                    }`}
                  >
                    {col.dayNumber}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ======================================================== */}
      {/* CORPO PRINCIPAL: DIA / SEMANA (TIME-GRID) | MÊS | SEMESTRE */}
      {/* ======================================================== */}
      {viewMode === "mes" ? (
        <AgendaMonthView
          selectedDate={selectedDate}
          hojeIso={hojeIso}
          itensVisiveisNaGrade={itensVisiveisNaGrade}
          isLoading={isLoading}
          onSelectDay={(isoDate) => {
            setSelectedDate(isoDate);
            setViewMode("dia");
          }}
          onQuickAddDate={(isoDate) => handleSlotClick(isoDate, "09:00")}
          onSelectAgendamento={(item) => setSelectedCard(item)}
        />
      ) : viewMode === "semestre" ? (
        <AgendaSemesterView
          selectedDate={selectedDate}
          hojeIso={hojeIso}
          agendamentosNormalizados={agendamentosNormalizados}
          isLoading={isLoading}
          onOpenMonth={(firstDayIso) => {
            setSelectedDate(firstDayIso);
            setViewMode("mes");
          }}
          onOpenDay={(isoDate) => {
            setSelectedDate(isoDate);
            setViewMode("dia");
          }}
        />
      ) : (
      <div className="flex-1 min-h-0 flex overflow-hidden relative bg-white">
        {isLoading && (
          <div className="absolute top-2 right-4 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            <span>Sincronizando grade...</span>
          </div>
        )}

        {/* COLUNA ESQUERDA: RÓTULOS DINÂMICOS DAS HORAS (EXPANDE AUTOMATICAMENTE FORA DE 08:00–19:00) */}
        <div
          className="w-20 shrink-0 border-r border-slate-100 grid h-full select-none divide-y divide-slate-100 bg-slate-50/30"
          style={{
            gridTemplateRows: `repeat(${gridRange.totalHours}, minmax(0, 1fr))`,
          }}
        >
          {gridRange.hourBlocks.map((hour) => {
            const hh = String(hour).padStart(2, "0");
            return (
              <div
                key={hour}
                className="px-2.5 pt-1 flex flex-col justify-between items-end min-h-0"
              >
                <span className="text-xs font-extrabold text-slate-600 font-mono tabular-nums tracking-tight leading-none">
                  {hh}:00
                </span>
                <span className="text-[9px] font-semibold text-slate-300 font-mono tabular-nums leading-none pb-1">
                  {hh}:30
                </span>
              </div>
            );
          })}
        </div>

        {/* COLUNAS DOS DIAS COM LINHAS DE FUNDO + CARDS ABSOLUTOS PROPORCIONAIS */}
        <div
          className="flex-1 grid h-full min-h-0 overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, visibleColumns.length)}, minmax(0, 1fr))`,
          }}
        >
          {visibleColumns.map((col) => {
            const positionedItems = positionedByDate[col.isoDate] || [];

            return (
              <div
                key={col.isoDate}
                className="relative h-full min-h-0 border-r border-slate-100 last:border-r-0 overflow-hidden"
              >
                {/* CAMADA 1: LINHAS VISUAIS DE FUNDO (GUIAS CLICÁVEIS EM SUB-BLOCOS DE 15 MIN) */}
                <div
                  className="grid h-full w-full divide-y divide-slate-100"
                  style={{
                    gridTemplateRows: `repeat(${gridRange.totalHours}, minmax(0, 1fr))`,
                  }}
                >
                  {gridRange.hourBlocks.map((hour, idx) => {
                    const hh = String(hour).padStart(2, "0");
                    const isEven = idx % 2 === 0;

                    return (
                      <div
                        key={hour}
                        className={`grid grid-rows-4 min-h-0 h-full ${
                          isEven ? "bg-white" : "bg-slate-50/20"
                        }`}
                      >
                        {(["00", "15", "30", "45"] as const).map((quarter) => {
                          const timeLabel = `${hh}:${quarter}`;
                          return (
                            <div
                              key={quarter}
                              onClick={() =>
                                handleSlotClick(col.isoDate, timeLabel)
                              }
                              className={`group/slot relative flex items-center justify-between px-2.5 cursor-pointer hover:bg-emerald-50/50 transition-colors ${
                                quarter === "15"
                                  ? "border-b border-dashed border-slate-100/80"
                                  : ""
                              }`}
                              title={`Clique para agendar às ${timeLabel}`}
                            >
                              <span className="opacity-0 group-hover/slot:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 pointer-events-none">
                                <Plus className="w-3 h-3 stroke-[2.5]" />
                                <span>Agendar às {timeLabel}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* CAMADA 2: CARDS EM COLUNAS DIVIDIDAS LADO A LADO (ZERO OVERFLOW HORIZONTAL) */}
                {positionedItems.map(
                  ({
                    item,
                    topPercent,
                    heightPercent,
                    leftPercent,
                    widthPercent,
                    totalCols,
                    horarioFim,
                  }) => {
                    const isEncaixe = Boolean(item.encaixe);
                    const isPlanoFaaz = Boolean(
                      item.pacientePlanoFaaz || item.paciente?.planoFaaz
                    );
                    const espItem: EspecialidadeAgendamento =
                      item.especialidade === "CIRURGIA_PLASTICA"
                        ? "CIRURGIA_PLASTICA"
                        : "ENDOCRINOLOGIA";
                    const isCirurgiaPlastica = espItem === "CIRURGIA_PLASTICA";
                    const espDotHex = isCirurgiaPlastica
                      ? "#2563eb"
                      : "#059669";
                    const espCurta = isCirurgiaPlastica
                      ? "Cir. Plástica"
                      : "Endocrino";
                    const style = getCardStyles(item.status, espItem);
                    const isCancelado = item.status === "CANCELADO";
                    const confirmadoApp = isConfirmadoViaApp(item);
                    const canceladoApp = isCanceladoViaApp(item);
                    const isSplitOrWeek = totalCols > 1 || viewMode === "semana";
                    const canStackVertically =
                      isSplitOrWeek && (item.duracaoMinutos || 30) >= 30;

                    const statusBadgeLabel = confirmadoApp
                      ? "Confirmado · App"
                      : item.statusLegivel;

                    // Quando "Mostrar cancelados na grade" estiver ligado: faixa compacta com botão "+ Agendar neste horário"
                    if (isCancelado) {
                      return (
                        <div
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCard(item);
                          }}
                          style={{
                            width: `calc(${widthPercent}% - 4px)`,
                            left: `calc(${leftPercent}% + 2px)`,
                            top: `${topPercent}%`,
                            height: `${heightPercent}%`,
                          }}
                          className="absolute z-10 hover:z-20 box-border rounded-xl border border-dashed border-rose-300 bg-rose-50/75 hover:bg-rose-50 px-2 py-0.5 cursor-pointer transition-all overflow-hidden flex items-center justify-between gap-1.5 text-rose-900"
                        >
                          <div className="min-w-0 flex items-center gap-1.5 flex-1 overflow-hidden">
                            <span className="text-[10px] font-black font-mono tabular-nums shrink-0 text-rose-700">
                              {item.horario}
                            </span>
                            <span className="text-[11px] font-bold truncate line-through opacity-80 min-w-0">
                              {item.pacienteNome}
                            </span>
                            {canceladoApp && (
                              <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[9px] font-bold shrink-0">
                                <Smartphone className="w-2.5 h-2.5" />
                                <span>via App</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSlotClick(item.data, item.horario);
                              }}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold shrink-0 whitespace-nowrap shadow-2xs cursor-pointer"
                              title={`Agendar outro paciente às ${item.horario}`}
                            >
                              <Plus className="w-2.5 h-2.5 stroke-[2.6]" />
                              <span>
                                {viewMode === "semana"
                                  ? "Agendar"
                                  : "Agendar neste horário"}
                              </span>
                            </button>
                            <span className="hidden md:inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-extrabold shrink-0 whitespace-nowrap bg-rose-100 text-rose-700 border border-rose-200">
                              Cancelado
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCard(item);
                        }}
                        style={{
                          width: `calc(${widthPercent}% - 4px)`,
                          left: `calc(${leftPercent}% + 2px)`,
                          top: `${topPercent}%`,
                          height: `${heightPercent}%`,
                        }}
                        className={`absolute z-10 hover:z-20 box-border rounded-xl border px-2 py-0.5 cursor-pointer transition-all overflow-hidden ${
                          canStackVertically
                            ? "flex flex-col justify-center gap-0.5"
                            : "flex flex-row items-center justify-between gap-1.5"
                        } ${style.container}`}
                      >
                        {canStackVertically ? (
                          <>
                            {/* Linha 1 (Topo): Horário + Badges Compactas + Status sem corte */}
                            <div className="w-full min-w-0 flex items-center justify-between gap-1 leading-none">
                              <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                                <span className="text-[10px] font-black font-mono tabular-nums tracking-tight shrink-0 whitespace-nowrap leading-none">
                                  {item.horario}
                                  {viewMode === "dia" && totalCols <= 2
                                    ? `–${horarioFim}`
                                    : ""}
                                </span>
                                {isEncaixe && (
                                  <span className="inline-flex items-center px-1 py-0.2 rounded bg-amber-500 text-white text-[8px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap leading-none shadow-2xs">
                                    ENCAIXE
                                  </span>
                                )}
                                {item.tipo === "PRIMEIRA_CONSULTA" && (
                                  <span className="inline-flex items-center px-1 py-0.2 rounded bg-teal-700 text-white text-[8px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap leading-none">
                                    1ª
                                  </span>
                                )}
                              </div>
                              <span
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold shrink-0 whitespace-nowrap leading-none ${style.badge}`}
                              >
                                {confirmadoApp && (
                                  <Smartphone className="w-2.5 h-2.5 shrink-0" />
                                )}
                                <span>
                                  {viewMode === "semana" && confirmadoApp
                                    ? "App"
                                    : statusBadgeLabel}
                                </span>
                              </span>
                            </div>

                            {/* Linha 2 (Base): Nome do Paciente Truncado + Selo FAAZ + Especialidade */}
                            <div className="w-full min-w-0 flex items-center justify-between gap-1 leading-tight">
                              <div className="min-w-0 flex-1 flex items-center gap-1 overflow-hidden">
                                <span className="text-[11px] font-extrabold truncate whitespace-nowrap min-w-0">
                                  {item.pacienteNome}
                                </span>
                                {isPlanoFaaz && (
                                  <span className="inline-flex items-center px-1 py-0.2 rounded bg-amber-50/95 border border-amber-300 text-amber-600 text-[8px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap leading-none">
                                    FAAZ ✨
                                  </span>
                                )}
                              </div>

                              <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-white/85 border border-black/5 text-[9px] font-extrabold text-slate-700 shrink-0 whitespace-nowrap leading-none">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: espDotHex }}
                                />
                                <span>{espCurta}</span>
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Modo Linha Única (sempre preserva badge de status à direita sem corte) */}
                            <div className="min-w-0 flex items-center gap-1.5 flex-1 overflow-hidden">
                              <span className="text-[11px] font-black font-mono tabular-nums tracking-tight shrink-0 whitespace-nowrap">
                                {item.horario}
                                {item.duracaoMinutos >= 30 && viewMode === "dia"
                                  ? `–${horarioFim}`
                                  : ""}
                              </span>

                              {isEncaixe && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap shadow-2xs">
                                  ENCAIXE
                                </span>
                              )}

                              <span className="text-xs font-extrabold truncate whitespace-nowrap min-w-0">
                                {item.pacienteNome}
                              </span>

                              {isPlanoFaaz && (
                                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50/95 border border-amber-300 text-amber-600 text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap shadow-2xs">
                                  FAAZ ✨
                                </span>
                              )}

                              {item.tipo === "PRIMEIRA_CONSULTA" ? (
                                <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded bg-teal-700 text-white text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap shadow-2xs">
                                  1ª CONSULTA
                                </span>
                              ) : (
                                <span className="hidden lg:inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/80 border border-black/5 text-slate-700 shrink-0 whitespace-nowrap">
                                  {item.tipoLegivel}
                                </span>
                              )}

                              <span className="hidden xl:inline-block text-[10px] font-semibold opacity-75 shrink-0 whitespace-nowrap">
                                ({item.duracaoMinutos}m)
                              </span>

                              {item.observacao &&
                                viewMode === "dia" &&
                                totalCols === 1 && (
                                  <span className="hidden 2xl:inline-block text-[11px] opacity-75 truncate whitespace-nowrap min-w-0">
                                    • {item.observacao}
                                  </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-white/90 border border-black/5 text-[10px] font-extrabold text-slate-700 shrink-0 whitespace-nowrap shadow-2xs">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: espDotHex }}
                                />
                                <span>{espCurta}</span>
                              </span>

                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-extrabold shrink-0 whitespace-nowrap ${style.badge}`}
                              >
                                {confirmadoApp && (
                                  <Smartphone className="w-2.5 h-2.5 shrink-0" />
                                )}
                                <span>{statusBadgeLabel}</span>
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ======================================================== */}
      {/* POPOVER / MODAL DE GESTÃO RÁPIDA DO AGENDAMENTO (AO CLICAR NO CARD) */}
      {/* ======================================================== */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cl-modal-header px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 font-mono tabular-nums block">
                    {selectedCard.horario} ({selectedCard.duracaoMinutos || 30}{" "}
                    min) • {selectedCard.tipoLegivel}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                      {selectedCard.pacienteNome}
                    </h3>
                    {(selectedCard.pacientePlanoFaaz ||
                      selectedCard.paciente?.planoFaaz) && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-wider shrink-0">
                        FAAZ ✨
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-xs">
                <span className="font-bold text-slate-500">Especialidade:</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-extrabold border ${
                    selectedCard.especialidade === "CIRURGIA_PLASTICA"
                      ? "bg-blue-50 text-blue-900 border-blue-300"
                      : "bg-emerald-50 text-emerald-900 border-emerald-300"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedCard.especialidade === "CIRURGIA_PLASTICA"
                        ? "bg-blue-500"
                        : "bg-emerald-500"
                    }`}
                  />
                  <span>
                    {selectedCard.especialidade === "CIRURGIA_PLASTICA"
                      ? "Cirurgia Plástica"
                      : "Endocrinologia"}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-xs">
                <span className="font-bold text-slate-500">Profissional:</span>
                <span className="inline-flex items-center gap-1.5 font-extrabold text-slate-800">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: selectedCard.medicoCorHex || "#059669",
                    }}
                  />
                  <span>
                    {selectedCard.medicoNome || "Dr. Carlos Fantini"}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-xs">
                <span className="font-bold text-slate-500">Status Atual:</span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {selectedCard.encaixe && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider">
                      ENCAIXE
                    </span>
                  )}
                  {isConfirmadoViaApp(selectedCard) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
                      <Smartphone className="w-3 h-3" />
                      <span>Confirmado · App</span>
                    </span>
                  )}
                  {isCanceladoViaApp(selectedCard) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
                      <Smartphone className="w-3 h-3" />
                      <span>Cancelado · App</span>
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-extrabold ${
                      selectedCard.status === "CONFIRMADO"
                        ? "bg-emerald-100 text-emerald-800"
                        : selectedCard.status === "CANCELADO"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-slate-200 text-slate-800"
                    }`}
                  >
                    {selectedCard.statusLegivel}
                  </span>
                </div>
              </div>

              {selectedCard.observacao && (
                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-xs text-slate-600">
                  <span className="font-bold text-slate-700 block mb-0.5">
                    Observação:
                  </span>
                  {selectedCard.observacao}
                </div>
              )}

              {/* AÇÕES RESTRITAS DE GESTÃO (Confirmar, Cancelar, Restaurar/Reagendar, Editar, Ver Prontuário) */}
              {selectedCard.status === "CANCELADO" ? (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={updatingStatusId === selectedCard.id}
                    onClick={() => handleUpdateStatus(selectedCard, "AGENDADO")}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {updatingStatusId === selectedCard.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    <span>Restaurar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReagendarCancelado(selectedCard)}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    <span>Reagendar</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={updatingStatusId === selectedCard.id}
                    onClick={() => handleUpdateStatus(selectedCard, "CONFIRMADO")}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    {updatingStatusId === selectedCard.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Confirmar</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingStatusId === selectedCard.id}
                    onClick={() => handleUpdateStatus(selectedCard, "CANCELADO")}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-60 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancelar</span>
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(selectedCard)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar Horário / Dados</span>
                </button>

                {currentUserCargo !== "SECRETARIA" && currentUserRole !== "RECEPTIONIST" ? (
                  <Link
                    href={`/dashboard/pacientes?prontuarioId=${selectedCard.pacienteId}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ver Prontuário</span>
                  </Link>
                ) : (
                  <Link
                    href="/dashboard/pacientes"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                  >
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ver Cadastro</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE AGENDAMENTO FLEXÍVEL (HORÁRIOS QUEBRADOS + DURAÇÃO) */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="cl-modal-header px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    {editingAgendamento
                      ? "Editar Agendamento"
                      : "Novo Agendamento Flexível"}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                    Horário: {horarioForm} ({duracaoForm} min) •{" "}
                    {dataForm.split("-").reverse().join("/")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAgendamento} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 0. Seletor Visual de Especialidade (Radio Group em formato de botões) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Especialidade *
                </label>
                <div
                  role="radiogroup"
                  aria-label="Especialidade do agendamento"
                  className="grid grid-cols-2 gap-2.5"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={especialidadeForm === "ENDOCRINOLOGIA"}
                    onClick={() => {
                      setEspecialidadeForm("ENDOCRINOLOGIA");
                      const docEndocrino = medicos.find((m) =>
                        (m.especialidade || "")
                          .toLowerCase()
                          .includes("endocrin")
                      );
                      if (docEndocrino) setMedicoIdForm(docEndocrino.id);
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      especialidadeForm === "ENDOCRINOLOGIA"
                        ? "bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500/20 shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>Endocrinologia</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={especialidadeForm === "CIRURGIA_PLASTICA"}
                    onClick={() => {
                      setEspecialidadeForm("CIRURGIA_PLASTICA");
                      const docPlastica = medicos.find((m) =>
                        (m.especialidade || "")
                          .toLowerCase()
                          .includes("cirurgia")
                      );
                      if (docPlastica) setMedicoIdForm(docPlastica.id);
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      especialidadeForm === "CIRURGIA_PLASTICA"
                        ? "bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-500/20 shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <span>Cirurgia Plástica</span>
                  </button>
                </div>
              </div>

              {/* Seleção de Médico (Regra de Zero Atrito: pré-selecionado automaticamente) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Médico / Profissional *
                </label>
                <div className="relative flex items-center">
                  <span
                    className="w-2.5 h-2.5 rounded-full absolute left-3.5 pointer-events-none"
                    style={{
                      backgroundColor:
                        medicos.find((m) => m.id === medicoIdForm)?.corHex ||
                        "#059669",
                    }}
                  />
                  <select
                    value={medicoIdForm}
                    onChange={(e) => setMedicoIdForm(e.target.value)}
                    required
                    className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                  >
                    {medicos.length === 0 ? (
                      <option value="">Dr. Carlos Fantini</option>
                    ) : (
                      medicos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                          {m.especialidade ? ` — ${m.especialidade}` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* 1. Combobox de Busca Inteligente de Pacientes + Cadastro Expresso */}
              <div className="space-y-2.5 relative" ref={comboboxRef}>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Paciente *
                  </label>
                  {isQuickCreateMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsQuickCreateMode(false);
                        setNovoPacienteTelefone("");
                        setComboboxOpen(true);
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Buscar paciente já cadastrado
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={pacienteBusca}
                    onClick={() => {
                      if (!isQuickCreateMode) setComboboxOpen(true);
                    }}
                    onFocus={() => {
                      if (!isQuickCreateMode) setComboboxOpen(true);
                    }}
                    onChange={(e) => {
                      setPacienteBusca(e.target.value);
                      if (!isQuickCreateMode) {
                        setPacienteIdForm("");
                        setComboboxOpen(true);
                      }
                    }}
                    placeholder="Digite o nome, CPF ou código do paciente..."
                    className={`w-full pl-9 pr-9 py-2.5 border rounded-xl text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                      isQuickCreateMode
                        ? "bg-emerald-50/60 border-emerald-300 focus:ring-emerald-500/20 focus:border-emerald-500"
                        : "bg-slate-50 border-slate-200 focus:ring-emerald-500/20 focus:border-emerald-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setComboboxOpen(!comboboxOpen)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {comboboxOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl z-50 divide-y divide-slate-100">
                      {pacientesFiltrados.length === 0 ? (
                        pacienteBusca.trim().length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIsQuickCreateMode(true);
                              setPacienteIdForm("");
                              setTipoForm("PRIMEIRA_CONSULTA");
                              setComboboxOpen(false);
                            }}
                            className="w-full px-3.5 py-3 text-left flex items-center justify-between bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-900 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                              </span>
                              <span className="text-xs font-extrabold truncate">
                                + Cadastrar &ldquo;{pacienteBusca.trim()}&rdquo; rapidamente
                              </span>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white shrink-0 ml-2">
                              Novo
                            </span>
                          </button>
                        ) : (
                          <div className="p-3 text-xs text-slate-400 text-center">
                            Digite o nome do paciente para buscar ou cadastrar.
                          </div>
                        )
                      ) : (
                        <>
                          {pacientesFiltrados.map((p) => {
                            const isSelected = p.id === pacienteIdForm;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setIsQuickCreateMode(false);
                                  setNovoPacienteTelefone("");
                                  setPacienteIdForm(p.id);
                                  setPacienteBusca(p.nome);
                                  setComboboxOpen(false);
                                }}
                                className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-emerald-50/60 transition-colors cursor-pointer ${
                                  isSelected ? "bg-emerald-50" : ""
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span className="text-xs font-bold text-slate-800 truncate">
                                    {p.nome}
                                  </span>
                                  {p.planoFaaz && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-amber-50 border border-amber-300 text-amber-600 text-[9px] font-black uppercase tracking-wider shrink-0">
                                      FAAZ ✨
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400 shrink-0 ml-2">
                                  {p.cpf || p.recordCode}
                                </span>
                              </button>
                            );
                          })}

                          {pacienteBusca.trim().length >= 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsQuickCreateMode(true);
                                setPacienteIdForm("");
                                setTipoForm("PRIMEIRA_CONSULTA");
                                setComboboxOpen(false);
                              }}
                              className="w-full px-3.5 py-2.5 text-left flex items-center justify-between bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-800 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[2.5]" />
                                <span className="text-xs font-extrabold truncate">
                                  + Cadastrar &ldquo;{pacienteBusca.trim()}&rdquo; rapidamente
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-emerald-700 shrink-0 ml-2">
                                Cadastro Expresso
                              </span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Campo Extra Revelado no Modo de Criação Rápida (Cadastro Expresso) */}
                {isQuickCreateMode && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                        Cadastro Expresso • Primeira Consulta
                      </span>
                      <span className="px-2 py-0.5 rounded bg-teal-700 text-white text-[9px] font-black uppercase tracking-wider">
                        Novo Paciente
                      </span>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-emerald-950">
                        Telefone (WhatsApp) *
                      </label>
                      <input
                        type="tel"
                        value={novoPacienteTelefone}
                        autoFocus
                        onChange={(e) =>
                          setNovoPacienteTelefone(
                            formatWhatsAppInput(e.target.value)
                          )
                        }
                        placeholder="(11) 99999-9999"
                        required={isQuickCreateMode}
                        className="w-full px-3.5 py-2 bg-white border border-emerald-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Data + Horário Quebrado (step="900" = 15 min) + Duração */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Data *
                  </label>
                  <input
                    type="date"
                    value={dataForm}
                    onChange={(e) => setDataForm(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Horário (Início) *
                  </label>
                  <input
                    type="time"
                    step="900"
                    value={horarioForm}
                    onChange={(e) => setHorarioForm(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  {/* Atalhos rápidos de minutos quebrados (:00, :15, :30, :45) */}
                  <div className="flex items-center gap-1 pt-0.5">
                    {(["00", "15", "30", "45"] as const).map((m) => {
                      const isActiveMin = horarioForm.endsWith(`:${m}`);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleQuickMinuteSelect(m)}
                          className={`flex-1 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                            isActiveMin
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                          }`}
                        >
                          :{m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Duração *
                  </label>
                  <select
                    value={duracaoForm}
                    onChange={(e) =>
                      setDuracaoForm(Number(e.target.value) || 30)
                    }
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {DURACAO_OPCOES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. Select de Tipo + Checkbox Marcar como Encaixe */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Tipo de Consulta / Exame *
                  </label>
                  <select
                    value={tipoForm}
                    onChange={(e) =>
                      setTipoForm(e.target.value as TipoAgendamento)
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="PRIMEIRA_CONSULTA">Primeira Consulta</option>
                    <option value="RETORNO">Retorno</option>
                    <option value="EXAME">Exame</option>
                  </select>
                </div>

                {/* Checkbox / Toggle Elegante de Encaixe */}
                <label
                  htmlFor="checkbox-encaixe"
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                    encaixeForm
                      ? "bg-amber-50 border-amber-300 text-amber-900 shadow-2xs"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/80"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      id="checkbox-encaixe"
                      type="checkbox"
                      checked={encaixeForm}
                      onChange={(e) => setEncaixeForm(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-500"
                    />
                    <div>
                      <span className="text-xs font-extrabold block">
                        Marcar como Encaixe
                      </span>
                      <span className="text-[11px] opacity-80 block">
                        Permite sobreposição visual em cascata no mesmo horário
                      </span>
                    </div>
                  </div>
                  {encaixeForm && (
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider">
                      ENCAIXE
                    </span>
                  )}
                </label>
              </div>

              {/* 4. Observação */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Observação (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={observacaoForm}
                  onChange={(e) => setObservacaoForm(e.target.value)}
                  placeholder="Ex.: Encaixe rápido ou trazer resultados laboratoriais..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-all shadow-xs cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>
                      {editingAgendamento
                        ? "Salvar Alterações"
                        : "Confirmar Agendamento"}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
