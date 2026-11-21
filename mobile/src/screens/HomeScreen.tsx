import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Droplets,
  Dumbbell,
  Scale,
  HeartPulse,
  Activity,
  Ruler,
  Utensils,
  Pill,
  CheckCircle2,
  ChevronRight,
  Clock,
  Target,
  Plus,
  Syringe,
  X,
  AlertTriangle,
  Check,
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { useDiarioAlimentar } from "../contexts/DiarioAlimentarContext";
import { FoodThumbnail } from "../components/FoodThumbnail";
import { BottomTabBar, MainTabKey } from "../components/BottomTabBar";
import { RegistrarPesoModal } from "../components/RegistrarPesoModal";
import {
  api,
  CelulaMapaGlicemicoItem,
  CheckinRefeicaoStatus,
  LinhaMapaGlicemicoItem,
  MeasurementItem,
  MomentoClinicoGlicemia,
  PacienteTreinosResponse,
  ProtocoloGlicemicoItem,
  GlicemiaHistoricoItem,
  IntestinoCheckinItem,
  resolveAssetUrl,
  SlotMapaGlicemico,
} from "../services/api";
import {
  getConfigObjetivoClinico,
  avaliarVariacaoPeso,
} from "../utils/objetivoClinico";
import {
  classificarGlicemiaClinica,
  getFaixaAlvoMomento,
  getLabelMomentoGlicemia,
  MOMENTO_GLICEMIA_LABELS,
} from "../utils/glicemiaClassificacao";
import {
  formatHorarioCurto,
  getItemEfetivo,
  selecionarProximaRefeicaoHome,
} from "../utils/dietaHelpers";
import {
  formatarDataCurtaBR,
  getDataBR,
  getHojeBR,
  getHoraBR,
  getHoraMinutosBR,
  getSaudacaoBR,
} from "../utils/dateBr";

export interface HomeScreenProps {
  completedCheckins?: string[];
  refreshKey?: number;
  onNavigateToCheckin?: (id: string) => void;
  onTabPress?: (tabName: MainTabKey | string) => void;
  onNavigateToDieta?: () => void;
  onNavigateToMetas?: () => void;
}

function getSaudacao(): string {
  return getSaudacaoBR();
}

