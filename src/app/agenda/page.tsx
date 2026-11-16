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
} from "lucide-react";
import { TopMenu } from "@/components/TopMenu";
import { mockUserSession } from "@/mocks/dashboard";

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

// Janela diária do calendário: das 08:00 às 19:00 (11 blocos de 1 hora = 660 minutos)
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 19;
const TOTAL_HOURS = GRID_END_HOUR - GRID_START_HOUR; // 11 blocos
const TOTAL_GRID_MINUTES = TOTAL_HOURS * 60; // 660 minutos

const HOUR_BLOCKS: number[] = Array.from(
  { length: TOTAL_HOURS },
  (_, idx) => GRID_START_HOUR + idx
);

const DURACAO_OPCOES = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora (60 min)" },
  { value: 90, label: "1h 30m (90 min)" },
];

function getLocalIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseLocalIsoDate(isoDate: string): Date {
  const [ano, mes, dia] = isoDate.split("-").map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 12, 0, 0);
}

function parseTimeToMinutes(horario: string): number {
  if (!horario || !horario.includes(":")) return 9 * 60;
  const [hh, mm] = horario.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function formatMinutesToTime(totalMin: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${pad(hh)}:${pad(mm)}`;
}

function formatShortDoctorName(nome?: string): string {
  if (!nome) return "Dr. Carlos";
  const parts = nome.trim().split(/\s+/);
  if (parts.length >= 2 && /^dr(a)?\.?$/i.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0] || nome;
}

/**
 * Gera a query string da API puramente a partir de strings primitivas ('YYYY-MM-DD', 'dia' | 'semana', médico e especialidade)
 */
function buildAgendamentosQuery(
  selectedDateIso: string,
  mode: "dia" | "semana",
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
  const baseDate = parseLocalIsoDate(selectedDateIso);
  const dayOfWeek = baseDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `inicio=${getLocalIsoDate(monday)}&fim=${getLocalIsoDate(sunday)}${medicoSuffix}${especialidadeSuffix}`;
}

/**
 * Motor de Cálculo de Colisões (Overlap Algorithm - Side-by-Side):
 * Detecta agendamentos conflitantes no mesmo período de tempo e divide a largura
 * igualmente (width = 100% / N, left = colIndex * width), garantindo visão total
 * sem sobreposição em Z.
 */
function computeDayLayout(items: AgendamentoItem[]): PositionedAgendamento[] {
  if (!items || items.length === 0) return [];

  const startDayMin = GRID_START_HOUR * 60; // 480

  const parsed = items
    .map((item) => {
      const startMin = parseTimeToMinutes(item.horario);
      const duracao = Math.max(Number(item.duracaoMinutos) || 30, 15);
      const endMin = startMin + duracao;
      return { item, startMin, endMin, duracao };
    })
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
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
        ((entry.startMin - startDayMin) / TOTAL_GRID_MINUTES) * 100;
      const topPercent = Math.max(0, Math.min(96.5, rawTop));

      const rawHeight = (entry.duracao / TOTAL_GRID_MINUTES) * 100;
      const heightPercent = Math.max(
        3.5,
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
  // Datas em formato primitivo 'YYYY-MM-DD' (nunca objetos Date reativos)
  const [hojeIso] = useState<string>(() => getLocalIsoDate(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getLocalIsoDate(new Date())
  );
  const [viewMode, setViewMode] = useState<"dia" | "semana">("dia");
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

  // Fecha o combobox de pacientes ao clicar fora e trava rolagem global no html/body
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
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.removeEventListener("mousedown", handleClickOutside);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Colunas visíveis na grade (1 coluna no modo "dia", 7 colunas no modo "semana")
  const visibleColumns = useMemo(() => {
    const baseDate = parseLocalIsoDate(selectedDate);

    if (viewMode === "dia") {
      const dStr = getLocalIsoDate(baseDate);
      const diaSemanaCurto = baseDate
        .toLocaleDateString("pt-BR", { weekday: "short" })
        .replace(".", "")
        .toUpperCase();
      const diaSemanaLongo = baseDate.toLocaleDateString("pt-BR", {
        weekday: "long",
      });
      return [
        {
          isoDate: dStr,
          dayNumber: String(baseDate.getDate()).padStart(2, "0"),
          weekdayShort: diaSemanaCurto,
          weekdayLong:
            diaSemanaLongo.charAt(0).toUpperCase() + diaSemanaLongo.slice(1),
          monthShort: baseDate
            .toLocaleDateString("pt-BR", { month: "short" })
            .replace(".", ""),
          isToday: dStr === hojeIso,
          isSelected: true,
        },
      ];
    }

    // Modo Semana: Segunda a Domingo da semana selecionada
    const dayOfWeek = baseDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMonday);

    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = getLocalIsoDate(d);
      const diaSemanaCurto = d
        .toLocaleDateString("pt-BR", { weekday: "short" })
        .replace(".", "")
        .toUpperCase();
      const diaSemanaLongo = d.toLocaleDateString("pt-BR", { weekday: "long" });
      cols.push({
        isoDate: dStr,
        dayNumber: String(d.getDate()).padStart(2, "0"),
        weekdayShort: diaSemanaCurto,
        weekdayLong:
          diaSemanaLongo.charAt(0).toUpperCase() + diaSemanaLongo.slice(1),
        monthShort: d
          .toLocaleDateString("pt-BR", { month: "short" })
          .replace(".", ""),
        isToday: dStr === hojeIso,
        isSelected: dStr === selectedDate,
      });
    }
    return cols;
  }, [selectedDate, viewMode, hojeIso]);

  // Título formatado do período no cabeçalho
  const headerPeriodTitle = useMemo(() => {
    const d = parseLocalIsoDate(selectedDate);
    if (viewMode === "dia") {
      const diaSemanaRaw = d.toLocaleDateString("pt-BR", { weekday: "long" });
      const diaSemana =
        diaSemanaRaw.charAt(0).toUpperCase() + diaSemanaRaw.slice(1);
      const dia = String(d.getDate()).padStart(2, "0");
      const mesRaw = d.toLocaleDateString("pt-BR", { month: "long" });
      const mes = mesRaw.charAt(0).toUpperCase() + mesRaw.slice(1);
      return `${diaSemana}, ${dia} de ${mes} de ${d.getFullYear()}`;
    }

    const first = visibleColumns[0];
    const last = visibleColumns[visibleColumns.length - 1];
    const ano = d.getFullYear();
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
    if (paramPacId) {
      hasCheckedAgendaParamRef.current = true;
      const pac = pacientes.find((p) => p.id === paramPacId);
      if (pac) {
        setPacienteIdForm(pac.id);
        setPacienteBusca(pac.nome);
        setIsModalOpen(true);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [pacientes]);

  // Efeito 2: Carrega agendamentos apenas quando valores primitivos [selectedDate, viewMode, filtroMedicoId, filtroEspecialidade, reloadTrigger] mudam
  useEffect(() => {
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

  // Agendamentos posicionados matematicamente por coluna de data (puro via useMemo, sem disparar efeitos)
  const positionedByDate = useMemo(() => {
    const grouped: Record<string, AgendamentoItem[]> = {};
    for (const item of agendamentos) {
      const espItem =
        item.especialidade === "CIRURGIA_PLASTICA"
          ? "CIRURGIA_PLASTICA"
          : "ENDOCRINOLOGIA";
      if (filtroEspecialidade !== "TODAS" && espItem !== filtroEspecialidade) {
        continue;
      }
      if (!grouped[item.data]) {
        grouped[item.data] = [];
      }
      grouped[item.data].push(item);
    }

    const result: Record<string, PositionedAgendamento[]> = {};
    for (const col of visibleColumns) {
      result[col.isoDate] = computeDayLayout(grouped[col.isoDate] || []);
    }
    return result;
  }, [agendamentos, visibleColumns, filtroEspecialidade]);

  // Indicadores rápidos do período visível
  const resumoPeriodo = useMemo(() => {
    const filtrados =
      filtroEspecialidade === "TODAS"
        ? agendamentos
        : agendamentos.filter(
            (a) =>
              (a.especialidade === "CIRURGIA_PLASTICA"
                ? "CIRURGIA_PLASTICA"
                : "ENDOCRINOLOGIA") === filtroEspecialidade
          );
    return {
      total: filtrados.length,
      confirmados: filtrados.filter((a) => a.status === "CONFIRMADO").length,
      agendados: filtrados.filter((a) => a.status === "AGENDADO").length,
      encaixes: filtrados.filter((a) => Boolean(a.encaixe)).length,
      cancelados: filtrados.filter((a) => a.status === "CANCELADO").length,
    };
  }, [agendamentos, filtroEspecialidade]);

  function handleStepPeriod(direction: -1 | 1) {
    const current = parseLocalIsoDate(selectedDate);
    const delta = viewMode === "semana" ? direction * 7 : direction;
    current.setDate(current.getDate() + delta);
    setSelectedDate(getLocalIsoDate(current));
  }

  function handleGoToday() {
    setSelectedDate(getLocalIsoDate(new Date()));
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
      Math.min(Math.max(parseInt(hh, 10) || 9, 8), 18)
    ).padStart(2, "0");
    setHorarioForm(`${cleanHh}:${minStr}`);
  }

  async function handleUpdateStatus(
    item: AgendamentoItem,
    novoStatus: "CONFIRMADO" | "CANCELADO"
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
          : `Agendamento de ${item.pacienteNome} cancelado.`
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

      {/* TOAST DE FEEDBACK */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
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
                selectedDate === hojeIso
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
                  viewMode === "semana" ? "Semana anterior" : "Dia anterior"
                }
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleStepPeriod(1)}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
                title={viewMode === "semana" ? "Próxima semana" : "Próximo dia"}
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

          {/* DIREITA: Legenda de Status + Alternador Dia/Semana + Botão Novo Agendamento */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden xl:flex items-center gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Confirmados: {resumoPeriodo.confirmados}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Agendados: {resumoPeriodo.agendados}
              </span>
              {resumoPeriodo.encaixes > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Encaixes: {resumoPeriodo.encaixes}
                </span>
              )}
            </div>

            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => setViewMode("dia")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "dia"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Dia
              </button>
              <button
                type="button"
                onClick={() => setViewMode("semana")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "semana"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Semana
              </button>
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

        {/* CABEÇALHO FIXO DAS COLUNAS DO CALENDÁRIO */}
        <div className="flex bg-slate-50/60">
          <div className="w-20 shrink-0 border-r border-slate-100 py-2 px-2 flex items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              GMT-3
            </span>
          </div>

          <div
            className="flex-1 grid"
            style={{
              gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))`,
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
                  className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${
                    col.isToday
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : col.isSelected
                      ? "bg-slate-900 text-white"
                      : "text-slate-800"
                  }`}
                >
                  {col.dayNumber}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* TIME-GRID DINÂMICO ZERO-SCROLL (GOOGLE / APPLE CALENDAR) */}
      {/* ======================================================== */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative bg-white">
        {isLoading && (
          <div className="absolute top-2 right-4 z-30 bg-white/95 backdrop-blur-xs border border-slate-200 px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            <span>Sincronizando grade...</span>
          </div>
        )}

        {/* COLUNA ESQUERDA: RÓTULOS DAS 11 HORAS (08:00 ÀS 18:00) */}
        <div
          className="w-20 shrink-0 border-r border-slate-100 grid h-full select-none divide-y divide-slate-100 bg-slate-50/30"
          style={{ gridTemplateRows: `repeat(${TOTAL_HOURS}, minmax(0, 1fr))` }}
        >
          {HOUR_BLOCKS.map((hour) => {
            const hh = String(hour).padStart(2, "0");
            return (
              <div
                key={hour}
                className="px-2.5 pt-1 flex flex-col justify-between items-end min-h-0"
              >
                <span className="text-xs font-extrabold text-slate-600 tracking-tight leading-none">
                  {hh}:00
                </span>
                <span className="text-[9px] font-semibold text-slate-300 leading-none pb-1">
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
            gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))`,
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
                    gridTemplateRows: `repeat(${TOTAL_HOURS}, minmax(0, 1fr))`,
                  }}
                >
                  {HOUR_BLOCKS.map((hour, idx) => {
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

                {/* CAMADA 2: CARDS EM COLUNAS DIVIDIDAS LADO A LADO (SIDE-BY-SIDE / ZERO SOBREPOSIÇÃO) */}
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
                    const isSplitOrWeek = totalCols > 1 || viewMode === "semana";
                    const canStackVertically =
                      isSplitOrWeek && (item.duracaoMinutos || 30) >= 30;

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCard(item);
                        }}
                        style={{
                          width: `${widthPercent}%`,
                          left: `${leftPercent}%`,
                          top: `${topPercent}%`,
                          height: `${heightPercent}%`,
                        }}
                        className={`absolute z-10 hover:z-20 rounded-xl border px-2 py-0.5 cursor-pointer transition-all overflow-hidden ${
                          canStackVertically
                            ? "flex flex-col justify-center gap-0.5"
                            : "flex flex-row items-center justify-between gap-2"
                        } ${style.container}`}
                      >
                        {canStackVertically ? (
                          <>
                            {/* Linha 1 (Topo): Horário + Badges Compactas (ENCAIXE / PRIMEIRA CONSULTA) */}
                            <div className="w-full min-w-0 flex items-center justify-between gap-1 overflow-hidden whitespace-nowrap leading-none">
                              <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                                <span className="text-[10px] font-black tracking-tight shrink-0 whitespace-nowrap leading-none">
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
                                    PRIMEIRA CONSULTA
                                  </span>
                                )}
                              </div>
                              {viewMode === "dia" && totalCols <= 2 && (
                                <span
                                  className={`hidden md:inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-extrabold shrink-0 whitespace-nowrap leading-none ${style.badge}`}
                                >
                                  {item.statusLegivel}
                                </span>
                              )}
                            </div>

                            {/* Linha 2 (Base): Nome do Paciente Truncado + Selo FAAZ ✨ + Tag Sutil da Especialidade */}
                            <div className="w-full min-w-0 flex items-center justify-between gap-1.5 overflow-hidden whitespace-nowrap leading-tight">
                              <div className="min-w-0 flex items-center gap-1.5 overflow-hidden">
                                <span
                                  className={`text-[11px] font-extrabold truncate whitespace-nowrap min-w-0 ${
                                    isCancelado ? "line-through" : ""
                                  }`}
                                >
                                  {item.pacienteNome}
                                </span>
                                {isPlanoFaaz && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-amber-50/95 border border-amber-300 text-amber-600 text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap leading-none shadow-2xs">
                                    FAAZ ✨
                                  </span>
                                )}
                                {item.tipo !== "PRIMEIRA_CONSULTA" &&
                                  viewMode === "dia" &&
                                  totalCols <= 2 && (
                                    <span className="hidden lg:inline-block text-[9px] font-bold opacity-75 shrink-0 whitespace-nowrap">
                                      • {item.tipoLegivel}
                                    </span>
                                  )}
                              </div>

                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-white/85 border border-black/5 text-[9px] font-extrabold text-slate-700 shrink-0 whitespace-nowrap leading-none">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: espDotHex,
                                  }}
                                />
                                <span>{espCurta}</span>
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Modo Linha Única (100% de largura ou card de 15 min) */}
                            <div className="min-w-0 flex items-center gap-1.5 flex-1 overflow-hidden whitespace-nowrap">
                              <span className="text-[11px] font-black tracking-tight shrink-0 whitespace-nowrap">
                                {item.horario}
                                {item.duracaoMinutos >= 30 && viewMode === "dia"
                                  ? ` – ${horarioFim}`
                                  : ""}
                              </span>

                              {isEncaixe && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap shadow-2xs">
                                  ENCAIXE
                                </span>
                              )}

                              <span
                                className={`text-xs font-extrabold truncate whitespace-nowrap min-w-0 ${
                                  isCancelado ? "line-through" : ""
                                }`}
                              >
                                {item.pacienteNome}
                              </span>

                              {isPlanoFaaz && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50/95 border border-amber-300 text-amber-600 text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap shadow-2xs">
                                  FAAZ ✨
                                </span>
                              )}

                              {item.tipo === "PRIMEIRA_CONSULTA" ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-teal-700 text-white text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap shadow-2xs">
                                  PRIMEIRA CONSULTA
                                </span>
                              ) : (
                                <span className="hidden sm:inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/80 border border-black/5 text-slate-700 shrink-0 whitespace-nowrap">
                                  {item.tipoLegivel}
                                </span>
                              )}

                              <span className="hidden md:inline-block text-[10px] font-semibold opacity-75 shrink-0 whitespace-nowrap">
                                ({item.duracaoMinutos}m)
                              </span>

                              {item.observacao &&
                                viewMode === "dia" &&
                                totalCols === 1 && (
                                  <span className="hidden lg:inline-block text-[11px] opacity-75 truncate whitespace-nowrap min-w-0">
                                    • {item.observacao}
                                  </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-white/90 border border-black/5 text-[10px] font-extrabold text-slate-700 shrink-0 whitespace-nowrap shadow-2xs">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: espDotHex,
                                  }}
                                />
                                <span>
                                  {isCirurgiaPlastica
                                    ? "Cirurgia Plástica"
                                    : "Endocrinologia"}
                                </span>
                              </span>

                              <span
                                className={`hidden sm:inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-extrabold shrink-0 whitespace-nowrap ${style.badge}`}
                              >
                                {item.statusLegivel}
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

      {/* ======================================================== */}
      {/* POPOVER / MODAL DE GESTÃO RÁPIDA DO AGENDAMENTO (AO CLICAR NO CARD) */}
      {/* ======================================================== */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">
                    {selectedCard.horario} ({selectedCard.duracaoMinutos || 30}{" "}
                    min) • {selectedCard.tipoLegivel}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-sm sm:text-base font-extrabold truncate">
                      {selectedCard.pacienteNome}
                    </h3>
                    {(selectedCard.pacientePlanoFaaz ||
                      selectedCard.paciente?.planoFaaz) && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-black uppercase tracking-wider shrink-0">
                        FAAZ ✨
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
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
                <div className="flex items-center gap-2">
                  {selectedCard.encaixe && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider">
                      ENCAIXE
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

              {/* AÇÕES RESTRITAS DE GESTÃO (Confirmar, Cancelar, Editar, Ver Prontuário) */}
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold tracking-tight">
                    {editingAgendamento
                      ? "Editar Agendamento"
                      : "Novo Agendamento Flexível"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Horário: {horarioForm} ({duracaoForm} min) •{" "}
                    {dataForm.split("-").reverse().join("/")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
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
