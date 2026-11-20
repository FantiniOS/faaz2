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
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { useDiarioAlimentar } from "../contexts/DiarioAlimentarContext";
import { FoodThumbnail } from "../components/FoodThumbnail";
import { BottomTabBar, MainTabKey } from "../components/BottomTabBar";
import { RegistrarPesoModal } from "../components/RegistrarPesoModal";
import {
  api,
  CheckinRefeicaoStatus,
  MeasurementItem,
  PacienteTreinosResponse,
  GlicemiaHistoricoItem,
  IntestinoCheckinItem,
  resolveAssetUrl,
} from "../services/api";
import {
  getConfigObjetivoClinico,
  avaliarVariacaoPeso,
} from "../utils/objetivoClinico";
import {
  formatHorarioCurto,
  getItemEfetivo,
  selecionarProximaRefeicaoHome,
} from "../utils/dietaHelpers";

export interface HomeScreenProps {
  completedCheckins?: string[];
  refreshKey?: number;
  onNavigateToCheckin?: (id: string) => void;
  onTabPress?: (tabName: MainTabKey | string) => void;
  onNavigateToDieta?: () => void;
  onNavigateToMetas?: () => void;
}

function getSaudacao(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function formatPrimeiroNome(nomeCompleto?: string | null): string {
  if (!nomeCompleto || !nomeCompleto.trim()) return "Paciente";
  const first = nomeCompleto.trim().split(/\s+/)[0] || "Paciente";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function formatHoraLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

function formatMedidaResumo(m: MeasurementItem | null): {
  valor: string;
  subtitulo: string;
} {
  if (!m) {
    return { valor: "Registrar", subtitulo: "Cintura, abdômen e mais" };
  }
  const dataCurta = new Date(m.measuredAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  if (m.waist !== null && m.waist !== undefined) {
    return {
      valor: `${Number(m.waist).toFixed(1).replace(".", ",")} cm`,
      subtitulo: `Cintura • ${dataCurta}`,
    };
  }
  if (m.abdomen !== null && m.abdomen !== undefined) {
    return {
      valor: `${Number(m.abdomen).toFixed(1).replace(".", ",")} cm`,
      subtitulo: `Abdômen • ${dataCurta}`,
    };
  }
  if (m.bodyFatPercentage !== null && m.bodyFatPercentage !== undefined) {
    return {
      valor: `${Number(m.bodyFatPercentage).toFixed(1).replace(".", ",")}%`,
      subtitulo: `Gordura • ${dataCurta}`,
    };
  }
  if (m.hips !== null && m.hips !== undefined) {
    return {
      valor: `${Number(m.hips).toFixed(1).replace(".", ",")} cm`,
      subtitulo: `Quadril • ${dataCurta}`,
    };
  }
  return { valor: "Registrado", subtitulo: `Em ${dataCurta}` };
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
  const [ultimoBristolHoje, setUltimoBristolHoje] =
    useState<IntestinoCheckinItem | null>(null);
  const [ultimaMedida, setUltimaMedida] = useState<MeasurementItem | null>(null);
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

    const hojeStr = new Date().toDateString();

    const [
      metasRes,
      hidraRes,
      treinoHojeRes,
      treinosRes,
      glicemiaRes,
      intestinoRes,
      medidasRes,
      perfilRes,
    ] = await Promise.allSettled([
      api.pacientes.getMetas(pacienteId),
      api.checkins.getHidratacaoHoje(pacienteId),
      api.checkins.getTreinoHoje(pacienteId),
      api.pacientes.getTreinos(pacienteId),
      api.checkins.getHistoricoGlicemia(pacienteId, 7),
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

    if (glicemiaRes.status === "fulfilled" && glicemiaRes.value) {
      const regsHoje = glicemiaRes.value.registrosHoje;
      if (Array.isArray(regsHoje) && regsHoje.length > 0) {
        setUltimaGlicemiaHoje(regsHoje[0]);
      } else {
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
      if (list.length > 0) {
        setUltimaMedida(list[0]);
        setMediuHoje(new Date(list[0].measuredAt).toDateString() === hojeStr);
      } else {
        setUltimaMedida(null);
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
  const medidaResumo = formatMedidaResumo(ultimaMedida);

  const headerPaddingTop = Math.max(
    insets.top + 8,
    Platform.OS === "android" ? 18 : 12
  );

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

        {/* CARD 2: GRADE 2x2 DE CHECK-INS CLÍNICOS (SEMPRE VISÍVEL) */}
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

          {/* 2. GLICEMIA */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onNavigateToCheckin?.("glicemia")}
            style={styles.checkinTile}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconBox, { backgroundColor: "#fff1f2" }]}>
                <HeartPulse size={16} color="#e11d48" />
              </View>
              {ultimaGlicemiaHoje ? (
                <View
                  style={[
                    styles.miniBadge,
                    ultimaGlicemiaHoje.isCritico
                      ? { backgroundColor: "#fff1f2", borderColor: "#fecdd3" }
                      : { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
                  ]}
                >
                  <Text
                    style={[
                      styles.miniBadgeText,
                      {
                        color: ultimaGlicemiaHoje.isCritico
                          ? "#be123c"
                          : "#047857",
                      },
                    ]}
                  >
                    {ultimaGlicemiaHoje.isCritico ? "Alerta" : "Na meta"}
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
                ? `${ultimaGlicemiaHoje.momentoLegivel || ultimaGlicemiaHoje.momento} • ${formatHoraLocal(ultimaGlicemiaHoje.dataRegistro)}`
                : "Registrar agora"}
            </Text>
          </TouchableOpacity>

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

          {/* 4. MEDIDAS */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onNavigateToCheckin?.("medidas")}
            style={styles.checkinTile}
          >
            <View style={styles.tileTopRow}>
              <View style={[styles.tileIconBox, { backgroundColor: "#f0f9ff" }]}>
                <Ruler size={16} color="#0284c7" />
              </View>
              {ultimaMedida ? (
                <View
                  style={[
                    styles.miniBadge,
                    { backgroundColor: "#f1f5f9", borderColor: "#cbd5e1" },
                  ]}
                >
                  <Text style={[styles.miniBadgeText, { color: "#334155" }]}>
                    Salvo
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tileLabel}>Medidas</Text>
            <Text style={styles.tileValue} numberOfLines={1}>
              {medidaResumo.valor}
            </Text>
            <Text style={styles.tileSub} numberOfLines={1}>
              {medidaResumo.subtitulo}
            </Text>
          </TouchableOpacity>
        </View>

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
        onClose={() => setIsPesoModalOpen(false)}
        onSuccess={(novoPeso) => {
          setPesoAtual(novoPeso);
          setPesouHoje(true);
          carregarCockpit();
        }}
      />

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
});

export default HomeScreen;