function formatPrimeiroNome(nomeCompleto?: string | null): string {
  if (!nomeCompleto || !nomeCompleto.trim()) return "Paciente";
  const first = nomeCompleto.trim().split(/\s+/)[0] || "Paciente";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function formatHoraLocal(iso?: string | null): string {
  return getHoraBR(iso);
}

function formatStatusRefeicaoHome(status?: CheckinRefeicaoStatus | null): {
  label: string;
  bg: string;
  border: string;
  color: string;
} {
  if (status === "SEGUI") {
    return {
      label: "✓ Segui",
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#047857",
    };
  }
  if (status === "FIZ_TROCA") {
    return {
      label: "⇄ Fiz troca",
      bg: "#ecfeff",
      border: "#a5f3fc",
      color: "#0e7490",
    };
  }
  if (status === "NAO_FIZ") {
    return {
      label: "○ Não fiz",
      bg: "#f1f5f9",
      border: "#cbd5e1",
      color: "#475569",
    };
  }
  return {
    label: "A fazer",
    bg: "#f8fafc",
    border: "#e2e8f0",
    color: "#64748b",
  };
}

function formatBristolResumo(item: IntestinoCheckinItem): {
  titulo: string;
  subtitulo: string;
  cor: string;
  bg: string;
} {
  const cat = (item.categoria || "").toLowerCase();
  if (cat === "ideal" || item.tipoBristol === 3 || item.tipoBristol === 4) {
    return {
      titulo: `Tipo ${item.tipoBristol}`,
      subtitulo: "Padrão ideal hoje",
      cor: "#047857",
      bg: "#ecfdf5",
    };
  }
  if (cat === "constipacao" || item.tipoBristol <= 2) {
    return {
      titulo: `Tipo ${item.tipoBristol}`,
      subtitulo: "Constipação",
      cor: "#b45309",
      bg: "#fffbeb",
    };
  }
  return {
    titulo: `Tipo ${item.tipoBristol}`,
    subtitulo: "Diarreia / acelerado",
    cor: "#be123c",
    bg: "#fff1f2",
  };
}

interface MedidasConsolidadasHome {
  temDados: boolean;
  dataCurta: string | null;
  waist: number | null;
  abdomen: number | null;
  hips: number | null;
  waistTexto: string;
  abdomenTexto: string;
  hipsTexto: string;
  valorMeiaLargura: string;
  subtituloMeiaLargura: string;
}

function formatCmBr(val: number | null): string {
  if (val === null || val === undefined || Number.isNaN(Number(val))) {
    return "--";
  }
  return `${Number(val).toFixed(1).replace(".", ",")} cm`;
}

function formatNum1Br(val: number): string {
  return Number(val).toFixed(1).replace(".", ",");
}

function consolidarMedidasHome(
  list: MeasurementItem[]
): MedidasConsolidadasHome {
  if (!Array.isArray(list) || list.length === 0) {
    return {
      temDados: false,
      dataCurta: null,
      waist: null,
      abdomen: null,
      hips: null,
      waistTexto: "--",
      abdomenTexto: "--",
      hipsTexto: "--",
      valorMeiaLargura: "Registrar",
      subtituloMeiaLargura: "Cintura, abdômen e quadril",
    };
  }

  const ordenadas = [...list].sort(
    (a, b) =>
      new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
  );

  const pickLatest = (
    key: "waist" | "abdomen" | "hips" | "bodyFatPercentage"
  ): number | null => {
    for (const item of ordenadas) {
      const raw = item[key];
      if (raw !== null && raw !== undefined && !Number.isNaN(Number(raw))) {
        const num = Number(raw);
        if (num > 0) return num;
      }
    }
    return null;
  };

  const waist = pickLatest("waist");
  const abdomen = pickLatest("abdomen");
  const hips = pickLatest("hips");
  const bodyFat = pickLatest("bodyFatPercentage");

  const newestDate = new Date(ordenadas[0].measuredAt);
  const dataCurta = !Number.isNaN(newestDate.getTime())
    ? formatarDataCurtaBR(newestDate)
    : null;

  const temAlgumaCircunferencia =
    waist !== null || abdomen !== null || hips !== null;
  const temDados = temAlgumaCircunferencia || bodyFat !== null;

  // Layout meia largura (quando a grade 2x2 tem 4 cards com Glicemia ativa):
  // Prioriza Cintura em destaque e linha secundária compacta "Abd 85,0 • Quad 101,0"
  let valorMeiaLargura = "Registrar";
  let subtituloMeiaLargura = "Cintura, abdômen e quadril";

  if (waist !== null) {
    valorMeiaLargura = `${formatNum1Br(waist)} cm`;
    const secundarios: string[] = [];
    if (abdomen !== null) secundarios.push(`Abd ${formatNum1Br(abdomen)}`);
    if (hips !== null) secundarios.push(`Quad ${formatNum1Br(hips)}`);
    subtituloMeiaLargura =
      secundarios.length > 0
        ? secundarios.join(" • ")
        : dataCurta
          ? `Cintura • ${dataCurta}`
          : "Cintura";
  } else if (abdomen !== null) {
    valorMeiaLargura = `${formatNum1Br(abdomen)} cm`;
    subtituloMeiaLargura =
      hips !== null
        ? `Abdômen • Quad ${formatNum1Br(hips)}`
        : dataCurta
          ? `Abdômen • ${dataCurta}`
          : "Abdômen";
  } else if (hips !== null) {
    valorMeiaLargura = `${formatNum1Br(hips)} cm`;
    subtituloMeiaLargura = dataCurta ? `Quadril • ${dataCurta}` : "Quadril";
  } else if (bodyFat !== null) {
    valorMeiaLargura = `${formatNum1Br(bodyFat)}%`;
    subtituloMeiaLargura = dataCurta ? `Gordura • ${dataCurta}` : "Gordura";
  }

  return {
    temDados,
    dataCurta,
    waist,
    abdomen,
    hips,
    waistTexto: formatCmBr(waist),
    abdomenTexto: formatCmBr(abdomen),
    hipsTexto: formatCmBr(hips),
    valorMeiaLargura,
    subtituloMeiaLargura,
  };
}

const SLOT_LABELS = MOMENTO_GLICEMIA_LABELS;

const ALL_SLOTS_ORDER: SlotMapaGlicemico[] = [
  "JEJUM",
  "POS_CAFE",
  "PRE_ALMOCO",
  "POS_ALMOCO",
  "PRE_JANTAR",
  "POS_JANTAR",
  "AO_DEITAR",
];

const CONTEXTO_CHIPS = [
  { id: "COMI_FORA", label: "Comi fora" },
  { id: "EXERCICIO", label: "Exercício" },
  { id: "SINTOMA_HIPO", label: "Sintoma de hipo" },
] as const;

function formatUILabel(val: number): string {
  const r = Math.round(val * 10) / 10;
  return Number.isInteger(r)
    ? `${r} UI`
    : `${r.toFixed(1).replace(".", ",")} UI`;
}

function sugerirMomentoPorHoraAtual(slotsAtivos: SlotMapaGlicemico[]): MomentoClinicoGlicemia {
  const { hour: h } = getHoraMinutosBR();
  let candidato: SlotMapaGlicemico = "JEJUM";
  if (h < 9) candidato = "JEJUM";
  else if (h < 11) candidato = "POS_CAFE";
  else if (h < 13) candidato = "PRE_ALMOCO";
  else if (h < 16) candidato = "POS_ALMOCO";
  else if (h < 19) candidato = "PRE_JANTAR";
  else if (h < 22) candidato = "POS_JANTAR";
  else candidato = "AO_DEITAR";

  if (slotsAtivos.length > 0) {
    if (slotsAtivos.includes(candidato)) return candidato;
    return slotsAtivos[0];
  }
  return candidato;
}

export function HomeScreen({
  completedCheckins = [],
  refreshKey = 0,
  onNavigateToCheckin,
  onTabPress,
  onNavigateToDieta,
}: HomeScreenProps) {
  const { paciente } = usePatientAuth();
  const {
    refeicoesEstruturadas,
    checkinsPorRefeicao,
    trocasSelecionadas,
    progressoRefeicoes,
    recarregarDiario,
  } = useDiarioAlimentar();
  const insets = useSafeAreaInsets();

  const pacienteId = paciente?.id || "";
  const primeiroNome = formatPrimeiroNome(paciente?.socialName || paciente?.nome);
  const initialLetter = primeiroNome.charAt(0).toUpperCase();
  const avatarUrl = useMemo(
    () => resolveAssetUrl(paciente?.avatarUrl),
    [paciente?.avatarUrl]
  );

  // Estados clínicos reais sincronizados com Oracle
  const [refreshing, setRefreshing] = useState(false);
  const [objetivoClinico, setObjetivoClinico] = useState<string>(
    paciente?.treatmentObjective || paciente?.focoClinico || ""
  );
  const [medicacoes, setMedicacoes] = useState<string | null>(
    paciente?.medicacoes ?? null
  );

  // Hidratação
  const [aguaAtualMl, setAguaAtualMl] = useState<number>(0);
  const [metaAguaMl, setMetaAguaMl] = useState<number>(
    paciente?.metaDiariaMl || 2500
  );

  // Treino
  const [treinoFeito, setTreinoFeito] = useState<boolean>(false);
  const [salvandoTreino, setSalvandoTreino] = useState<boolean>(false);
  const [treinosInfo, setTreinosInfo] = useState<PacienteTreinosResponse | null>(
    null
  );

  // Check-ins 2x2: Peso, Glicemia, Intestino, Medidas
  const [pesoAtual, setPesoAtual] = useState<number | null>(null);
  const [pesoDelta, setPesoDelta] = useState<number | null>(null);
  const [pesouHoje, setPesouHoje] = useState<boolean>(false);
  const [isPesoModalOpen, setIsPesoModalOpen] = useState<boolean>(false);

  const [ultimaGlicemiaHoje, setUltimaGlicemiaHoje] =
    useState<GlicemiaHistoricoItem | null>(null);
  const [protocoloGlicemico, setProtocoloGlicemico] =
    useState<ProtocoloGlicemicoItem | null>(null);
  const [linhaMapaHoje, setLinhaMapaHoje] =
    useState<LinhaMapaGlicemicoItem | null>(null);

  // Gaveta de Registro em 3 Segundos (Glicemia + Insulina Rápida + Contexto)
  const [isGlicemiaDrawerOpen, setIsGlicemiaDrawerOpen] = useState(false);
  const [momentoDrawer, setMomentoDrawer] =
    useState<MomentoClinicoGlicemia>("JEJUM");
  const [valorGlicemiaInput, setValorGlicemiaInput] = useState("");
  const [insulinaRapidaInput, setInsulinaRapidaInput] = useState("");
  const [tagsDrawer, setTagsDrawer] = useState<string[]>([]);
  const [salvandoGlicemiaDrawer, setSalvandoGlicemiaDrawer] = useState(false);

  // Modal de 1 Toque de Insulina Basal
  const [isBasalModalOpen, setIsBasalModalOpen] = useState(false);
  const [basalUnidadesInput, setBasalUnidadesInput] = useState("");
  const [salvandoBasal, setSalvandoBasal] = useState(false);

  const [ultimoBristolHoje, setUltimoBristolHoje] =
    useState<IntestinoCheckinItem | null>(null);
  const [listaMedidas, setListaMedidas] = useState<MeasurementItem[]>([]);
  const [mediuHoje, setMediuHoje] = useState<boolean>(false);

  useEffect(() => {
    if (paciente?.treatmentObjective || paciente?.focoClinico) {
      setObjetivoClinico(
        paciente.treatmentObjective || paciente.focoClinico || ""
      );
    }
    if (paciente?.medicacoes !== undefined) {
      setMedicacoes(paciente.medicacoes);
    }
  }, [paciente?.treatmentObjective, paciente?.focoClinico, paciente?.medicacoes]);

  const carregarCockpit = useCallback(async () => {
    if (!pacienteId) return;

    const hojeBR = getHojeBR();

    const [
      metasRes,
      hidraRes,
      treinoHojeRes,
      treinosRes,
      mapaGlicRes,
      intestinoRes,
      medidasRes,
      perfilRes,
    ] = await Promise.allSettled([
      api.pacientes.getMetas(pacienteId),
      api.checkins.getHidratacaoHoje(pacienteId),
      api.checkins.getTreinoHoje(pacienteId),
      api.pacientes.getTreinos(pacienteId),
      api.pacientes.getMapaGlicemico(pacienteId, 7),
      api.checkins.getHistoricoIntestino(pacienteId, 10),
      api.pacientes.getMedidas(pacienteId),
      api.get(`/pacientes/${encodeURIComponent(pacienteId)}`),
      recarregarDiario(true),
    ]);

    if (metasRes.status === "fulfilled" && metasRes.value) {
      const m = metasRes.value;
      if (m.metas?.aguaMlAlvo > 0) {
        setMetaAguaMl(Number(m.metas.aguaMlAlvo));
      }
      if (m.metas?.treatmentObjective || m.metas?.focoMetabolico) {
        setObjetivoClinico(
          m.metas.treatmentObjective || m.metas.focoMetabolico
        );
      }
      if (m.hidratacaoHoje && typeof m.hidratacaoHoje.consumidoMl === "number") {
        setAguaAtualMl(Number(m.hidratacaoHoje.consumidoMl));
      }
      if (m.pesoEvolucao) {
        const atual = Number(m.pesoEvolucao.pesoAtualKg) || 0;
        const inicial = Number(m.pesoEvolucao.pesoInicialKg) || 0;
        setPesoAtual(atual > 0 ? atual : null);
        if (atual > 0 && inicial > 0) {
          setPesoDelta(Math.round((atual - inicial) * 10) / 10);
        } else {
          setPesoDelta(null);
        }
      }
    }

    if (hidraRes.status === "fulfilled" && hidraRes.value) {
      const h = hidraRes.value;
      const total =
        typeof h?.paciente?.totalHojeMl === "number"
          ? h.paciente.totalHojeMl
          : typeof h?.totalHojeMl === "number"
            ? h.totalHojeMl
            : null;
      if (total !== null) {
        setAguaAtualMl(total);
      }
    }

    if (treinoHojeRes.status === "fulfilled" && treinoHojeRes.value) {
      if (typeof treinoHojeRes.value.treinouHoje === "boolean") {
        setTreinoFeito(treinoHojeRes.value.treinouHoje);
      }
    }

    if (treinosRes.status === "fulfilled" && treinosRes.value?.sucesso) {
      setTreinosInfo(treinosRes.value);
    }

    if (mapaGlicRes.status === "fulfilled" && mapaGlicRes.value?.success) {
      const prot = mapaGlicRes.value.protocolo || null;
      setProtocoloGlicemico(prot);

      if (prot?.ativo) {
        const hojeIso = mapaGlicRes.value.hojeDataDia || hojeBR;
        const linhaHoje =
          (mapaGlicRes.value.linhas || []).find((l) => l.dataDia === hojeIso) ||
          null;
        setLinhaMapaHoje(linhaHoje);

        if (linhaHoje) {
          const todasCelulasHoje: CelulaMapaGlicemicoItem[] = [
            ...(Object.values(linhaHoje.celulas).filter(
              Boolean
            ) as CelulaMapaGlicemicoItem[]),
            ...(linhaHoje.avulsos || []),
          ].sort(
            (a, b) =>
              new Date(b.dataRegistro).getTime() -
              new Date(a.dataRegistro).getTime()
          );

          const maisRecente = todasCelulasHoje[0];
          if (maisRecente) {
            const classifRecente = classificarGlicemiaClinica(
              maisRecente.valor,
              maisRecente.momentoClinico,
              prot
            );
            setUltimaGlicemiaHoje({
              id: maisRecente.id,
              valor: maisRecente.valor,
              momento: classifRecente.momentoNormalizado,
              momentoClinico: classifRecente.momentoNormalizado,
              momentoLegivel: getLabelMomentoGlicemia(maisRecente.momentoClinico),
              dataRegistro: maisRecente.dataRegistro,
              isCritico: classifRecente.isForaDoAlvo,
              tipoAlerta: classifRecente.tipoAlerta,
            });
          } else {
            setUltimaGlicemiaHoje(null);
          }
        } else {
          setUltimaGlicemiaHoje(null);
        }
      } else {
        setLinhaMapaHoje(null);
        setUltimaGlicemiaHoje(null);
      }
    }

    if (intestinoRes.status === "fulfilled" && intestinoRes.value) {
      const ultimoHoje = intestinoRes.value.ultimoRegistroHoje;
      setUltimoBristolHoje(ultimoHoje || null);
    }

    if (medidasRes.status === "fulfilled" && medidasRes.value) {
      const list = Array.isArray(medidasRes.value.measurements)
        ? medidasRes.value.measurements
        : [];
      setListaMedidas(list);
      if (list.length > 0) {
        const maisRecente = [...list].sort(
          (a, b) =>
            new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
        )[0];
        setMediuHoje(
          Boolean(maisRecente) &&
            getDataBR(maisRecente.measuredAt) === hojeBR
        );
      } else {
        setMediuHoje(false);
      }
    }

    if (perfilRes.status === "fulfilled" && perfilRes.value?.paciente) {
      const p = perfilRes.value.paciente;
      if (p.treatmentObjective || p.clinicalFocus) {
        setObjetivoClinico(p.treatmentObjective || p.clinicalFocus);
      }
      if (p.medicacoes !== undefined) {
        setMedicacoes(p.medicacoes || null);
      }
    }
  }, [pacienteId, recarregarDiario]);

  useEffect(() => {
    carregarCockpit();
  }, [carregarCockpit, refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await carregarCockpit();
    } finally {
      setRefreshing(false);
    }
  }, [carregarCockpit]);

  async function handleAddAgua(ml: number) {
    if (!pacienteId) return;
    setAguaAtualMl((prev) => prev + ml);
    try {
      const json = await api.checkins.registrarHidratacao({
        pacienteId,
        volumeMl: ml,
        metaDiariaMl: metaAguaMl || 2500,
      });
      if (json && typeof json.totalHojeMl === "number") {
        setAguaAtualMl(json.totalHojeMl);
      }
    } catch {
      // Mantém atualização otimista
    }
  }

  async function handleToggleTreino() {
    if (!pacienteId || salvandoTreino) return;
    const proximoEstado = !treinoFeito;
    setTreinoFeito(proximoEstado);
    setSalvandoTreino(true);
    try {
      if (proximoEstado) {
        await api.checkins.registrarTreino(pacienteId);
      } else {
        await api.checkins.desfazerTreino(pacienteId);
      }
      const updated = await api.pacientes.getTreinos(pacienteId);
      if (updated?.sucesso) {
        setTreinosInfo(updated);
      }
    } catch {
      setTreinoFeito(!proximoEstado);
    } finally {
      setSalvandoTreino(false);
    }
  }

  const abrirGavetaGlicemia = useCallback(
    (momentoPreSelecionado?: MomentoClinicoGlicemia) => {
      const slots = protocoloGlicemico?.slotsAtivos || [];
      const momentoInicial =
        momentoPreSelecionado || sugerirMomentoPorHoraAtual(slots);
      setMomentoDrawer(momentoInicial);

      // Se já houver medição naquele slot hoje, pré-preenche para rápida atualização
      const existente =
        momentoInicial !== "AVULSO"
          ? linhaMapaHoje?.celulas?.[momentoInicial]
          : null;
      setValorGlicemiaInput(existente ? String(existente.valor) : "");
      setInsulinaRapidaInput(
        existente?.insulinaUI ? String(existente.insulinaUI) : ""
      );
      setTagsDrawer(existente?.contextoTags || []);
      setIsGlicemiaDrawerOpen(true);
    },
    [protocoloGlicemico?.slotsAtivos, linhaMapaHoje?.celulas]
  );

  const handleToggleTagDrawer = useCallback((tagId: string) => {
    setTagsDrawer((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  }, []);

  const handleSalvarGlicemiaDrawer = useCallback(async () => {
    if (!pacienteId || salvandoGlicemiaDrawer) return;
    const valorNum = parseInt(valorGlicemiaInput.replace(/\D/g, ""), 10);
    if (Number.isNaN(valorNum) || valorNum < 20 || valorNum > 600) {
      Alert.alert(
        "Valor inválido",
        "Informe um valor de glicemia entre 20 e 600 mg/dL."
      );
      return;
    }

    const rapidaNum = parseFloat(insulinaRapidaInput.replace(",", "."));
    const temRapida =
      Boolean(protocoloGlicemico?.usaInsulina) &&
      !Number.isNaN(rapidaNum) &&
      rapidaNum > 0;

    setSalvandoGlicemiaDrawer(true);
    try {
      await api.checkins.registrarGlicemia({
        pacienteId,
        valor: valorNum,
        momentoClinico: momentoDrawer,
        contextoTags: tagsDrawer,
        insulina: temRapida
          ? {
              tipo: "RAPIDA",
              unidades: Math.round(rapidaNum * 10) / 10,
              nome: protocoloGlicemico?.insulinaRapidaNome || null,
            }
          : null,
      });

      setIsGlicemiaDrawerOpen(false);
      await carregarCockpit();
    } catch (err: any) {
      Alert.alert(
        "Não foi possível salvar",
        err?.message || "Verifique sua conexão e tente novamente."
      );
    } finally {
      setSalvandoGlicemiaDrawer(false);
    }
  }, [
    pacienteId,
    salvandoGlicemiaDrawer,
    valorGlicemiaInput,
    insulinaRapidaInput,
    protocoloGlicemico,
    momentoDrawer,
    tagsDrawer,
    carregarCockpit,
  ]);

  const abrirModalBasal = useCallback(() => {
    const doseRef = protocoloGlicemico?.insulinaBasalDoseRef;
    setBasalUnidadesInput(
      doseRef !== null && doseRef !== undefined && doseRef > 0
        ? String(doseRef)
        : ""
    );
    setIsBasalModalOpen(true);
  }, [protocoloGlicemico?.insulinaBasalDoseRef]);

  const handleSalvarBasal = useCallback(async () => {
    if (!pacienteId || salvandoBasal) return;
    const unidadesNum = parseFloat(basalUnidadesInput.replace(",", "."));
    if (Number.isNaN(unidadesNum) || unidadesNum <= 0 || unidadesNum > 300) {
      Alert.alert(
        "Dose inválida",
        "Informe a dose aplicada em unidades (UI)."
      );
      return;
    }

    setSalvandoBasal(true);
    try {
      await api.checkins.registrarInsulina({
        pacienteId,
        tipo: "BASAL",
        unidades: Math.round(unidadesNum * 10) / 10,
        nome: protocoloGlicemico?.insulinaBasalNome || "Insulina Basal",
      });
      setIsBasalModalOpen(false);
      await carregarCockpit();
    } catch (err: any) {
      Alert.alert(
        "Não foi possível registrar",
        err?.message || "Tente novamente em instantes."
      );
    } finally {
      setSalvandoBasal(false);
    }
  }, [
    pacienteId,
    salvandoBasal,
    basalUnidadesInput,
    protocoloGlicemico?.insulinaBasalNome,
    carregarCockpit,
  ]);

  const objetivoConfig = useMemo(
    () => getConfigObjetivoClinico(objetivoClinico),
    [objetivoClinico]
  );

  const variacaoPesoInfo = useMemo(() => {
    if (pesoDelta === null) return null;
    return avaliarVariacaoPeso(pesoDelta, objetivoClinico);
  }, [pesoDelta, objetivoClinico]);

  const percAgua =
    metaAguaMl > 0
      ? Math.min(100, Math.round((aguaAtualMl / metaAguaMl) * 100))
      : 0;

  // Cálculo de Consistência Hoje (4 pilares: Água, Treino, Check-ins clínicos, Refeições)
  const consistencia = useMemo(() => {
    const aguaOk = metaAguaMl > 0 ? aguaAtualMl >= metaAguaMl * 0.5 : aguaAtualMl > 0;
    const aguaScore =
      metaAguaMl > 0
        ? Math.min(25, Math.round((aguaAtualMl / metaAguaMl) * 25))
        : aguaAtualMl > 0
          ? 25
          : 0;

    const treinoScore = treinoFeito ? 25 : 0;

    const temCheckinClinicoHoje =
      Boolean(ultimaGlicemiaHoje) ||
      Boolean(ultimoBristolHoje) ||
      pesouHoje ||
      mediuHoje ||
      completedCheckins.length > 0;
    const checkinScore = temCheckinClinicoHoje ? 25 : 0;

    // Pilar Refeições: SEGUI e FIZ_TROCA contam 100%; refeições opcionais não penalizam o denominador
    const refeicaoScore = Math.min(
      25,
      Math.round((progressoRefeicoes.percentualAdesao / 100) * 25)
    );
    const refeicaoOk = progressoRefeicoes.pilarAtivo;

    const totalPercent = Math.min(
      100,
      aguaScore + treinoScore + checkinScore + refeicaoScore
    );
    const pilaresAtivos = [
      aguaOk,
      treinoFeito,
      temCheckinClinicoHoje,
      refeicaoOk,
    ].filter(Boolean).length;

    return { totalPercent, pilaresAtivos };
  }, [
    aguaAtualMl,
    metaAguaMl,
    treinoFeito,
    ultimaGlicemiaHoje,
    ultimoBristolHoje,
    pesouHoje,
    mediuHoje,
    completedCheckins.length,
    progressoRefeicoes,
  ]);

  const proximaRefeicao = useMemo(
    () =>
      selecionarProximaRefeicaoHome(
        refeicoesEstruturadas,
        checkinsPorRefeicao
      ),
    [refeicoesEstruturadas, checkinsPorRefeicao]
  );

  const primeiroItemRefeicao = useMemo(() => {
    const primeiro = proximaRefeicao?.itens?.[0];
    if (!primeiro) return null;
    return getItemEfetivo(primeiro, trocasSelecionadas);
  }, [proximaRefeicao, trocasSelecionadas]);

  const previewItensRefeicao = useMemo(() => {
    if (!proximaRefeicao?.itens || proximaRefeicao.itens.length === 0) {
      return null;
    }
    return proximaRefeicao.itens
      .slice(0, 3)
      .map((item) => getItemEfetivo(item, trocasSelecionadas).nome)
      .join(" • ");
  }, [proximaRefeicao, trocasSelecionadas]);

  const statusProximaRefeicao = useMemo(() => {
    if (!proximaRefeicao) return null;
    return formatStatusRefeicaoHome(
      checkinsPorRefeicao[proximaRefeicao.id]?.status ?? null
    );
  }, [proximaRefeicao, checkinsPorRefeicao]);

  const bristolResumo = ultimoBristolHoje
    ? formatBristolResumo(ultimoBristolHoje)
    : null;
  const medidasConsolidadas = useMemo(
    () => consolidarMedidasHome(listaMedidas),
    [listaMedidas]
  );

  const headerPaddingTop = Math.max(
    insets.top + 8,
    Platform.OS === "android" ? 18 : 12
  );
  const modalBottomPadding = Math.max(insets.bottom, 24) + 16;

  // Geometria do anel minimalista de consistência (SVG)
  const ringSize = 56;
  const ringStroke = 5.5;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringDashOffset =
    ringCirc - (ringCirc * consistencia.totalPercent) / 100;

  return (
    <View style={styles.root}>
      {/* ============================================================ */}
      {/* 1. HEADER ESCURO EXECUTIVO UNIFICADO                         */}
      {/* ============================================================ */}
      <View style={[styles.darkHeader, { paddingTop: headerPaddingTop }]}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.brandKicker}>CLÍNICA FAAZ</Text>
            <Text style={styles.greetingTitle} numberOfLines={1}>
              {getSaudacao()}, {primeiroNome}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onTabPress?.("Clínica")}
            style={styles.avatarButton}
            accessibilityLabel="Abrir aba Clínica"
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarInitial}>{initialLetter}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Linha inferior do header: Objetivo real + Anel de Consistência */}
        <View style={styles.headerMetaRow}>
          <View style={styles.objectiveWrap}>
            <View style={styles.objectivePill}>
              <Target size={12} color="#2dd4bf" />
              <Text style={styles.objectivePillText} numberOfLines={1}>
                {objetivoClinico?.trim() || objetivoConfig.rotuloCurto}
              </Text>
            </View>
            <Text style={styles.consistencyCaption}>
              Consistência hoje • {consistencia.pilaresAtivos} de 4 pilares ativos
            </Text>
          </View>

          <View style={styles.ringWrapper}>
            <Svg width={ringSize} height={ringSize}>
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                stroke="rgba(255, 255, 255, 0.18)"
                strokeWidth={ringStroke}
                fill="none"
              />
              {consistencia.totalPercent > 0 ? (
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke="#2dd4bf"
                  strokeWidth={ringStroke}
                  strokeDasharray={`${ringCirc} ${ringCirc}`}
                  strokeDashoffset={ringDashOffset}
                  strokeLinecap="round"
                  fill="none"
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              ) : null}
            </Svg>
            <View style={styles.ringCenterTextWrap}>
              <Text style={styles.ringPercentText}>
                {consistencia.totalPercent}%
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ============================================================ */}
      {/* 2. CORPO DO COCKPIT DO DIA                                   */}
      {/* ============================================================ */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0f766e"
            colors={["#0f766e"]}
          />
        }
      >
        {/* CARD 1: HIDRATAÇÃO + TREINO (COMPACTOS E EQUILIBRADOS) */}
        <View style={styles.habitsCard}>
          {/* Bloco Hidratação */}
          <View style={styles.habitSection}>
            <View style={styles.habitTopRow}>
              <View style={styles.habitTitleGroup}>
                <View style={[styles.iconPill, { backgroundColor: "#f0f9ff" }]}>
                  <Droplets size={16} color="#0284c7" />
                </View>
                <View>
                  <Text style={styles.habitTitle}>Hidratação</Text>
                  <Text style={styles.habitSub}>
                    {(aguaAtualMl / 1000).toFixed(2).replace(".", ",")} L de{" "}
                    {(metaAguaMl / 1000).toFixed(1).replace(".", ",")} L
                  </Text>
                </View>
              </View>
              <View style={styles.percBadgeSky}>
                <Text style={styles.percBadgeSkyText}>{percAgua}%</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${percAgua}%`, backgroundColor: "#0284c7" },
                ]}
              />
            </View>

            <View style={styles.waterButtonsRow}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleAddAgua(250)}
                style={styles.waterBtn}
              >
                <Plus size={13} color="#0284c7" />
                <Text style={styles.waterBtnText}>250 ml</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleAddAgua(500)}
                style={[styles.waterBtn, styles.waterBtnPrimary]}
              >
                <Plus size={13} color="#ffffff" />
                <Text style={styles.waterBtnPrimaryText}>500 ml</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Bloco Treino do Dia */}
          <View style={styles.habitSection}>
            <View style={styles.habitTopRow}>
              <View style={[styles.habitTitleGroup, { flex: 1, paddingRight: 8 }]}>
                <View style={[styles.iconPill, { backgroundColor: "#f0fdfa" }]}>
                  <Dumbbell size={16} color="#0f766e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.habitTitle}>Treino do Dia</Text>
                  <Text style={styles.habitSub} numberOfLines={1}>
                    {treinosInfo?.diretrizes
                      ? `${treinosInfo.diretrizes.workoutType} • ${treinosInfo.diretrizes.workoutDuration} min • ${treinosInfo.diretrizes.workoutFrequency}x/sem`
                      : "Atividade física prescrita"}
                  </Text>
                </View>
              </View>

              {treinosInfo?.adesao ? (
                <View style={styles.adherencePill}>
                  <Text style={styles.adherencePillText}>
                    {treinosInfo.adesao.porcentagemAdesao}% (30d)
                  </Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleToggleTreino}
              disabled={salvandoTreino}
              style={[
                styles.workoutActionBtn,
                treinoFeito
                  ? styles.workoutActionDone
                  : styles.workoutActionPending,
              ]}
            >
              <CheckCircle2
                size={16}
                color={treinoFeito ? "#ffffff" : "#0f766e"}
              />
              <Text
                style={[
                  styles.workoutActionText,
                  treinoFeito
                    ? styles.workoutActionTextDone
                    : styles.workoutActionTextPending,
                ]}
              >
                {treinoFeito
                  ? "Treino concluído hoje (toque para desfazer)"
                  : "Marcar treino feito hoje"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* TRILHA DO MAPA GLICÊMICO DE HOJE (QUANDO PROTOCOLO ATIVO COM SLOTS PRESCRITOS) */}
        {protocoloGlicemico?.ativo &&
        protocoloGlicemico.modo !== "LIVRE" &&
        protocoloGlicemico.slotsAtivos.length > 0 ? (
          <View style={styles.glycemicTrailCard}>
            <View style={styles.trailHeaderRow}>
              <View style={styles.trailTitleGroup}>
                <View style={[styles.trailIconBox, { flexShrink: 0 }]}>
                  <HeartPulse size={15} color="#e11d48" />
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.trailTitle}>Mapa Glicêmico de Hoje</Text>
                  <Text style={styles.trailSubtitle}>
                    {
                      protocoloGlicemico.slotsAtivos.filter((s) =>
                        Boolean(linhaMapaHoje?.celulas?.[s])
                      ).length
                    }{" "}
                    de {protocoloGlicemico.slotsAtivos.length} horários medidos
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => abrirGavetaGlicemia("AVULSO")}
                style={styles.avulsaBtn}
              >
                <Plus size={12} color="#0f766e" />
                <Text style={styles.avulsaBtnText}>Avulsa</Text>
              </TouchableOpacity>
            </View>

            {/* Pílulas dos momentos escolhidos pela médica */}
            <View style={styles.trailPillsWrap}>
              {protocoloGlicemico.slotsAtivos.map((slot) => {
                const cel = linhaMapaHoje?.celulas?.[slot];
                const label = SLOT_LABELS[slot] || slot;

                if (cel) {
                  const classif = classificarGlicemiaClinica(
                    cel.valor,
                    cel.momentoClinico || slot,
                    protocoloGlicemico
                  );
                  return (
                    <TouchableOpacity
                      key={slot}
                      activeOpacity={0.8}
                      onPress={() => abrirGavetaGlicemia(slot)}
                      style={[
                        styles.trailSlotPillDone,
                        {
                          backgroundColor: classif.pillBg,
                          borderColor: classif.pillBorder,
                        },
                      ]}
                    >
                      {classif.isNoAlvo ? (
                        <CheckCircle2 size={13} color={classif.pillText} />
                      ) : (
                        <AlertTriangle size={13} color={classif.pillText} />
                      )}
                      <Text
                        style={[
                          styles.trailSlotDoneText,
                          { color: classif.pillText },
                        ]}
                      >
                        {label} · {cel.valor}
                      </Text>
                      {cel.insulinaUI && cel.insulinaUI > 0 ? (
                        <View
                          style={[
                            styles.trailRapidBadge,
                            classif.status === "HIPER" && {
                              backgroundColor: "rgba(255,255,255,0.22)",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.trailRapidBadgeText,
                              classif.status === "HIPER" && {
                                color: "#ffffff",
                              },
                            ]}
                          >
                            {formatUILabel(cel.insulinaUI)}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    key={slot}
                    activeOpacity={0.78}
                    onPress={() => abrirGavetaGlicemia(slot)}
                    style={styles.trailSlotPillPending}
                  >
                    <View style={styles.dashedCircleDot} />
                    <Text style={styles.trailSlotPendingText}>
                      {label} · Medir
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Pílula de Insulina Basal (SOMENTE se usaInsulina === true) */}
            {protocoloGlicemico.usaInsulina ? (
              linhaMapaHoje?.basalDoses && linhaMapaHoje.basalDoses.length > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={abrirModalBasal}
                  style={styles.basalPillDone}
                >
                  <CheckCircle2 size={14} color="#047857" />
                  <Text style={styles.basalPillDoneText} numberOfLines={1}>
                    ✓ Basal aplicada hoje:{" "}
                    {formatUILabel(linhaMapaHoje.basalDoses[0].unidades)} às{" "}
                    {linhaMapaHoje.basalDoses[0].hora}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={abrirModalBasal}
                  style={styles.basalPillPending}
                >
                  <Syringe size={14} color="#4338ca" />
                  <Text style={styles.basalPillPendingText} numberOfLines={1}>
                    Marcar Basal de hoje (
                    {protocoloGlicemico.insulinaBasalNome || "Insulina Basal"}
                    {protocoloGlicemico.insulinaBasalDoseRef
                      ? ` · ${formatUILabel(protocoloGlicemico.insulinaBasalDoseRef)}`
                      : ""}
                    )
                  </Text>
                </TouchableOpacity>
              )
            ) : null}
          </View>
        ) : null}

        {/* CARD 2: GRADE DE CHECK-INS CLÍNICOS */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Check-ins Clínicos</Text>
          <Text style={styles.sectionHint}>Toque para registrar</Text>
        </View>

        <View style={styles.checkinGrid}>
          {/* 1. PESO */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsPesoModalOpen(true)}
            style={styles.checkinTile}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconBox, { backgroundColor: "#f0fdfa" }]}>
                <Scale size={16} color="#0f766e" />
              </View>
              {variacaoPesoInfo ? (
                <View
                  style={[
                    styles.miniBadge,
                    {
                      backgroundColor: variacaoPesoInfo.corFundo,
                      borderColor: variacaoPesoInfo.corBorda,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.miniBadgeText,
                      { color: variacaoPesoInfo.corTexto },
                    ]}
                    numberOfLines={1}
                  >
                    {variacaoPesoInfo.sinalTexto}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tileLabel}>Peso</Text>
            <Text style={styles.tileValue} numberOfLines={1}>
              {pesoAtual !== null
                ? `${pesoAtual.toFixed(1).replace(".", ",")} kg`
                : "Registrar"}
            </Text>
            <Text style={styles.tileSub} numberOfLines={1}>
              {variacaoPesoInfo ? variacaoPesoInfo.rotulo : "Atualizar pesagem"}
            </Text>
          </TouchableOpacity>

          {/* 2. GLICEMIA (EXIBIDO SOMENTE QUANDO protocoloGlicemico.ativo === true) */}
          {protocoloGlicemico?.ativo
            ? (() => {
                const ultimaGlicemiaClassif = ultimaGlicemiaHoje
                  ? classificarGlicemiaClinica(
                      ultimaGlicemiaHoje.valor,
                      ultimaGlicemiaHoje.momentoClinico ??
                        ultimaGlicemiaHoje.momento,
                      protocoloGlicemico
                    )
                  : null;

                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => abrirGavetaGlicemia()}
                    style={styles.checkinTile}
                  >
                    <View style={styles.tileTopRow}>
                      <View
                        style={[
                          styles.tileIconBox,
                          { backgroundColor: "#fff1f2" },
                        ]}
                      >
                        <HeartPulse size={16} color="#e11d48" />
                      </View>
                      {ultimaGlicemiaClassif ? (
                        <View
                          style={[
                            styles.miniBadge,
                            {
                              backgroundColor: ultimaGlicemiaClassif.badgeBg,
                              borderColor: ultimaGlicemiaClassif.badgeBorder,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.miniBadgeText,
                              { color: ultimaGlicemiaClassif.badgeText },
                            ]}
                            numberOfLines={1}
                          >
                            {ultimaGlicemiaClassif.label}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.tileLabel}>Glicemia</Text>
                    <Text style={styles.tileValue} numberOfLines={1}>
                      {ultimaGlicemiaHoje
                        ? `${ultimaGlicemiaHoje.valor} mg/dL`
                        : "Registrar"}
                    </Text>
                    <Text style={styles.tileSub} numberOfLines={1}>
                      {ultimaGlicemiaHoje
                        ? `${ultimaGlicemiaHoje.momentoLegivel || getLabelMomentoGlicemia(ultimaGlicemiaHoje.momento)} • ${formatHoraLocal(ultimaGlicemiaHoje.dataRegistro)}`
                        : "Registrar agora"}
                    </Text>
                  </TouchableOpacity>
                );
              })()
            : null}

          {/* 3. INTESTINO (BRISTOL) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onNavigateToCheckin?.("bristol")}
            style={styles.checkinTile}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconBox, { backgroundColor: "#ecfdf5" }]}>
                <Activity size={16} color="#059669" />
              </View>
              {bristolResumo ? (
                <View
                  style={[
                    styles.miniBadge,
                    { backgroundColor: bristolResumo.bg, borderColor: "transparent" },
                  ]}
                >
                  <Text
                    style={[styles.miniBadgeText, { color: bristolResumo.cor }]}
                    numberOfLines={1}
                  >
                    Hoje
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tileLabel}>Intestino</Text>
            <Text style={styles.tileValue} numberOfLines={1}>
              {bristolResumo ? bristolResumo.titulo : "Registrar"}
            </Text>
            <Text style={styles.tileSub} numberOfLines={1}>
              {bristolResumo ? bristolResumo.subtitulo : "Escala de Bristol"}
            </Text>
          </TouchableOpacity>

          {/* 4. MEDIDAS (LAYOUT ADAPTATIVO: 3 COLUNAS EM LARGURA TOTAL OU COMPACTO EM 2x2) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onNavigateToCheckin?.("medidas")}
            style={[
              styles.checkinTile,
              !protocoloGlicemico?.ativo && { width: "100%" },
            ]}
          >
            {!protocoloGlicemico?.ativo ? (
              <>
                <View style={styles.medidasFullHeaderRow}>
                  <View style={styles.medidasFullHeaderLeft}>
                    <View
                      style={[
                        styles.tileIconBox,
                        { backgroundColor: "#f0f9ff" },
                      ]}
                    >
                      <Ruler size={16} color="#0284c7" />
                    </View>
                    <Text style={styles.tileLabel}>Medidas</Text>
                  </View>

                  <View style={styles.medidasFullHeaderRight}>
                    {medidasConsolidadas.dataCurta ? (
                      <Text style={styles.medidasDateText}>
                        {medidasConsolidadas.dataCurta}
                      </Text>
                    ) : null}
                    {medidasConsolidadas.temDados ? (
                      <View
                        style={[
                          styles.miniBadge,
                          {
                            backgroundColor: "#f1f5f9",
                            borderColor: "#cbd5e1",
                          },
                        ]}
                      >
                        <Text
                          style={[styles.miniBadgeText, { color: "#334155" }]}
                        >
                          Salvo
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.medidasEmptyHint}>
                        Toque para registrar
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.medidasColsRow}>
                  <View style={styles.medidaColItem}>
                    <Text style={styles.medidaColLabel}>Cintura</Text>
                    <Text style={styles.medidaColValue} numberOfLines={1}>
                      {medidasConsolidadas.waistTexto}
                    </Text>
                  </View>

                  <View style={styles.medidaColDivider} />

                  <View style={styles.medidaColItem}>
                    <Text style={styles.medidaColLabel}>Abdômen</Text>
                    <Text style={styles.medidaColValue} numberOfLines={1}>
                      {medidasConsolidadas.abdomenTexto}
                    </Text>
                  </View>

                  <View style={styles.medidaColDivider} />

                  <View style={styles.medidaColItem}>
                    <Text style={styles.medidaColLabel}>Quadril</Text>
                    <Text style={styles.medidaColValue} numberOfLines={1}>
                      {medidasConsolidadas.hipsTexto}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.tileTopRow}>
                  <View
                    style={[styles.tileIconBox, { backgroundColor: "#f0f9ff" }]}
                  >
                    <Ruler size={16} color="#0284c7" />
                  </View>
                  {medidasConsolidadas.temDados ? (
                    <View
                      style={[
                        styles.miniBadge,
                        { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" },
                      ]}
                    >
                      <Text
                        style={[styles.miniBadgeText, { color: "#334155" }]}
                      >
                        Salvo
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.tileLabel}>Medidas</Text>
                <Text
                  style={[styles.tileValue, styles.tabularValue]}
                  numberOfLines={1}
                >
                  {medidasConsolidadas.valorMeiaLargura}
                </Text>
                <Text style={styles.tileSub} numberOfLines={1}>
                  {medidasConsolidadas.subtituloMeiaLargura}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* PÍLULA DE INSULINA BASAL NO MODO LIVRE (QUANDO ATIVO + USA_INSULINA + SEM TRILHA) */}
        {protocoloGlicemico?.ativo &&
        protocoloGlicemico.usaInsulina &&
        (protocoloGlicemico.modo === "LIVRE" ||
          protocoloGlicemico.slotsAtivos.length === 0) ? (
          linhaMapaHoje?.basalDoses && linhaMapaHoje.basalDoses.length > 0 ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={abrirModalBasal}
              style={styles.basalPillDone}
            >
              <CheckCircle2 size={14} color="#047857" />
              <Text style={styles.basalPillDoneText} numberOfLines={1}>
                ✓ Basal aplicada hoje:{" "}
                {formatUILabel(linhaMapaHoje.basalDoses[0].unidades)} às{" "}
                {linhaMapaHoje.basalDoses[0].hora}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={abrirModalBasal}
              style={styles.basalPillPending}
            >
              <Syringe size={14} color="#4338ca" />
              <Text style={styles.basalPillPendingText} numberOfLines={1}>
                Marcar Basal de hoje (
                {protocoloGlicemico.insulinaBasalNome || "Insulina Basal"}
                {protocoloGlicemico.insulinaBasalDoseRef
                  ? ` · ${formatUILabel(protocoloGlicemico.insulinaBasalDoseRef)}`
                  : ""}
                )
              </Text>
            </TouchableOpacity>
          )
        ) : null}

        {/* CARD 3: ATALHO DA PRÓXIMA REFEIÇÃO */}
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() =>
            onNavigateToDieta ? onNavigateToDieta() : onTabPress?.("Dieta")
          }
          style={styles.mealShortcutCard}
        >
          <View style={styles.mealShortcutTop}>
            <View style={styles.mealBadgeRow}>
              <Utensils size={13} color="#0f766e" />
              <Text style={styles.mealBadgeText}>Próxima Refeição</Text>
              {progressoRefeicoes.obrigatoriasTotal > 0 ? (
                <Text style={styles.mealProgressMiniText}>
                  • {progressoRefeicoes.obrigatoriasConcluidas}/
                  {progressoRefeicoes.obrigatoriasTotal} hoje
                </Text>
              ) : null}
            </View>
            <View style={styles.mealLinkRow}>
              <Text style={styles.mealLinkText}>Abrir Dieta</Text>
              <ChevronRight size={14} color="#0f766e" />
            </View>
          </View>

          {proximaRefeicao ? (
            <View style={styles.mealBodyRow}>
              {primeiroItemRefeicao ? (
                <FoodThumbnail
                  nome={primeiroItemRefeicao.nome}
                  categoria={primeiroItemRefeicao.categoria}
                  imageUrl={primeiroItemRefeicao.thumbnailUrl}
                  size={46}
                  style={{ borderRadius: 10 }}
                />
              ) : (
                <View style={styles.mealFallbackIcon}>
                  <Utensils size={18} color="#0f766e" />
                </View>
              )}

              <View style={{ flex: 1 }}>
                <View style={styles.mealTitleLine}>
                  <Text style={styles.mealNameText} numberOfLines={1}>
                    {proximaRefeicao.nome}
                  </Text>
                  <View style={styles.mealMetaChipsRow}>
                    {formatHorarioCurto(proximaRefeicao.horario) ? (
                      <View style={styles.mealTimePill}>
                        <Clock size={11} color="#64748b" />
                        <Text style={styles.mealTimeText}>
                          {formatHorarioCurto(proximaRefeicao.horario)}
                        </Text>
                      </View>
                    ) : null}
                    {statusProximaRefeicao ? (
                      <View
                        style={[
                          styles.mealStatusPill,
                          {
                            backgroundColor: statusProximaRefeicao.bg,
                            borderColor: statusProximaRefeicao.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.mealStatusPillText,
                            { color: statusProximaRefeicao.color },
                          ]}
                        >
                          {statusProximaRefeicao.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.mealItemsPreview} numberOfLines={2}>
                  {previewItensRefeicao ||
                    "Toque para consultar seu plano alimentar e fazer check-in"}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.mealItemsPreview}>
              Consulte seu plano alimentar e registre o check-in das refeições de hoje.
            </Text>
          )}
        </TouchableOpacity>

        {/* CARD 4: MEDICAÇÕES EM USO (RENDERIZA SOMENTE SE PREENCHIDO) */}
        {medicacoes && medicacoes.trim().length > 0 ? (
          <View style={styles.medsCard}>
            <View style={styles.medsHeader}>
              <View style={styles.medsIconBox}>
                <Pill size={15} color="#0f766e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.medsTitle}>Medicações em Uso</Text>
                <Text style={styles.medsSubtitle}>
                  Protocolo registrado no seu prontuário
                </Text>
              </View>
            </View>
            <Text style={styles.medsBody}>{medicacoes.trim()}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* MODAL DE REGISTRO DE PESO */}
      <RegistrarPesoModal
        visible={isPesoModalOpen}
        pacienteId={pacienteId}
        pesoAtual={pesoAtual}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onClose={() => setIsPesoModalOpen(false)}
        onSuccess={(novoPeso) => {
          setPesoAtual(novoPeso);
          setPesouHoje(true);
          carregarCockpit();
        }}
      />

      {/* GAVETA DE REGISTRO DE GLICEMIA EM 3 SEGUNDOS */}
      <Modal
        visible={isGlicemiaDrawerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsGlicemiaDrawerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.drawerOverlay}
        >
          <View
            style={[
              styles.drawerSheet,
              { paddingBottom: modalBottomPadding },
            ]}
          >
            <View style={styles.drawerHandle} />

            <View style={styles.drawerHeaderRow}>
              <View style={styles.drawerTitleGroup}>
                <View style={[styles.trailIconBox, { flexShrink: 0 }]}>
                  <HeartPulse size={16} color="#e11d48" />
                </View>
                <View style={styles.drawerTitleTextCol}>
                  <Text style={styles.drawerTitle}>Registrar Glicemia</Text>
                  <Text style={styles.drawerSubtitle}>
                    {(() => {
                      const faixa = getFaixaAlvoMomento(
                        momentoDrawer,
                        protocoloGlicemico
                      );
                      return `${SLOT_LABELS[momentoDrawer] || "Medição capilar"} • Alvo ${
                        faixa.isPosPrandial
                          ? `≤${faixa.max}`
                          : `${faixa.min}–${faixa.max}`
                      } mg/dL`;
                    })()}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setIsGlicemiaDrawerOpen(false)}
                style={styles.drawerCloseBtn}
              >
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.drawerScroll}
              contentContainerStyle={styles.drawerScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {/* Seletor rápido de momento clínico */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.drawerMomentsRow}
              >
                {(
                  [
                    ...(protocoloGlicemico?.slotsAtivos &&
                    protocoloGlicemico.slotsAtivos.length > 0
                      ? protocoloGlicemico.slotsAtivos
                      : ALL_SLOTS_ORDER),
                    "AVULSO" as MomentoClinicoGlicemia,
                  ] as MomentoClinicoGlicemia[]
                ).map((m) => {
                  const isSelected = momentoDrawer === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      activeOpacity={0.8}
                      onPress={() => setMomentoDrawer(m)}
                      style={[
                        styles.drawerMomentChip,
                        isSelected && styles.drawerMomentChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.drawerMomentChipText,
                          isSelected && styles.drawerMomentChipTextActive,
                        ]}
                      >
                        {SLOT_LABELS[m]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Input numérico grande mg/dL */}
              <View style={styles.drawerNumericBox}>
                <TextInput
                  value={valorGlicemiaInput}
                  onChangeText={(txt) =>
                    setValorGlicemiaInput(txt.replace(/\D/g, "").slice(0, 3))
                  }
                  placeholder="108"
                  placeholderTextColor="#cbd5e1"
                  keyboardType="number-pad"
                  maxLength={3}
                  autoFocus
                  style={[
                    styles.drawerNumericInput,
                    Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                  ]}
                />
                <Text style={styles.drawerUnitLabel}>mg/dL</Text>
              </View>

              {/* Alerta informativo calmo quando <alvoMin ou >250 */}
              {(() => {
                const v = parseInt(valorGlicemiaInput, 10);
                const minAlvo = protocoloGlicemico?.alvoJejumMin || 70;
                if (Number.isNaN(v) || v < 20) return null;
                if (v < minAlvo) {
                  return (
                    <View style={styles.calmAlertBoxRose}>
                      <AlertTriangle size={15} color="#be123c" />
                      <Text style={styles.calmAlertTextRose}>
                        {protocoloGlicemico?.orientacaoHipo ||
                          `Glicemia abaixo de ${minAlvo} mg/dL. Siga a orientação de correção da sua médica e repita a medição em 15 minutos.`}
                      </Text>
                    </View>
                  );
                }
                if (v > 250) {
                  return (
                    <View style={styles.calmAlertBoxRose}>
                      <AlertTriangle size={15} color="#be123c" />
                      <Text style={styles.calmAlertTextRose}>
                        {protocoloGlicemico?.orientacaoHiper ||
                          "Glicemia acima de 250 mg/dL. Hidrate-se bem e siga o protocolo de correção prescrito pela sua médica."}
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}

              {/* Bloco opcional de Insulina Rápida (UI) SOMENTE se usaInsulina === true */}
              {protocoloGlicemico?.usaInsulina ? (
                <View style={styles.drawerInsulinRow}>
                  <View style={styles.drawerInsulinLabelCol}>
                    <View style={styles.drawerInsulinTitleRow}>
                      <Syringe size={14} color="#4338ca" />
                      <Text style={styles.drawerInsulinTitle}>
                        {protocoloGlicemico.insulinaRapidaNome ||
                          "Insulina Rápida"}{" "}
                        (opcional)
                      </Text>
                    </View>
                    <Text style={styles.drawerInsulinHint}>
                      Aplicou insulina rápida nesta medição?
                    </Text>
                  </View>

                  <View style={styles.drawerInsulinInputWrap}>
                    <TextInput
                      value={insulinaRapidaInput}
                      onChangeText={(txt) =>
                        setInsulinaRapidaInput(
                          txt.replace(/[^0-9.,]/g, "").slice(0, 5)
                        )
                      }
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      style={[
                        styles.drawerInsulinInput,
                        Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                      ]}
                    />
                    <Text style={styles.drawerInsulinUnit}>UI</Text>
                  </View>
                </View>
              ) : null}

              {/* 3 Chips opcionais de contexto */}
              <View style={styles.drawerTagsBlock}>
                <Text style={styles.drawerTagsLabel}>
                  Contexto opcional (toque para marcar):
                </Text>
                <View style={styles.drawerTagsRow}>
                  {CONTEXTO_CHIPS.map((chip) => {
                    const active = tagsDrawer.includes(chip.id);
                    return (
                      <TouchableOpacity
                        key={chip.id}
                        activeOpacity={0.78}
                        onPress={() => handleToggleTagDrawer(chip.id)}
                        style={[
                          styles.drawerTagChip,
                          active && styles.drawerTagChipActive,
                        ]}
                      >
                        {active ? <Check size={12} color="#0f766e" /> : null}
                        <Text
                          style={[
                            styles.drawerTagChipText,
                            active && styles.drawerTagChipTextActive,
                          ]}
                        >
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Botão Salvar */}
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={salvandoGlicemiaDrawer}
                onPress={handleSalvarGlicemiaDrawer}
                style={[
                  styles.drawerPrimaryBtn,
                  salvandoGlicemiaDrawer && { opacity: 0.65 },
                ]}
              >
                {salvandoGlicemiaDrawer ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <CheckCircle2 size={17} color="#ffffff" />
                    <Text style={styles.drawerPrimaryBtnText}>
                      Salvar Medição
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 1 TOQUE DE INSULINA BASAL */}
      <Modal
        visible={isBasalModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsBasalModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.drawerOverlay}
        >
          <View
            style={[
              styles.drawerSheet,
              { paddingBottom: modalBottomPadding },
            ]}
          >
            <View style={styles.drawerHandle} />

            <View style={styles.drawerHeaderRow}>
              <View style={styles.drawerTitleGroup}>
                <View
                  style={[
                    styles.trailIconBox,
                    {
                      backgroundColor: "#eef2ff",
                      borderColor: "#c7d2fe",
                      flexShrink: 0,
                    },
                  ]}
                >
                  <Syringe size={16} color="#4338ca" />
                </View>
                <View style={styles.drawerTitleTextCol}>
                  <Text style={styles.drawerTitle}>
                    Registrar Insulina Basal
                  </Text>
                  <Text style={styles.drawerSubtitle}>
                    {protocoloGlicemico?.insulinaBasalNome || "Insulina Basal"}
                    {protocoloGlicemico?.insulinaBasalHorario
                      ? ` • Horário: ${protocoloGlicemico.insulinaBasalHorario}`
                      : ""}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setIsBasalModalOpen(false)}
                style={styles.drawerCloseBtn}
              >
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.drawerScroll}
              contentContainerStyle={styles.drawerScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View style={styles.drawerNumericBox}>
                <TextInput
                  value={basalUnidadesInput}
                  onChangeText={(txt) =>
                    setBasalUnidadesInput(txt.replace(/[^0-9.,]/g, "").slice(0, 5))
                  }
                  placeholder={
                    protocoloGlicemico?.insulinaBasalDoseRef
                      ? String(protocoloGlicemico.insulinaBasalDoseRef)
                      : "18"
                  }
                  placeholderTextColor="#cbd5e1"
                  keyboardType="numeric"
                  autoFocus
                  style={[
                    styles.drawerNumericInput,
                    { color: "#312e81" },
                    Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                  ]}
                />
                <Text style={styles.drawerUnitLabel}>UI</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={salvandoBasal}
                onPress={handleSalvarBasal}
                style={[
                  styles.drawerPrimaryBtn,
                  { backgroundColor: "#4338ca" },
                  salvandoBasal && { opacity: 0.65 },
                ]}
              >
                {salvandoBasal ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <CheckCircle2 size={17} color="#ffffff" />
                    <Text style={styles.drawerPrimaryBtnText}>
                      Confirmar Basal de Hoje
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* BARRA INFERIOR UNIFICADA */}
      <BottomTabBar
        activeTab="Hoje"
        onTabPress={(tab) => onTabPress?.(tab)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  darkHeader: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  brandKicker: {
    color: "#2dd4bf",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
  greetingTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: -0.3,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#134e4a",
    borderWidth: 1.5,
    borderColor: "#2dd4bf",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarInitial: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.16)",
  },
  objectiveWrap: {
    flex: 1,
    paddingRight: 12,
    gap: 5,
  },
  objectivePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.28)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: "100%",
  },
  objectivePillText: {
    color: "#ccfbf1",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
  },
  consistencyCaption: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "500",
  },
  ringWrapper: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenterTextWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercentText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 28,
    gap: 14,
  },
  habitsCard: {
    marginTop: 16,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  habitSection: {
    gap: 10,
  },
  habitTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  habitTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  habitTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  habitSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },
  percBadgeSky: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  percBadgeSkyText: {
    color: "#0369a1",
    fontSize: 11,
    fontWeight: "700",
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  waterButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  waterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  waterBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0369a1",
  },
  waterBtnPrimary: {
    backgroundColor: "#0284c7",
    borderColor: "#0284c7",
  },
  waterBtnPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginVertical: 14,
  },
  adherencePill: {
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  adherencePillText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "700",
  },
  workoutActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  workoutActionPending: {
    backgroundColor: "#f0fdfa",
    borderColor: "#99f6e4",
  },
  workoutActionDone: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  workoutActionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  workoutActionTextPending: {
    color: "#0f766e",
  },
  workoutActionTextDone: {
    color: "#ffffff",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: -4,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  sectionHint: {
    fontSize: 11,
    color: "#64748b",
  },
  checkinGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  checkinTile: {
    width: "48.3%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  tileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 6,
  },
  tileIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  miniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "62%",
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tileValue: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 2,
  },
  tileSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 3,
  },
  tabularValue: {
    fontVariant: ["tabular-nums"],
  },
  medidasFullHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11,
    gap: 8,
  },
  medidasFullHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  medidasFullHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  medidasDateText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    fontVariant: ["tabular-nums"],
  },
  medidasEmptyHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0284c7",
  },
  medidasColsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  medidaColItem: {
    flex: 1,
    gap: 3,
  },
  medidaColDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#e2e8f0",
    marginHorizontal: 12,
  },
  medidaColLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  medidaColValue: {
    fontSize: 15.5,
    fontWeight: "700",
    color: "#0f172a",
    fontVariant: ["tabular-nums"],
  },
  mealShortcutCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  mealShortcutTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mealBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mealBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f766e",
  },
  mealProgressMiniText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  mealLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  mealLinkText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f766e",
  },
  mealBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mealFallbackIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  mealTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 3,
  },
  mealNameText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1,
  },
  mealMetaChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  mealTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  mealTimeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  mealStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  mealStatusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  mealItemsPreview: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },
  medsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  medsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  medsIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
  },
  medsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  medsSubtitle: {
    fontSize: 11,
    color: "#64748b",
  },
  medsBody: {
    fontSize: 12.5,
    color: "#334155",
    lineHeight: 19,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  // Trilha do Mapa Glicêmico & Insulina Basal
  glycemicTrailCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#fecdd3",
    gap: 12,
  },
  trailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trailTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  trailIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  trailTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  trailSubtitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  avulsaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexShrink: 0,
  },
  avulsaBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  trailPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  trailSlotPillPending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  dashedCircleDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
  },
  trailSlotPendingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  trailSlotPillDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  trailSlotDoneText: {
    fontSize: 12,
    fontWeight: "700",
  },
  trailRapidBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 2,
  },
  trailRapidBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3730a3",
  },
  basalPillPending: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  basalPillPendingText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3730a3",
  },
  basalPillDone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  basalPillDoneText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065f46",
  },
  // Gaveta de Registro em 3 Segundos
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  drawerSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 40,
    maxHeight: "88%",
    gap: 12,
  },
  drawerScroll: {
    flexGrow: 0,
  },
  drawerScrollContent: {
    gap: 14,
    paddingBottom: 4,
  },
  drawerHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 4,
  },
  drawerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  drawerTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  drawerTitleTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  drawerSubtitle: {
    fontSize: 11.5,
    color: "#64748b",
    marginTop: 1,
  },
  drawerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  drawerMomentsRow: {
    flexDirection: "row",
    gap: 7,
    paddingVertical: 2,
  },
  drawerMomentChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  drawerMomentChipActive: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  drawerMomentChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  drawerMomentChipTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  drawerNumericBox: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  drawerNumericInput: {
    fontSize: 40,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    minWidth: 100,
    paddingVertical: 0,
  },
  drawerUnitLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748b",
  },
  calmAlertBoxRose: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderRadius: 12,
    padding: 11,
  },
  calmAlertTextRose: {
    flex: 1,
    fontSize: 12,
    color: "#9f1239",
    lineHeight: 17,
    fontWeight: "600",
  },
  drawerInsulinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  drawerInsulinLabelCol: {
    flex: 1,
    gap: 2,
  },
  drawerInsulinTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  drawerInsulinTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#312e81",
  },
  drawerInsulinHint: {
    fontSize: 11,
    color: "#4338ca",
  },
  drawerInsulinInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#a5b4fc",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  drawerInsulinInput: {
    fontSize: 16,
    fontWeight: "800",
    color: "#312e81",
    minWidth: 38,
    textAlign: "center",
    paddingVertical: 0,
  },
  drawerInsulinUnit: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4338ca",
  },
  drawerTagsBlock: {
    gap: 7,
  },
  drawerTagsLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#64748b",
  },
  drawerTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  drawerTagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  drawerTagChipActive: {
    backgroundColor: "#f0fdfa",
    borderColor: "#0f766e",
  },
  drawerTagChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  drawerTagChipTextActive: {
    color: "#0f766e",
    fontWeight: "700",
  },
  drawerPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 2,
  },
  drawerPrimaryBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});

export default HomeScreen;
