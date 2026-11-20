"use client";

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  HeartPulse,
  Info,
  Loader2,
  Save,
  Settings2,
  Syringe,
  Table2,
  X,
} from "lucide-react";
import AuthContext, { type UsuarioLogado } from "@/contexts/AuthContext";
import { formatarDataBR } from "@/lib/date-br";
import {
  formatarNomeArquivoMapaGlicemico,
  getClinicaLogoUrl,
  resolveDoctorProfile,
} from "@/lib/pdf-clinica-template";
import {
  classificarGlicemiaMapa,
  detectarModoPorSlots,
  formatarUI,
  formatContextoTagLabel,
  PROTOCOLO_PRESETS,
  resumirEtiquetaProtocolo,
  SLOTS_MAPA_ORDER,
  SLOT_META,
  SUGESTOES_INSULINA_BASAL,
  SUGESTOES_INSULINA_RAPIDA,
  type CelulaMapaGlicemicoDTO,
  type MapaGlicemicoResponseDTO,
  type ModoProtocoloGlicemico,
  type ProtocoloGlicemicoDTO,
  type SlotMapaGlicemico,
  type StatusCelulaGlicemia,
} from "@/lib/mapa-glicemico";

export type SubAbaMapaGlicemico = "grade" | "protocolo";

export interface MapaGlicemicoModalProps {
  isOpen: boolean;
  onClose: () => void;
  pacienteId: string;
  pacienteNome: string;
  pacienteRecordCode?: string | null;
  initialTab?: SubAbaMapaGlicemico;
  protocoloAtual: ProtocoloGlicemicoDTO;
  onProtocoloChange: (novoProtocolo: ProtocoloGlicemicoDTO) => void;
}

function getCellBadgeClasses(status: StatusCelulaGlicemia): string {
  switch (status) {
    case "HIPO":
      return "bg-rose-100 text-rose-800 border-rose-300";
    case "ALVO":
      return "bg-emerald-50 text-emerald-800 border-emerald-200/90";
    case "ATENCAO":
      return "bg-amber-50 text-amber-800 border-amber-200/90";
    case "HIPER":
      return "bg-rose-600 text-white border-rose-700 shadow-2xs";
  }
}

function getStatusShortLabel(status: StatusCelulaGlicemia): string {
  switch (status) {
    case "HIPO":
      return "Hipo";
    case "ALVO":
      return "No alvo";
    case "ATENCAO":
      return "Atenção";
    case "HIPER":
      return "Hiper (>250)";
  }
}

function buildCellTooltip(
  slotLabel: string,
  cel: CelulaMapaGlicemicoDTO,
): string {
  const linhas = [
    `${slotLabel}: ${cel.valor} mg/dL (${getStatusShortLabel(cel.status)})`,
    `Horário (Brasília): ${cel.hora}`,
  ];
  if (cel.insulinaUI && cel.insulinaUI > 0) {
    linhas.push(
      `Insulina Rápida: ${formatarUI(cel.insulinaUI)}${
        cel.insulinaNome ? ` (${cel.insulinaNome})` : ""
      }`,
    );
  }
  if (cel.contextoTags.length > 0) {
    linhas.push(
      `Contexto: ${cel.contextoTags.map(formatContextoTagLabel).join(", ")}`,
    );
  }
  return linhas.join("\n");
}

