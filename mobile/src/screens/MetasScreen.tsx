import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import Svg, { Polyline, Circle as SvgCircle } from "react-native-svg";
import {
  Scale,
  Ruler,
  HeartPulse,
  Activity,
  Dumbbell,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { StandardHeader } from "../components/StandardHeader";
import { BottomTabBar, MainTabKey } from "../components/BottomTabBar";
import { RegistrarPesoModal } from "../components/RegistrarPesoModal";
import {
  api,
  MeasurementItem,
  GlicemiaHistoricoItem,
  GlicemiaResumoPeriodo,
  IntestinoCheckinItem,
  PacienteTreinosResponse,
} from "../services/api";
import {
  getConfigObjetivoClinico,
  avaliarVariacaoPeso,
} from "../utils/objetivoClinico";

export interface MetasScreenProps {
  pacienteId?: string;
  pacienteNome?: string;
  refreshKey?: number;
  onBack?: () => void;
  onTabPress?: (tabName: MainTabKey | string) => void;
  onNavigateToCheckin?: (id: string) => void;
  onNavigateToDieta?: () => void;
}

interface PesoEvolucaoState {
  pesoInicialKg: number;
  pesoAtualKg: number;
  pesoAlvoKg: number;
  imcAtual: number;
  historico: Array<{ data: string; peso: number }>;
}

const MEDIDAS_META: Array<{
  key: keyof Pick<
    MeasurementItem,
    | "waist"
    | "abdomen"
    | "hips"
    | "bodyFatPercentage"
    | "rightArm"
    | "leftArm"
    | "rightThigh"
    | "leftThigh"
  >;
  label: string;
  unit: string;
}> = [
  { key: "waist", label: "Cintura", unit: "cm" },
  { key: "abdomen", label: "Abdômen", unit: "cm" },
  { key: "hips", label: "Quadril", unit: "cm" },
  { key: "bodyFatPercentage", label: "% Gordura", unit: "%" },
  { key: "rightArm", label: "Braço Dir.", unit: "cm" },
  { key: "leftArm", label: "Braço Esq.", unit: "cm" },
  { key: "rightThigh", label: "Coxa Dir.", unit: "cm" },
  { key: "leftThigh", label: "Coxa Esq.", unit: "cm" },
];

function formatKg(val: number): string {
  if (!val || val <= 0) return "--";
  return `${val.toFixed(1).replace(".", ",")} kg`;
}

function formatDataHoraLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} • ${hora}`;
}

function formatCategoriaBristol(cat?: string, tipo?: number): {
  label: string;
  color: string;
  bg: string;
} {
  const c = (cat || "").toLowerCase();
  if (c === "ideal" || tipo === 3 || tipo === 4) {
    return { label: "Ideal", color: "#047857", bg: "#ecfdf5" };
  }
  if (c === "constipacao" || (tipo !== undefined && tipo <= 2)) {
    return { label: "Constipação", color: "#b45309", bg: "#fffbeb" };
  }
  return { label: "Diarreia", color: "#be123c", bg: "#fff1f2" };
}

export function MetasScreen({
  pacienteId,
  refreshKey = 0,
  onTabPress,
  onNavigateToCheckin,
}: MetasScreenProps) {
  const { paciente: authPaciente } = usePatientAuth();
  const realPacienteId = pacienteId || authPaciente?.id || "";

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isPesoModalOpen, setIsPesoModalOpen] = useState(false);

  const [objetivoClinico, setObjetivoClinico] = useState<string>(
    authPaciente?.treatmentObjective || authPaciente?.focoClinico || ""
  );
  const [pesoEvolucao, setPesoEvolucao] = useState<PesoEvolucaoState>({
    pesoInicialKg: 0,
    pesoAtualKg: 0,
    pesoAlvoKg: 0,
    imcAtual: 0,
    historico: [],
  });
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [glicemiaResumo, setGlicemiaResumo] = useState<GlicemiaResumoPeriodo>({
    media: null,
    totalMedicoes: 0,
    dentroDaMeta: 0,
    alertas: 0,
  });
  const [glicemiaHistorico, setGlicemiaHistorico] = useState<
    GlicemiaHistoricoItem[]
  >([]);
  const [intestinoHistorico, setIntestinoHistorico] = useState<
    IntestinoCheckinItem[]
  >([]);
  const [treinos, setTreinos] = useState<PacienteTreinosResponse | null>(null);

  const [chartWidth, setChartWidth] = useState<number>(280);
  const inFlightRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const carregarEvolucao = useCallback(async () => {
    if (!realPacienteId) {
      setIsInitialLoading(false);
      return;
    }

    // Trava inFlight: evita disparos duplicados simultâneos ao abrir/atualizar Evolução
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;

    try {
      // Micro-onda 1 (máx. 2 chamadas simultâneas): peso/objetivo + medidas corporais
      const [metasRes, medidasRes] = await Promise.allSettled([
        api.pacientes.getMetas(realPacienteId),
        api.pacientes.getMedidas(realPacienteId),
      ]);
      if (!mountedRef.current) return;

      if (metasRes.status === "fulfilled" && metasRes.value) {
        const m = metasRes.value;
        if (m.metas?.treatmentObjective || m.metas?.focoMetabolico) {
          setObjetivoClinico(
            m.metas.treatmentObjective || m.metas.focoMetabolico
          );
        }
        if (m.pesoEvolucao) {
          setPesoEvolucao({
            pesoInicialKg: Number(m.pesoEvolucao.pesoInicialKg) || 0,
            pesoAtualKg: Number(m.pesoEvolucao.pesoAtualKg) || 0,
            pesoAlvoKg: Number(m.pesoEvolucao.pesoAlvoKg) || 0,
            imcAtual: Number(m.pesoEvolucao.imcAtual) || 0,
            historico: Array.isArray(m.pesoEvolucao.historico)
              ? m.pesoEvolucao.historico
              : [],
          });
        }
      }

      if (medidasRes.status === "fulfilled" && medidasRes.value) {
        setMeasurements(
          Array.isArray(medidasRes.value.measurements)
            ? medidasRes.value.measurements
            : []
        );
      }

      // Micro-onda 2 (máx. 2 chamadas simultâneas): glicemia + intestino (Bristol)
      const [glicemiaRes, intestinoRes] = await Promise.allSettled([
        api.checkins.getHistoricoGlicemia(realPacienteId, 30),
        api.checkins.getHistoricoIntestino(realPacienteId, 50),
      ]);
      if (!mountedRef.current) return;

      if (glicemiaRes.status === "fulfilled" && glicemiaRes.value) {
        if (glicemiaRes.value.resumo) {
          setGlicemiaResumo(glicemiaRes.value.resumo);
        }
        setGlicemiaHistorico(
          Array.isArray(glicemiaRes.value.historico)
            ? glicemiaRes.value.historico
            : []
        );
      }

      if (intestinoRes.status === "fulfilled" && intestinoRes.value) {
        const hist = Array.isArray(intestinoRes.value.historico)
          ? intestinoRes.value.historico
          : Array.isArray(intestinoRes.value.registrosHoje)
            ? intestinoRes.value.registrosHoje
            : [];
        setIntestinoHistorico(hist);
      }

      // Micro-onda 3 (1 chamada): histórico de treinos
      const [treinosRes] = await Promise.allSettled([
        api.pacientes.getTreinos(realPacienteId),
      ]);
      if (!mountedRef.current) return;

      if (treinosRes.status === "fulfilled" && treinosRes.value?.sucesso) {
        setTreinos(treinosRes.value);
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setIsInitialLoading(false);
      }
    }
  }, [realPacienteId]);

  useEffect(() => {
    carregarEvolucao();
  }, [carregarEvolucao, refreshKey]);

  const handlePullRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      await carregarEvolucao();
    } finally {
      setIsPullRefreshing(false);
    }
  }, [carregarEvolucao]);

  const objetivoConfig = useMemo(
    () => getConfigObjetivoClinico(objetivoClinico),
    [objetivoClinico]
  );

  const variacaoPeso = useMemo(() => {
    if (pesoEvolucao.pesoAtualKg <= 0 || pesoEvolucao.pesoInicialKg <= 0) {
      return null;
    }
    const delta = pesoEvolucao.pesoAtualKg - pesoEvolucao.pesoInicialKg;
    return avaliarVariacaoPeso(delta, objetivoClinico);
  }, [pesoEvolucao.pesoAtualKg, pesoEvolucao.pesoInicialKg, objetivoClinico]);

  // Pontos do mini gráfico de linha temporal de peso (SVG)
  const weightChart = useMemo(() => {
    const pts = pesoEvolucao.historico.slice(-8);
    if (pts.length < 2) return null;

    const values = pts.map((p) => p.peso);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const span = Math.max(maxVal - minVal, 1);

    const w = Math.max(chartWidth, 200);
    const h = 84;
    const padX = 14;
    const padY = 14;
    const usableW = w - padX * 2;
    const usableH = h - padY * 2;

    const coords = pts.map((p, idx) => {
      const x = padX + (idx / (pts.length - 1)) * usableW;
      const y = padY + (1 - (p.peso - minVal) / span) * usableH;
      return { x, y, data: p.data, peso: p.peso };
    });

    const polylinePoints = coords
      .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");

    return { width: w, height: h, coords, polylinePoints };
  }, [pesoEvolucao.historico, chartWidth]);

  // Comparativo de medidas (última avaliação vs. avaliação anterior por campo)
  const ultimaMedida = measurements[0] || null;
  const medidasComComparativo = useMemo(() => {
    if (!ultimaMedida) return [];
    const anteriores = measurements.slice(1);

    return MEDIDAS_META.map((meta) => {
      const atual = ultimaMedida[meta.key];
      if (atual === null || atual === undefined) return null;

      const anteriorRow = anteriores.find(
        (row) => row[meta.key] !== null && row[meta.key] !== undefined
      );
      const anteriorVal = anteriorRow ? anteriorRow[meta.key] : null;
      const delta =
        anteriorVal !== null && anteriorVal !== undefined
          ? Math.round((Number(atual) - Number(anteriorVal)) * 10) / 10
          : null;

      return {
        key: meta.key,
        label: meta.label,
        unit: meta.unit,
        atual: Number(atual),
        delta,
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [ultimaMedida, measurements]);

  // Resumo do padrão intestinal (Escala de Bristol)
  const resumoIntestino = useMemo(() => {
    let ideal = 0;
    let constipacao = 0;
    let diarreia = 0;

    for (const item of intestinoHistorico) {
      const c = (item.categoria || "").toLowerCase();
      if (c === "ideal" || item.tipoBristol === 3 || item.tipoBristol === 4) {
        ideal += 1;
      } else if (c === "constipacao" || item.tipoBristol <= 2) {
        constipacao += 1;
      } else {
        diarreia += 1;
      }
    }

    const total = intestinoHistorico.length;
    let predominante = "Sem registros";
    let cor = "#64748b";
    let bg = "#f1f5f9";

    if (total > 0) {
      if (ideal >= constipacao && ideal >= diarreia) {
        predominante = "Padrão Ideal";
        cor = "#047857";
        bg = "#ecfdf5";
      } else if (constipacao >= diarreia) {
        predominante = "Tendência a Constipação";
        cor = "#b45309";
        bg = "#fffbeb";
      } else {
        predominante = "Tendência a Diarreia";
        cor = "#be123c";
        bg = "#fff1f2";
      }
    }

    return { total, ideal, constipacao, diarreia, predominante, cor, bg };
  }, [intestinoHistorico]);

  const percGlicemiaNaMeta =
    glicemiaResumo.totalMedicoes > 0
      ? Math.round(
          (glicemiaResumo.dentroDaMeta / glicemiaResumo.totalMedicoes) * 100
        )
      : null;

  return (
    <View style={styles.root}>
      {/* HEADER ESCURO EXECUTIVO (SEM VOLTAR) */}
      <StandardHeader
        title="Evolução"
        subtitle="Espelho vivo do seu prontuário"
        rightElement={
          <View style={styles.headerObjetivoPill}>
            <Text style={styles.headerObjetivoText}>
              {objetivoConfig.rotuloCurto}
            </Text>
          </View>
        }
      />

      {isInitialLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.loadingText}>Sincronizando sua evolução...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={handlePullRefresh}
              progressViewOffset={12}
              tintColor="#0f766e"
              colors={["#0f766e"]}
            />
          }
        >
          {/* ====================================================== */}
          {/* BLOCO 1: RESUMO DE PESO (ORIENTADO AO OBJETIVO)        */}
          {/* ====================================================== */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.iconBox, { backgroundColor: "#f0fdfa" }]}>
                  <Scale size={16} color="#0f766e" />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Evolução de Peso</Text>
                  <Text style={styles.cardSubtitle}>
                    {objetivoClinico?.trim() || objetivoConfig.rotuloCurto}
                  </Text>
                </View>
              </View>

              {variacaoPeso ? (
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: variacaoPeso.corFundo,
                      borderColor: variacaoPeso.corBorda,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: variacaoPeso.corTexto },
                    ]}
                  >
                    {variacaoPeso.sinalTexto}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Métricas limpas sem truncamento */}
            <View style={styles.weightMetricsGrid}>
              <View style={styles.weightMetricCell}>
                <Text style={styles.metricLabel}>Inicial</Text>
                <Text style={styles.metricValue}>
                  {formatKg(pesoEvolucao.pesoInicialKg)}
                </Text>
              </View>
              <View style={[styles.weightMetricCell, styles.weightMetricHighlight]}>
                <Text style={styles.metricLabelHighlight}>Atual</Text>
                <Text style={styles.metricValueHighlight}>
                  {formatKg(pesoEvolucao.pesoAtualKg)}
                </Text>
              </View>
              <View style={styles.weightMetricCell}>
                <Text style={styles.metricLabel}>Meta</Text>
                <Text style={styles.metricValue}>
                  {pesoEvolucao.pesoAlvoKg > 0
                    ? formatKg(pesoEvolucao.pesoAlvoKg)
                    : "A definir"}
                </Text>
              </View>
            </View>

            {pesoEvolucao.imcAtual > 0 ? (
              <View style={styles.imcRow}>
                <Text style={styles.imcLabel}>IMC atual</Text>
                <Text style={styles.imcValue}>
                  {pesoEvolucao.imcAtual.toFixed(1).replace(".", ",")} kg/m²
                </Text>
              </View>
            ) : null}

            {/* Gráfico de linha temporal */}
            {weightChart ? (
              <View
                style={styles.chartContainer}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width - 16);
                  if (w > 120 && Math.abs(w - chartWidth) > 4) {
                    setChartWidth(w);
                  }
                }}
              >
                <Svg width={weightChart.width} height={weightChart.height}>
                  <Polyline
                    points={weightChart.polylinePoints}
                    fill="none"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {weightChart.coords.map((c, idx) => (
                    <SvgCircle
                      key={idx}
                      cx={c.x}
                      cy={c.y}
                      r={idx === weightChart.coords.length - 1 ? 4.5 : 3}
                      fill={
                        idx === weightChart.coords.length - 1
                          ? "#0f766e"
                          : "#ffffff"
                      }
                      stroke="#0f766e"
                      strokeWidth={2}
                    />
                  ))}
                </Svg>
                <View style={styles.chartLabelsRow}>
                  <Text style={styles.chartAxisText}>
                    {weightChart.coords[0].data} (
                    {weightChart.coords[0].peso.toFixed(1).replace(".", ",")} kg)
                  </Text>
                  <Text style={styles.chartAxisTextBold}>
                    {weightChart.coords[weightChart.coords.length - 1].data} (
                    {weightChart.coords[weightChart.coords.length - 1].peso
                      .toFixed(1)
                      .replace(".", ",")}{" "}
                    kg)
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.clinicalNote}>{objetivoConfig.mensagemPeso}</Text>

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setIsPesoModalOpen(true)}
              style={styles.primaryActionBtn}
            >
              <Scale size={15} color="#ffffff" />
              <Text style={styles.primaryActionBtnText}>Atualizar Peso</Text>
            </TouchableOpacity>
          </View>

          {/* ====================================================== */}
          {/* BLOCO 2: MEDIDAS & COMPOSIÇÃO CORPORAL                 */}
          {/* ====================================================== */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.iconBox, { backgroundColor: "#f0f9ff" }]}>
                  <Ruler size={16} color="#0284c7" />
                </View>
                <View>
                  <Text style={styles.cardTitle}>
                    Medidas & Composição Corporal
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {ultimaMedida
                      ? `Última aferição em ${new Date(
                          ultimaMedida.measuredAt
                        ).toLocaleDateString("pt-BR")}`
                      : "Nenhuma aferição registrada"}
                  </Text>
                </View>
              </View>

              {measurements.length > 0 ? (
                <View style={styles.neutralPill}>
                  <Text style={styles.neutralPillText}>
                    {measurements.length}{" "}
                    {measurements.length === 1 ? "reg." : "regs."}
                  </Text>
                </View>
              ) : null}
            </View>

            {medidasComComparativo.length > 0 ? (
              <View style={styles.measureGrid}>
                {medidasComComparativo.map((item) => (
                  <View key={item.key} style={styles.measureTile}>
                    <Text style={styles.measureLabel}>{item.label}</Text>
                    <Text style={styles.measureVal}>
                      {item.atual.toFixed(1).replace(".", ",")} {item.unit}
                    </Text>
                    {item.delta !== null ? (
                      <Text
                        style={[
                          styles.measureDelta,
                          {
                            color:
                              Math.abs(item.delta) < 0.05
                                ? "#64748b"
                                : "#0f766e",
                          },
                        ]}
                      >
                        {item.delta > 0 ? "+" : ""}
                        {item.delta.toFixed(1).replace(".", ",")} {item.unit} vs.
                        ant.
                      </Text>
                    ) : (
                      <Text style={styles.measureDeltaMuted}>1º registro</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Registre cintura, abdômen, quadril, membros ou % de gordura
                  para acompanhar a evolução ao longo das consultas.
                </Text>
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onNavigateToCheckin?.("medidas")}
              style={styles.secondaryActionBtn}
            >
              <Plus size={15} color="#0f766e" />
              <Text style={styles.secondaryActionBtnText}>
                Registrar Medidas
              </Text>
            </TouchableOpacity>
          </View>

          {/* ====================================================== */}
          {/* BLOCO 3: GLICEMIA — ÚLTIMOS 30 DIAS                    */}
          {/* ====================================================== */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.iconBox, { backgroundColor: "#fff1f2" }]}>
                  <HeartPulse size={16} color="#e11d48" />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Glicemia — 30 dias</Text>
                  <Text style={styles.cardSubtitle}>
                    Faixa alvo clínica: 70 a 180 mg/dL
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => onNavigateToCheckin?.("glicemia")}
                style={styles.inlineAddBtn}
              >
                <Plus size={13} color="#0f766e" />
                <Text style={styles.inlineAddBtnText}>Registrar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.kpiRow4}>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Média</Text>
                <Text style={styles.kpiValue}>
                  {glicemiaResumo.media !== null
                    ? `${glicemiaResumo.media}`
                    : "--"}
                </Text>
                <Text style={styles.kpiUnit}>mg/dL</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Medições</Text>
                <Text style={styles.kpiValue}>
                  {glicemiaResumo.totalMedicoes}
                </Text>
                <Text style={styles.kpiUnit}>no período</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Na Meta</Text>
                <Text style={[styles.kpiValue, { color: "#047857" }]}>
                  {percGlicemiaNaMeta !== null ? `${percGlicemiaNaMeta}%` : "--"}
                </Text>
                <Text style={styles.kpiUnit}>
                  {glicemiaResumo.dentroDaMeta} ok
                </Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Alertas</Text>
                <Text
                  style={[
                    styles.kpiValue,
                    glicemiaResumo.alertas > 0 && { color: "#be123c" },
                  ]}
                >
                  {glicemiaResumo.alertas}
                </Text>
                <Text style={styles.kpiUnit}>fora faixa</Text>
              </View>
            </View>

            {glicemiaHistorico.length > 0 ? (
              <View style={styles.listContainer}>
                {glicemiaHistorico.slice(0, 8).map((item) => (
                  <View key={item.id} style={styles.listRow}>
                    <View style={styles.listLeft}>
                      <View
                        style={[
                          styles.dotIndicator,
                          {
                            backgroundColor: item.isCritico
                              ? "#e11d48"
                              : "#059669",
                          },
                        ]}
                      />
                      <View>
                        <Text style={styles.listMainText}>
                          {item.valor} mg/dL{" "}
                          <Text style={styles.listSubInline}>
                            • {item.momentoLegivel || item.momento}
                          </Text>
                        </Text>
                        <Text style={styles.listDateText}>
                          {formatDataHoraLocal(item.dataRegistro)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.tinyStatusPill,
                        item.isCritico
                          ? { backgroundColor: "#fff1f2" }
                          : { backgroundColor: "#ecfdf5" },
                      ]}
                    >
                      {item.isCritico ? (
                        <AlertTriangle size={11} color="#be123c" />
                      ) : (
                        <CheckCircle2 size={11} color="#047857" />
                      )}
                      <Text
                        style={[
                          styles.tinyStatusText,
                          { color: item.isCritico ? "#be123c" : "#047857" },
                        ]}
                      >
                        {item.isCritico ? "Alerta" : "Normal"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Nenhuma medição de glicemia registrada nos últimos 30 dias.
                </Text>
              </View>
            )}
          </View>

          {/* ====================================================== */}
          {/* BLOCO 4: PADRÃO INTESTINAL — ESCALA DE BRISTOL         */}
          {/* ====================================================== */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.iconBox, { backgroundColor: "#ecfdf5" }]}>
                  <Activity size={16} color="#059669" />
                </View>
                <View>
                  <Text style={styles.cardTitle}>
                    Padrão Intestinal — Bristol
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {resumoIntestino.total}{" "}
                    {resumoIntestino.total === 1
                      ? "registro recente"
                      : "registros recentes"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => onNavigateToCheckin?.("bristol")}
                style={styles.inlineAddBtn}
              >
                <Plus size={13} color="#0f766e" />
                <Text style={styles.inlineAddBtnText}>Registrar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bristolSummaryBar}>
              <View
                style={[
                  styles.predominantPill,
                  { backgroundColor: resumoIntestino.bg },
                ]}
              >
                <Text
                  style={[
                    styles.predominantText,
                    { color: resumoIntestino.cor },
                  ]}
                >
                  {resumoIntestino.predominante}
                </Text>
              </View>
              <View style={styles.bristolCountsRow}>
                <Text style={styles.bristolCountItem}>
                  Ideal: <Text style={styles.boldText}>{resumoIntestino.ideal}</Text>
                </Text>
                <Text style={styles.bristolCountItem}>
                  Constip.:{" "}
                  <Text style={styles.boldText}>
                    {resumoIntestino.constipacao}
                  </Text>
                </Text>
                <Text style={styles.bristolCountItem}>
                  Diarreia:{" "}
                  <Text style={styles.boldText}>{resumoIntestino.diarreia}</Text>
                </Text>
              </View>
            </View>

            {intestinoHistorico.length > 0 ? (
              <View style={styles.listContainer}>
                {intestinoHistorico.slice(0, 6).map((item) => {
                  const catInfo = formatCategoriaBristol(
                    item.categoria,
                    item.tipoBristol
                  );
                  const sintomasTxt =
                    Array.isArray(item.sintomas) && item.sintomas.length > 0
                      ? item.sintomas.join(", ")
                      : "Sem sintomas relatados";

                  return (
                    <View key={item.id} style={styles.listRow}>
                      <View style={styles.listLeft}>
                        <View
                          style={[
                            styles.bristolTypeBadge,
                            { backgroundColor: catInfo.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.bristolTypeText,
                              { color: catInfo.color },
                            ]}
                          >
                            T{item.tipoBristol}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.listMainText}>
                            Tipo {item.tipoBristol} • {catInfo.label}
                          </Text>
                          <Text style={styles.listDateText} numberOfLines={1}>
                            {formatDataHoraLocal(item.data)} • {sintomasTxt}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Nenhum check-in intestinal registrado ainda.
                </Text>
              </View>
            )}
          </View>

          {/* ====================================================== */}
          {/* BLOCO 5: ADESÃO AOS TREINOS — 30 DIAS                  */}
          {/* ====================================================== */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.iconBox, { backgroundColor: "#f0fdfa" }]}>
                  <Dumbbell size={16} color="#0f766e" />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Adesão aos Treinos — 30d</Text>
                  <Text style={styles.cardSubtitle}>
                    Diretrizes de atividade física
                  </Text>
                </View>
              </View>

              <View style={styles.adherenceBadge}>
                <Text style={styles.adherenceBadgeText}>
                  {treinos?.adesao?.porcentagemAdesao ?? 0}%
                </Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${treinos?.adesao?.porcentagemAdesao ?? 0}%`,
                    backgroundColor: "#0f766e",
                  },
                ]}
              />
            </View>

            <View style={styles.workoutStatsRow}>
              <View style={styles.workoutStatItem}>
                <Calendar size={13} color="#0f766e" />
                <Text style={styles.workoutStatText}>
                  <Text style={styles.boldText}>
                    {treinos?.adesao?.diasAtivosUltimos30Dias ?? 0}
                  </Text>{" "}
                  de{" "}
                  <Text style={styles.boldText}>
                    {treinos?.adesao?.metaEsperada30Dias ?? 13}
                  </Text>{" "}
                  dias esperados
                </Text>
              </View>
            </View>

            {treinos?.diretrizes ? (
              <View style={styles.directivesBox}>
                <View style={styles.directiveRow}>
                  <Text style={styles.directiveLabel}>Modalidade</Text>
                  <Text style={styles.directiveValue}>
                    {treinos.diretrizes.workoutType}
                  </Text>
                </View>
                <View style={styles.directiveRow}>
                  <Text style={styles.directiveLabel}>Frequência</Text>
                  <Text style={styles.directiveValue}>
                    {treinos.diretrizes.workoutFrequency}x por semana
                  </Text>
                </View>
                <View
                  style={[
                    styles.directiveRow,
                    !treinos.diretrizes.workoutRestrictions && {
                      borderBottomWidth: 0,
                    },
                  ]}
                >
                  <Text style={styles.directiveLabel}>Duração</Text>
                  <View style={styles.inlineIconVal}>
                    <Clock size={12} color="#475569" />
                    <Text style={styles.directiveValue}>
                      {treinos.diretrizes.workoutDuration} min / sessão
                    </Text>
                  </View>
                </View>
                {treinos.diretrizes.workoutRestrictions ? (
                  <View style={styles.restrictionsWrap}>
                    <Text style={styles.restrictionsTitle}>
                      Orientações & Restrições Médicas
                    </Text>
                    <Text style={styles.restrictionsText}>
                      {treinos.diretrizes.workoutRestrictions}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.clinicalNote}>
              {objetivoConfig.mensagemTreino}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* MODAL DE REGISTRO DE PESO */}
      <RegistrarPesoModal
        visible={isPesoModalOpen}
        pacienteId={realPacienteId}
        pesoAtual={pesoEvolucao.pesoAtualKg || null}
        onClose={() => setIsPesoModalOpen(false)}
        onSuccess={() => {
          carregarEvolucao();
        }}
      />

      {/* BARRA INFERIOR UNIFICADA */}
      <BottomTabBar
        activeTab="Evolução"
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
  headerObjetivoPill: {
    backgroundColor: "rgba(45, 212, 191, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headerObjetivoText: {
    color: "#2dd4bf",
    fontSize: 11,
    fontWeight: "600",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  neutralPill: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  neutralPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  weightMetricsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  weightMetricCell: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  weightMetricHighlight: {
    backgroundColor: "#f0fdfa",
    borderColor: "#99f6e4",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 3,
  },
  metricLabelHighlight: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  metricValueHighlight: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f766e",
    marginTop: 3,
  },
  imcRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imcLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748b",
  },
  imcValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  chartContainer: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  chartLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginTop: 2,
  },
  chartAxisText: {
    fontSize: 11,
    color: "#64748b",
  },
  chartAxisTextBold: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  clinicalNote: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 18,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryActionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingVertical: 11,
    borderRadius: 12,
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f766e",
  },
  measureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  measureTile: {
    width: "48.4%",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  measureLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  measureVal: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 2,
  },
  measureDelta: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },
  measureDeltaMuted: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 3,
  },
  inlineAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  inlineAddBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
  },
  kpiRow4: {
    flexDirection: "row",
    gap: 6,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 2,
  },
  kpiUnit: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 1,
  },
  listContainer: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 6,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
    gap: 8,
  },
  listLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  dotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listMainText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  listSubInline: {
    fontWeight: "500",
    color: "#475569",
  },
  listDateText: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  tinyStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tinyStatusText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  bristolSummaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  predominantPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  predominantText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  bristolCountsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bristolCountItem: {
    fontSize: 11.5,
    color: "#64748b",
  },
  boldText: {
    fontWeight: "700",
    color: "#0f172a",
  },
  bristolTypeBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  bristolTypeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  adherenceBadge: {
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#99f6e4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  adherenceBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f766e",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  workoutStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  workoutStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  workoutStatText: {
    fontSize: 12.5,
    color: "#475569",
  },
  directivesBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  directiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  directiveLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  directiveValue: {
    fontSize: 12.5,
    color: "#0f172a",
    fontWeight: "700",
  },
  inlineIconVal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  restrictionsWrap: {
    paddingVertical: 8,
    gap: 3,
  },
  restrictionsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0f766e",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  restrictionsText: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 17,
  },
  emptyBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  emptyText: {
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 18,
    textAlign: "center",
  },
});

export default MetasScreen;