export function MapaGlicemicoModal({
  isOpen,
  onClose,
  pacienteId,
  pacienteNome,
  pacienteRecordCode,
  initialTab = "grade",
  protocoloAtual,
  onProtocoloChange,
}: MapaGlicemicoModalProps) {
  const authContext = useContext(AuthContext);
  const [fetchedSessionUser, setFetchedSessionUser] =
    useState<UsuarioLogado | null>(null);

  useEffect(() => {
    if (!isOpen || authContext?.usuario) return;
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.autenticado && data?.usuario) {
          setFetchedSessionUser(data.usuario as UsuarioLogado);
        }
      })
      .catch(() => {
        // Fallback institucional limpo caso a sessão não esteja disponível
      });
    return () => {
      active = false;
    };
  }, [isOpen, authContext?.usuario]);

  const usuario = authContext?.usuario ?? fetchedSessionUser;

  const [subAba, setSubAba] = useState<SubAbaMapaGlicemico>(initialTab);
  const [dias, setDias] = useState<7 | 14 | 30>(14);
  const [mapaData, setMapaData] = useState<MapaGlicemicoResponseDTO | null>(null);
  const [carregandoMapa, setCarregandoMapa] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [salvandoProtocolo, setSalvandoProtocolo] = useState(false);
  const [salvandoSwitchRapido, setSalvandoSwitchRapido] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Estado local do formulário na aba "Protocolo & Insulina"
  const [ativo, setAtivo] = useState<boolean>(protocoloAtual.ativo);
  const [usaInsulina, setUsaInsulina] = useState<boolean>(
    protocoloAtual.usaInsulina,
  );
  const [modo, setModo] = useState<ModoProtocoloGlicemico>(protocoloAtual.modo);
  const [slotsAtivos, setSlotsAtivos] = useState<SlotMapaGlicemico[]>(
    protocoloAtual.slotsAtivos,
  );
  const [alvoJejumMin, setAlvoJejumMin] = useState<string>(
    String(protocoloAtual.alvoJejumMin || 70),
  );
  const [alvoJejumMax, setAlvoJejumMax] = useState<string>(
    String(protocoloAtual.alvoJejumMax || 130),
  );
  const [alvoPosMax, setAlvoPosMax] = useState<string>(
    String(protocoloAtual.alvoPosMax || 180),
  );
  const [insulinaBasalNome, setInsulinaBasalNome] = useState<string>(
    protocoloAtual.insulinaBasalNome || "",
  );
  const [insulinaBasalDoseRef, setInsulinaBasalDoseRef] = useState<string>(
    protocoloAtual.insulinaBasalDoseRef !== null &&
      protocoloAtual.insulinaBasalDoseRef !== undefined
      ? String(protocoloAtual.insulinaBasalDoseRef)
      : "",
  );
  const [insulinaBasalHorario, setInsulinaBasalHorario] = useState<string>(
    protocoloAtual.insulinaBasalHorario || "",
  );
  const [insulinaRapidaNome, setInsulinaRapidaNome] = useState<string>(
    protocoloAtual.insulinaRapidaNome || "",
  );
  const [orientacaoHipo, setOrientacaoHipo] = useState<string>(
    protocoloAtual.orientacaoHipo || "",
  );
  const [orientacaoHiper, setOrientacaoHiper] = useState<string>(
    protocoloAtual.orientacaoHiper || "",
  );

  // Sincroniza aba inicial e campos do protocolo ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) setSubAba(initialTab);
    });
    return () => {
      mounted = false;
    };
  }, [isOpen, initialTab]);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      setAtivo(protocoloAtual.ativo);
      setUsaInsulina(protocoloAtual.usaInsulina);
      setModo(protocoloAtual.modo);
      setSlotsAtivos(protocoloAtual.slotsAtivos);
      setAlvoJejumMin(String(protocoloAtual.alvoJejumMin || 70));
      setAlvoJejumMax(String(protocoloAtual.alvoJejumMax || 130));
      setAlvoPosMax(String(protocoloAtual.alvoPosMax || 180));
      setInsulinaBasalNome(protocoloAtual.insulinaBasalNome || "");
      setInsulinaBasalDoseRef(
        protocoloAtual.insulinaBasalDoseRef !== null &&
          protocoloAtual.insulinaBasalDoseRef !== undefined
          ? String(protocoloAtual.insulinaBasalDoseRef)
          : "",
      );
      setInsulinaBasalHorario(protocoloAtual.insulinaBasalHorario || "");
      setInsulinaRapidaNome(protocoloAtual.insulinaRapidaNome || "");
      setOrientacaoHipo(protocoloAtual.orientacaoHipo || "");
      setOrientacaoHiper(protocoloAtual.orientacaoHiper || "");
    });
    return () => {
      mounted = false;
    };
  }, [protocoloAtual]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const carregarMapa = useCallback(async () => {
    await Promise.resolve();
    if (!isOpen || !pacienteId) return;
    setCarregandoMapa(true);
    try {
      const res = await fetch(
        `/api/pacientes/${encodeURIComponent(pacienteId)}/mapa-glicemico?dias=${dias}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
      );
      if (!res.ok) return;
      const json = (await res.json()) as MapaGlicemicoResponseDTO;
      if (json?.success) {
        setMapaData(json);
        if (json.protocolo) {
          onProtocoloChange(json.protocolo);
        }
      }
    } catch (err) {
      console.error("[MapaGlicemicoModal] Erro ao carregar mapa:", err);
    } finally {
      setCarregandoMapa(false);
    }
  }, [isOpen, pacienteId, dias, onProtocoloChange]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) void carregarMapa();
    });
    return () => {
      mounted = false;
    };
  }, [isOpen, carregarMapa]);

  // Atalho ESC para fechar
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const handleQuickToggle = async (
    nextAtivo: boolean,
    nextUsaInsulina: boolean,
  ) => {
    const resolvedUsaInsulina = nextAtivo ? nextUsaInsulina : false;
    setAtivo(nextAtivo);
    setUsaInsulina(resolvedUsaInsulina);
    setSalvandoSwitchRapido(true);

    try {
      const res = await fetch(
        `/api/pacientes/${encodeURIComponent(pacienteId)}/protocolo-glicemico`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ativo: nextAtivo,
            usaInsulina: resolvedUsaInsulina,
          }),
        },
      );
      const json = await res.json();
      if (res.ok && json?.success && json.protocolo) {
        onProtocoloChange(json.protocolo as ProtocoloGlicemicoDTO);
        showToast(
          nextAtivo
            ? resolvedUsaInsulina
              ? "Monitoramento e Controle de Insulina ativados"
              : "Monitoramento Glicêmico ativado"
            : "Monitoramento Glicêmico desativado no App",
        );
      }
    } catch (err) {
      console.error("[MapaGlicemicoModal] Erro ao alternar switch:", err);
    } finally {
      setSalvandoSwitchRapido(false);
    }
  };

  const handleSelectPreset = (
    presetModo: Exclude<ModoProtocoloGlicemico, "PERSONALIZADO">,
    presetSlots: SlotMapaGlicemico[],
  ) => {
    setModo(presetModo);
    setSlotsAtivos([...presetSlots]);
  };

  const handleToggleSlot = (slot: SlotMapaGlicemico) => {
    setSlotsAtivos((prev) => {
      const exists = prev.includes(slot);
      const next = exists
        ? prev.filter((s) => s !== slot)
        : SLOTS_MAPA_ORDER.filter((s) => s === slot || prev.includes(s));
      setModo(detectarModoPorSlots(next));
      return next;
    });
  };

  const handleSalvarProtocolo = async () => {
    setSalvandoProtocolo(true);
    try {
      const minNum = Math.max(40, Math.min(150, parseInt(alvoJejumMin, 10) || 70));
      const maxJejumNum = Math.max(
        minNum + 10,
        Math.min(250, parseInt(alvoJejumMax, 10) || 130),
      );
      const maxPosNum = Math.max(
        maxJejumNum,
        Math.min(350, parseInt(alvoPosMax, 10) || 180),
      );
      const doseNum = parseFloat(insulinaBasalDoseRef.replace(",", "."));
      const doseFinal =
        !Number.isNaN(doseNum) && doseNum > 0
          ? Math.round(doseNum * 100) / 100
          : null;

      const res = await fetch(
        `/api/pacientes/${encodeURIComponent(pacienteId)}/protocolo-glicemico`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ativo,
            usaInsulina: ativo ? usaInsulina : false,
            modo,
            slotsAtivos,
            alvoJejumMin: minNum,
            alvoJejumMax: maxJejumNum,
            alvoPosMax: maxPosNum,
            insulinaBasalNome: insulinaBasalNome.trim() || null,
            insulinaBasalDoseRef: doseFinal,
            insulinaBasalHorario: insulinaBasalHorario.trim() || null,
            insulinaRapidaNome: insulinaRapidaNome.trim() || null,
            orientacaoHipo: orientacaoHipo.trim() || null,
            orientacaoHiper: orientacaoHiper.trim() || null,
          }),
        },
      );

      const json = await res.json();
      if (res.ok && json?.success && json.protocolo) {
        onProtocoloChange(json.protocolo as ProtocoloGlicemicoDTO);
        showToast("Protocolo glicêmico e insulinas salvos com sucesso!");
        void carregarMapa();
      }
    } catch (err) {
      console.error("[MapaGlicemicoModal] Erro ao salvar protocolo:", err);
    } finally {
      setSalvandoProtocolo(false);
    }
  };

  const handleExportarPdf = async () => {
    if (!mapaData || exportandoPdf) return;
    setExportandoPdf(true);
    try {
      const doctor = resolveDoctorProfile(usuario);
      const dataEmissao = formatarDataBR(new Date());
      const fileName = formatarNomeArquivoMapaGlicemico(pacienteNome);
      const { downloadMapaGlicemicoPdf } = await import(
        "@/components/MapaGlicemicoPdfExporter"
      );

      await downloadMapaGlicemicoPdf(
        {
          pacienteNome,
          pacienteRecordCode,
          dias,
          dataEmissao,
          localCidade: doctor.localCidade,
          medicoNome: doctor.medicoNome,
          crm: doctor.crm,
          especialidades: doctor.especialidades,
          clinicaNome: doctor.clinicaNome,
          clinicaSubtitulo: doctor.clinicaSubtitulo,
          clinicaContato: doctor.clinicaContato,
          logoSrc: getClinicaLogoUrl(),
          protocolo: mapaData.protocolo,
          resumo: mapaData.resumo,
          linhas: mapaData.linhas,
          mediasPorColuna: mapaData.mediasPorColuna,
        },
        fileName,
      );
      showToast("PDF do Mapa Glicêmico exportado com sucesso!");
    } catch (err) {
      console.error("[MapaGlicemicoModal] Erro ao gerar PDF:", err);
    } finally {
      setExportandoPdf(false);
    }
  };

  const mostrarColunaBasal = useMemo(() => {
    if (usaInsulina || protocoloAtual.usaInsulina) return true;
    return (
      mapaData?.linhas.some((l) => l.basalDoses && l.basalDoses.length > 0) ??
      false
    );
  }, [usaInsulina, protocoloAtual.usaInsulina, mapaData]);

  const alvosAtuais = useMemo(
    () => ({
      alvoJejumMin: mapaData?.protocolo.alvoJejumMin ?? protocoloAtual.alvoJejumMin ?? 70,
      alvoJejumMax: mapaData?.protocolo.alvoJejumMax ?? protocoloAtual.alvoJejumMax ?? 130,
      alvoPosMax: mapaData?.protocolo.alvoPosMax ?? protocoloAtual.alvoPosMax ?? 180,
    }),
    [mapaData, protocoloAtual],
  );

  if (!isOpen) return null;

  const resumo = mapaData?.resumo;
  const linhas = mapaData?.linhas ?? [];
  const mediasPorColuna = mapaData?.mediasPorColuna;
  const slotsPrescritosSet = new Set<SlotMapaGlicemico>(
    mapaData?.protocolo.slotsAtivos ?? protocoloAtual.slotsAtivos,
  );

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Mapa Glicêmico e Controle de Insulina"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* CABEÇALHO CLINICAL LIGHT (.cl-modal-header) */}
        <div className="cl-modal-header px-5 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-900 tracking-tight">
                  Mapa Glicêmico & Controle de Insulina
                </h2>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                    ativo
                      ? "cl-badge-emerald"
                      : "cl-badge-slate"
                  }`}
                >
                  {ativo
                    ? resumirEtiquetaProtocolo({
                        ...protocoloAtual,
                        ativo,
                        usaInsulina,
                        modo,
                        slotsAtivos,
                      })
                    : "Não ativado"}
                </span>
                {ativo && usaInsulina ? (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 inline-flex items-center gap-1">
                    <Syringe className="w-3 h-3" />
                    <span>Insulina Ativa</span>
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {pacienteNome}
                {pacienteRecordCode ? ` • ${pacienteRecordCode}` : ""} • Alvo
                Jejum/Pré {alvosAtuais.alvoJejumMin}–{alvosAtuais.alvoJejumMax}{" "}
                mg/dL | Pós ≤{alvosAtuais.alvoPosMax} mg/dL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Sub-abas: Grade Clínica | Protocolo & Insulina */}
            <div className="cl-segmented flex items-center">
              <button
                type="button"
                onClick={() => setSubAba("grade")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                  subAba === "grade"
                    ? "bg-white text-teal-800 shadow-2xs border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Grade Clínica</span>
              </button>
              <button
                type="button"
                onClick={() => setSubAba("protocolo")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                  subAba === "protocolo"
                    ? "bg-white text-teal-800 shadow-2xs border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Protocolo & Insulina</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Fechar (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TOAST DE CONFIRMAÇÃO */}
        {toastMsg ? (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 flex items-center gap-2 text-xs font-bold text-emerald-800 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        ) : null}

        {/* CORPO ROLÁVEL */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-slate-50/60">
          {subAba === "grade" ? (
            <div className="space-y-4">
              {/* BARRA DE CONTROLES DA GRADE + KPIs + EXPORTAR PDF */}
              <div className="cl-card p-4 flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Seletor 7d | 14d | 30d */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Período:
                    </span>
                    <div className="cl-segmented inline-flex items-center">
                      {([7, 14, 30] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDias(d)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            dias === d
                              ? "bg-white text-teal-800 shadow-2xs border border-slate-200/80"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {d} dias
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSubAba("protocolo")}
                      className="cl-btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-teal-700" />
                      <span>Configurar Protocolo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleExportarPdf()}
                      disabled={exportandoPdf || carregandoMapa || !mapaData}
                      className="cl-btn-primary px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {exportandoPdf ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Gerando PDF...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Exportar PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Mini-chips KPI */}
                <div
                  className={`grid grid-cols-2 ${
                    mostrarColunaBasal ? "sm:grid-cols-5" : "sm:grid-cols-4"
                  } gap-2.5`}
                >
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Média Jejum
                    </span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-lg font-black font-mono text-slate-900">
                        {resumo?.mediaJejum !== null &&
                        resumo?.mediaJejum !== undefined
                          ? resumo.mediaJejum
                          : "--"}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        mg/dL
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">
                      Alvo {alvosAtuais.alvoJejumMin}–{alvosAtuais.alvoJejumMax}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Média Pós
                    </span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-lg font-black font-mono text-slate-900">
                        {resumo?.mediaPosPrandial !== null &&
                        resumo?.mediaPosPrandial !== undefined
                          ? resumo.mediaPosPrandial
                          : "--"}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        mg/dL
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">
                      Alvo ≤{alvosAtuais.alvoPosMax}
                    </span>
                  </div>

                  <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                      No Alvo %
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-lg font-black font-mono text-emerald-800">
                        {resumo?.percentualNoAlvo !== null &&
                        resumo?.percentualNoAlvo !== undefined
                          ? `${resumo.percentualNoAlvo}%`
                          : "--"}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700">
                        ({resumo?.totalMedicoes ?? 0} med.)
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-emerald-700/80">
                      Média geral:{" "}
                      {resumo?.mediaGeral ? `${resumo.mediaGeral} mg/dL` : "--"}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Hipo / Hiper (&gt;250)
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span
                        className={`text-lg font-black font-mono ${
                          (resumo?.episodiosHipo ?? 0) > 0 ||
                          (resumo?.episodiosHiper ?? 0) > 0
                            ? "text-rose-600"
                            : "text-slate-900"
                        }`}
                      >
                        {resumo?.episodiosHipo ?? 0} /{" "}
                        {resumo?.episodiosHiper ?? 0}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">
                      &lt;{alvosAtuais.alvoJejumMin} ou &gt;250 mg/dL
                    </span>
                  </div>

                  {mostrarColunaBasal ? (
                    <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-3">
                      <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                        Basal Média UI
                      </span>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-lg font-black font-mono text-indigo-900">
                          {resumo?.mediaDiariaBasalUI !== null &&
                          resumo?.mediaDiariaBasalUI !== undefined
                            ? formatarUI(resumo.mediaDiariaBasalUI)
                            : "--"}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-indigo-700/80">
                        {resumo?.mediaDiariaRapidaUI
                          ? `Rápida: ${formatarUI(resumo.mediaDiariaRapidaUI)}/dia`
                          : protocoloAtual.insulinaBasalNome || "Insulina basal"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* MATRIZ COLORIDA DE LEITURA EM 10 SEGUNDOS */}
              <div className="cl-card overflow-hidden">
                {carregandoMapa && !mapaData ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                    <span className="text-xs font-semibold">
                      Consolidando grade glicêmica dos últimos {dias} dias...
                    </span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                          <th className="py-2.5 px-3.5 border-r border-slate-200/80 w-28">
                            Data
                          </th>
                          {SLOTS_MAPA_ORDER.map((slot) => {
                            const isSlotPrescrito = slotsPrescritosSet.has(slot);
                            return (
                              <th
                                key={slot}
                                className="py-2.5 px-2 text-center border-r border-slate-200/80 min-w-[92px]"
                              >
                                <div className="inline-flex items-center justify-center gap-1">
                                  <span>{SLOT_META[slot].shortLabel}</span>
                                  {isSlotPrescrito ? (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-teal-600"
                                      title="Horário prescrito no protocolo"
                                    />
                                  ) : null}
                                </div>
                              </th>
                            );
                          })}
                          {mostrarColunaBasal ? (
                            <th className="py-2.5 px-2.5 text-center min-w-[96px] bg-indigo-50/50 text-indigo-900">
                              Basal
                            </th>
                          ) : null}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-200/80 text-xs">
                        {linhas.length === 0 ? (
                          <tr>
                            <td
                              colSpan={
                                SLOTS_MAPA_ORDER.length +
                                (mostrarColunaBasal ? 2 : 1)
                              }
                              className="py-12 px-4 text-center text-slate-500"
                            >
                              <p className="text-xs font-bold text-slate-700">
                                Nenhuma medição registrada nos últimos {dias}{" "}
                                dias
                              </p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                Assim que o paciente registrar glicemias ou
                                doses de insulina no App Mobile, a grade
                                aparecerá preenchida aqui automaticamente.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          linhas.map((linha) => {
                            const basalTotal = linha.basalDoses.reduce(
                              (acc, b) => acc + b.unidades,
                              0,
                            );
                            const basalTooltip = linha.basalDoses
                              .map(
                                (b) =>
                                  `${formatarUI(b.unidades)}${
                                    b.nome ? ` (${b.nome})` : ""
                                  } às ${b.hora}`,
                              )
                              .join(" • ");

                            return (
                              <tr
                                key={linha.dataDia}
                                className="hover:bg-slate-50/80 transition-colors"
                              >
                                {/* Coluna Data */}
                                <td className="py-2.5 px-3.5 border-r border-slate-200/70 whitespace-nowrap">
                                  <div className="font-extrabold text-slate-900 font-mono text-xs">
                                    {linha.dataLabel}
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                                    <span>{linha.diaSemanaCurto}</span>
                                    {linha.avulsos.length > 0 ? (
                                      <span
                                        className="px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-bold"
                                        title={linha.avulsos
                                          .map(
                                            (av) =>
                                              `Avulsa ${av.hora}: ${av.valor} mg/dL`,
                                          )
                                          .join("\n")}
                                      >
                                        +{linha.avulsos.length} avulsa
                                      </span>
                                    ) : null}
                                  </div>
                                </td>

                                {/* 7 Colunas de Momentos Clínicos */}
                                {SLOTS_MAPA_ORDER.map((slot) => {
                                  const cel = linha.celulas[slot];
                                  if (!cel) {
                                    return (
                                      <td
                                        key={slot}
                                        className="py-2 px-1.5 text-center border-r border-slate-200/70"
                                      >
                                        <span className="text-slate-300 font-mono text-xs select-none">
                                          —
                                        </span>
                                      </td>
                                    );
                                  }

                                  return (
                                    <td
                                      key={slot}
                                      className="py-1.5 px-1.5 text-center border-r border-slate-200/70"
                                    >
                                      <div
                                        title={buildCellTooltip(
                                          SLOT_META[slot].label,
                                          cel,
                                        )}
                                        className={`mx-auto rounded-lg border px-2 py-1 flex flex-col items-center justify-center leading-tight transition-transform hover:scale-[1.02] ${getCellBadgeClasses(
                                          cel.status,
                                        )}`}
                                      >
                                        <span className="text-xs font-black font-mono tabular-nums">
                                          {cel.valor}
                                        </span>
                                        <div className="flex items-center justify-center gap-1 mt-0.5">
                                          <span
                                            className={`text-[9px] font-semibold ${
                                              cel.status === "HIPER"
                                                ? "text-rose-100"
                                                : "opacity-75"
                                            }`}
                                          >
                                            {cel.hora}
                                          </span>
                                          {cel.contextoTags.length > 0 ? (
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full ${
                                                cel.status === "HIPER"
                                                  ? "bg-white"
                                                  : "bg-sky-600"
                                              }`}
                                            />
                                          ) : null}
                                        </div>
                                        {cel.insulinaUI &&
                                        cel.insulinaUI > 0 ? (
                                          <span
                                            className={`mt-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                                              cel.status === "HIPER"
                                                ? "bg-white/20 text-white"
                                                : "bg-indigo-100/90 text-indigo-800"
                                            }`}
                                          >
                                            {formatarUI(cel.insulinaUI)}
                                          </span>
                                        ) : null}
                                      </div>
                                    </td>
                                  );
                                })}

                                {/* Coluna Basal */}
                                {mostrarColunaBasal ? (
                                  <td className="py-1.5 px-2 text-center bg-indigo-50/20">
                                    {basalTotal > 0 ? (
                                      <div
                                        title={basalTooltip}
                                        className="mx-auto rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-900 px-2 py-1 flex flex-col items-center justify-center leading-tight"
                                      >
                                        <span className="text-xs font-black font-mono">
                                          {formatarUI(basalTotal)}
                                        </span>
                                        <span className="text-[9px] font-semibold text-indigo-600 mt-0.5">
                                          {linha.basalDoses[0]?.hora || "Basal"}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 font-mono text-xs select-none">
                                        —
                                      </span>
                                    )}
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })
                        )}
                      </tbody>

                      {/* LINHA FIXA DE MÉDIAS POR COLUNA NO RODAPÉ */}
                      <tfoot>
                        <tr className="bg-teal-50/80 border-t-2 border-teal-200 text-xs font-black text-teal-950">
                          <td className="py-2.5 px-3.5 border-r border-teal-200/70 uppercase tracking-wider text-[11px]">
                            Médias
                          </td>
                          {SLOTS_MAPA_ORDER.map((slot) => {
                            const val = mediasPorColuna?.[slot] ?? null;
                            const statusMedia =
                              val !== null
                                ? classificarGlicemiaMapa(
                                    val,
                                    slot,
                                    alvosAtuais,
                                  )
                                : null;
                            const corMedia =
                              statusMedia === "HIPO" || statusMedia === "HIPER"
                                ? "text-rose-700"
                                : statusMedia === "ATENCAO"
                                  ? "text-amber-700"
                                  : "text-teal-900";
                            return (
                              <td
                                key={slot}
                                className={`py-2.5 px-2 text-center border-r border-teal-200/70 font-mono ${corMedia}`}
                              >
                                {val !== null ? `${val} mg/dL` : "—"}
                              </td>
                            );
                          })}
                          {mostrarColunaBasal ? (
                            <td className="py-2.5 px-2 text-center font-mono text-indigo-900 bg-indigo-100/50">
                              {resumo?.mediaDiariaBasalUI !== null &&
                              resumo?.mediaDiariaBasalUI !== undefined
                                ? formatarUI(resumo.mediaDiariaBasalUI)
                                : "—"}
                            </td>
                          ) : null}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Legenda Compacta da Grade */}
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-xs bg-rose-200 border border-rose-400" />
                      <span>Hipo (&lt;{alvosAtuais.alvoJejumMin})</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-100 border border-emerald-400" />
                      <span>No Alvo</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-xs bg-amber-100 border border-amber-400" />
                      <span>Atenção</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-xs bg-rose-600" />
                      <span>Hiper (&gt;250)</span>
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">
                    Passe o mouse sobre qualquer célula para ver horário,
                    insulina rápida e contexto
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* ============================================================== */
            /* SUB-ABA 2: PROTOCOLO & INSULINA                                */
            /* ============================================================== */
            <div className="space-y-4 max-w-4xl mx-auto">
              {/* 1. CHAVES MESTRAS DE 1 CLIQUE (SINCRONIZADAS COM O PRONTUÁRIO) */}
              <div className="cl-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                        Monitoramento Glicêmico (Diabetes)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {ativo
                          ? "Ativo no Prontuário e visível no App Mobile do paciente"
                          : "Oculto no App do paciente (nenhum card de glicose ou insulina será exibido)"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {salvandoSwitchRapido ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                    ) : null}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={ativo}
                      onClick={() =>
                        void handleQuickToggle(!ativo, usaInsulina)
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-hidden ${
                        ativo ? "bg-teal-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                          ativo ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {ativo ? (
                  <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                        <Syringe className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Controle de Insulina (Basal / Rápida)
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Habilita pílula diária de Insulina Basal e campo de
                          Insulina Rápida (UI) junto às medições
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={usaInsulina}
                      onClick={() => void handleQuickToggle(true, !usaInsulina)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-hidden ${
                        usaInsulina ? "bg-indigo-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
                          usaInsulina ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                ) : null}
              </div>

              {/* 2. PRESETS DE 1 CLIQUE + CHIPS DOS 7 MOMENTOS + ALVOS */}
              <div className="cl-card p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1">
                    Frequência e Momentos do Mapa Glicêmico
                  </h3>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Escolha um modelo rápido ou personalize exatamente quais
                    momentos aparecerão na trilha diária do paciente.
                  </p>

                  {/* Presets de 1 clique */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {PROTOCOLO_PRESETS.map((preset) => {
                      const isSelected = modo === preset.modo;
                      return (
                        <button
                          key={preset.modo}
                          type="button"
                          onClick={() =>
                            handleSelectPreset(preset.modo, preset.slots)
                          }
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? "bg-teal-50/80 border-teal-600 text-teal-950 shadow-2xs"
                              : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-extrabold">
                              {preset.label}
                            </span>
                            {isSelected ? (
                              <Check className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                            ) : null}
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-1">
                            {preset.descricao}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chips clicáveis dos 7 momentos */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-slate-700">
                      Horários Ativos na Trilha do App ({slotsAtivos.length}{" "}
                      selecionado{slotsAtivos.length === 1 ? "" : "s"})
                    </label>
                    {modo === "PERSONALIZADO" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full cl-badge-teal">
                        Personalizado
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SLOTS_MAPA_ORDER.map((slot) => {
                      const active = slotsAtivos.includes(slot);
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleToggleSlot(slot)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                            active
                              ? "bg-teal-600 text-white border-teal-700 shadow-2xs"
                              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {active ? <Check className="w-3 h-3" /> : null}
                          <span>{SLOT_META[slot].label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Alvos Glicêmicos Editáveis */}
                <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Limite Hipoglicemia (Mín. mg/dL)
                    </label>
                    <input
                      type="number"
                      min={40}
                      max={150}
                      value={alvoJejumMin}
                      onChange={(e) => setAlvoJejumMin(e.target.value)}
                      className="cl-input w-full text-xs font-bold px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Alvo Máx. Jejum / Pré-Refeição (mg/dL)
                    </label>
                    <input
                      type="number"
                      min={80}
                      max={250}
                      value={alvoJejumMax}
                      onChange={(e) => setAlvoJejumMax(e.target.value)}
                      className="cl-input w-full text-xs font-bold px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Alvo Máx. Pós-Refeição (mg/dL)
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={350}
                      value={alvoPosMax}
                      onChange={(e) => setAlvoPosMax(e.target.value)}
                      className="cl-input w-full text-xs font-bold px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              {/* 3. ESQUEMA DE INSULINA BASAL & RÁPIDA (QUANDO USA_INSULINA === TRUE) */}
              {usaInsulina ? (
                <div className="cl-card p-4 space-y-4 border-indigo-200/90">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                    <Syringe className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Prescrição de Insulina Basal e Rápida
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Insulina Basal */}
                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                      <span className="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wider block">
                        Insulina Basal (1 toque diário no App)
                      </span>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Nome da Insulina Basal
                        </label>
                        <input
                          type="text"
                          value={insulinaBasalNome}
                          onChange={(e) => setInsulinaBasalNome(e.target.value)}
                          placeholder="Ex: Lantus, Tresiba, Toujeo, NPH..."
                          className="cl-input w-full text-xs font-semibold px-3 py-2 bg-white"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {SUGESTOES_INSULINA_BASAL.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              onClick={() => setInsulinaBasalNome(sug)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border cursor-pointer transition-colors ${
                                insulinaBasalNome.toLowerCase() ===
                                sug.toLowerCase()
                                  ? "bg-indigo-600 text-white border-indigo-700"
                                  : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                              }`}
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Dose Referência (UI)
                          </label>
                          <input
                            type="text"
                            value={insulinaBasalDoseRef}
                            onChange={(e) =>
                              setInsulinaBasalDoseRef(e.target.value)
                            }
                            placeholder="Ex: 18"
                            className="cl-input w-full text-xs font-bold px-3 py-2 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Horário Habitual
                          </label>
                          <input
                            type="text"
                            value={insulinaBasalHorario}
                            onChange={(e) =>
                              setInsulinaBasalHorario(e.target.value)
                            }
                            placeholder="Ex: 22:00 ou Noite"
                            className="cl-input w-full text-xs font-semibold px-3 py-2 bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Insulina Rápida */}
                    <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-3">
                      <span className="text-[11px] font-extrabold text-teal-800 uppercase tracking-wider block">
                        Insulina Rápida / Bolus (nas refeições)
                      </span>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Nome da Insulina Rápida
                        </label>
                        <input
                          type="text"
                          value={insulinaRapidaNome}
                          onChange={(e) =>
                            setInsulinaRapidaNome(e.target.value)
                          }
                          placeholder="Ex: NovoRapid, Humalog, Fiasp, Regular..."
                          className="cl-input w-full text-xs font-semibold px-3 py-2 bg-white"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {SUGESTOES_INSULINA_RAPIDA.map((sug) => (
                            <button
                              key={sug}
                              type="button"
                              onClick={() => setInsulinaRapidaNome(sug)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border cursor-pointer transition-colors ${
                                insulinaRapidaNome.toLowerCase() ===
                                sug.toLowerCase()
                                  ? "bg-teal-600 text-white border-teal-700"
                                  : "bg-white text-slate-600 border-slate-200 hover:border-teal-300"
                              }`}
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" />
                        <span>
                          Na gaveta de registro de glicemia do App, o paciente
                          poderá informar quantas UI de{" "}
                          <strong>{insulinaRapidaNome || "insulina rápida"}</strong>{" "}
                          aplicou naquele momento.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 4. ORIENTAÇÕES CURTAS DE SEGURANÇA (HIPO / HIPER) */}
              <div className="cl-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Orientações Rápidas no App em Caso de Alerta (Opcional)
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Se Glicemia &lt; {alvoJejumMin || 70} mg/dL (Hipoglicemia)
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={orientacaoHipo}
                      onChange={(e) => setOrientacaoHipo(e.target.value)}
                      placeholder="Ex: Ingerir 15g de carboidrato rápido e repetir medição em 15 min."
                      className="cl-input w-full text-xs px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Se Glicemia &gt; 250 mg/dL (Hiperglicemia)
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={orientacaoHiper}
                      onChange={(e) => setOrientacaoHiper(e.target.value)}
                      placeholder="Ex: Hidratar-se bem, verificar dose corretiva prescrita e avisar a clínica se persistir."
                      className="cl-input w-full text-xs px-3 py-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {subAba === "protocolo"
              ? "As chaves de 1 clique sincronizam imediatamente com o App Mobile do paciente."
              : `Exibindo ${linhas.length} dia(s) com registros nos últimos ${dias} dias.`}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="cl-btn-secondary px-4 py-2 text-xs font-bold cursor-pointer"
            >
              Fechar
            </button>

            {subAba === "protocolo" ? (
              <button
                type="button"
                onClick={() => void handleSalvarProtocolo()}
                disabled={salvandoProtocolo}
                className="cl-btn-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {salvandoProtocolo ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Protocolo</span>
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
