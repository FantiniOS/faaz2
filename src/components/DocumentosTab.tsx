"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
  Eye,
  Stethoscope,
  ClipboardList,
  ShieldCheck,
  UserCheck,
  CalendarDays,
  BadgeCheck,
  Plus,
  BookmarkPlus,
  AlertCircle,
} from "lucide-react";
import AuthContext, { UsuarioLogado } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getDocumentTemplates,
  saveDocumentTemplate,
} from "@/actions/document-template-actions";
import {
  type DocumentTemplateDTO,
  STARTER_DOCUMENT_TEMPLATES,
  toTemplateCategory,
} from "@/lib/document-template-types";
import type {
  PrescriptionPDFProps,
  TipoDocumentoMedico,
} from "@/components/PrescriptionPDF";

// Isolamento estrito Client-Only (ssr: false) para os componentes que carregam @react-pdf/renderer
const PdfDownloadButtonClient = dynamic(
  () =>
    import("@/components/PdfClientControls").then(
      (mod) => mod.PdfDownloadButtonClient
    ),
  {
    ssr: false,
    loading: () => (
      <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-600/80 text-white shadow-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Carregando PDF...</span>
      </span>
    ),
  }
);

const PdfViewerClient = dynamic(
  () =>
    import("@/components/PdfClientControls").then((mod) => mod.PdfViewerClient),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[640px] rounded-xl border border-slate-300 bg-white flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        <span>Inicializando visualizador PDF...</span>
      </div>
    ),
  }
);

export interface DocumentosTabProps {
  pacienteId: string;
  pacienteNome: string;
  pacienteCpf?: string | null;
  pacienteRecordCode?: string | null;
}

interface ResolvedDoctorProfile {
  medicoNome: string;
  crm: string;
  especialidades: string;
  clinicaNome: string;
  localCidade: string;
  clinicaContato: string;
}

const FALLBACK_DOCTOR_PROFILE: ResolvedDoctorProfile = {
  medicoNome: "Dra. Maria Luiza",
  crm: "CRM-MG XXXXX",
  especialidades: "Endocrinologia, Metabologia & Saúde Integrativa",
  clinicaNome: "Clínica FAAZ",
  localCidade: "Belo Horizonte - MG",
  clinicaContato:
    "Clínica FAAZ Medicina & Saúde Integrativa  •  WhatsApp: (31) 98440-0076",
};

const DOC_TYPES: Array<{
  id: TipoDocumentoMedico;
  label: string;
  shortDesc: string;
  defaultTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
}> = [
  {
    id: "RECEITUARIO",
    label: "Receituário Médico",
    shortDesc: "Prescrições, posologia e orientações",
    defaultTitle: "Prescrição Médica Individualizada",
    icon: Stethoscope,
    placeholder:
      "Digite os medicamentos ou suplementos, concentrações, via de administração, posologia e orientações de uso...",
  },
  {
    id: "EXAMES",
    label: "Pedido de Exames",
    shortDesc: "Exames laboratoriais e de imagem",
    defaultTitle: "Solicitação de Exames Laboratoriais e Diagnósticos",
    icon: ClipboardList,
    placeholder:
      "Liste os exames laboratoriais, hormonais ou de imagem solicitados e a indicação clínica...",
  },
  {
    id: "ATESTADO",
    label: "Atestado Médico",
    shortDesc: "Comparecimento ou afastamento clínico",
    defaultTitle: "Atestado Médico",
    icon: ShieldCheck,
    placeholder:
      "Redija o texto do atestado médico ou declaração de comparecimento...",
  },
];

const INITIAL_RECEITA_STARTER =
  STARTER_DOCUMENT_TEMPLATES.find((tpl) => tpl.category === "RECEITA") ??
  STARTER_DOCUMENT_TEMPLATES[0];

const QUICK_SHORTCUTS_MEDICAMENTOS: readonly string[] = [
  "Whey Protein Isolado (30g/dia)",
  "Creatina Monohidratada (5g/dia)",
  "Vitamina D3 2.000 UI (1x/dia)",
  "Ômega 3 EPA/DHA 1000mg (2x/dia)",
  "Magnésio Dimalato 300mg (1x/noite)",
  "Metilcobalamina B12 1.000mcg (1x/dia)",
];

const QUICK_SHORTCUTS_EXAMES: readonly string[] = [
  "Hemograma Completo",
  "Perfil Lipídico",
  "Insulina Basal",
  "Glicemia de Jejum",
  "Hemoglobina Glicada (HbA1c)",
  "TSH e T4 Livre",
  "25-OH-Vitamina D",
  "TGO / TGP / Gama-GT",
];

const QUICK_SHORTCUTS_ATESTADO: readonly string[] = [
  "Comparecimento no período da manhã",
  "Comparecimento no período da tarde",
  "Repouso domiciliar por 1 (um) dia",
  "Afastamento de atividades físicas por 7 dias",
  "CID-10 informado mediante autorização expressa do paciente",
];

const QUICK_SHORTCUTS_BY_TYPE: Record<
  TipoDocumentoMedico,
  { label: string; items: readonly string[] }
> = {
  RECEITUARIO: {
    label: "Atalhos de Inserção Rápida — Medicamentos & Suplementos",
    items: QUICK_SHORTCUTS_MEDICAMENTOS,
  },
  EXAMES: {
    label: "Atalhos de Inserção Rápida — Exames Recorrentes",
    items: QUICK_SHORTCUTS_EXAMES,
  },
  ATESTADO: {
    label: "Atalhos de Inserção Rápida — Declarações & Cláusulas",
    items: QUICK_SHORTCUTS_ATESTADO,
  },
};

function appendShortcutLine(prevText: string, itemText: string): string {
  const cleanItem = itemText.trim();
  if (!cleanItem) return prevText;
  if (!prevText.trim()) return `• ${cleanItem}`;
  return prevText.endsWith("\n")
    ? `${prevText}• ${cleanItem}`
    : `${prevText}\n• ${cleanItem}`;
}

function getTodayDisplayDate(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function buildSafeFileName(
  tipo: TipoDocumentoMedico,
  pacienteNome: string
): string {
  const cleanType =
    tipo === "RECEITUARIO"
      ? "receituario"
      : tipo === "EXAMES"
      ? "pedido-exames"
      : "atestado";

  const normalizedName = pacienteNome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  const dateStamp = new Date().toISOString().slice(0, 10);
  return `Clinica-FAAZ-${cleanType}-${normalizedName || "paciente"}-${dateStamp}.pdf`;
}

function resolveDoctorProfile(
  usuario: UsuarioLogado | null
): ResolvedDoctorProfile {
  if (!usuario) return FALLBACK_DOCTOR_PROFILE;

  const rawName = (usuario.fullName || usuario.nome || "").trim();
  const hasMappedCouncil = Boolean(usuario.councilNumber?.trim());
  const hasExplicitTitle = Boolean(usuario.title?.trim());

  // Se o cadastro do médico já possuir título/CRM mapeados, monta o nome completo automaticamente;
  // caso contrário, usa o fallback provisório da Dra. Malu.
  const medicoNome =
    hasExplicitTitle || hasMappedCouncil
      ? `${usuario.title?.trim() ? `${usuario.title.trim()} ` : ""}${rawName || FALLBACK_DOCTOR_PROFILE.medicoNome}`
      : FALLBACK_DOCTOR_PROFILE.medicoNome;

  const crm = hasMappedCouncil
    ? `${usuario.councilType?.trim() || "CRM"} ${usuario.councilNumber!.trim()}`
    : FALLBACK_DOCTOR_PROFILE.crm;

  const clinicaNome =
    usuario.clinicaNome?.trim() || FALLBACK_DOCTOR_PROFILE.clinicaNome;

  const especialidades =
    usuario.specialty?.trim() || FALLBACK_DOCTOR_PROFILE.especialidades;

  return {
    medicoNome,
    crm,
    especialidades,
    clinicaNome,
    localCidade: FALLBACK_DOCTOR_PROFILE.localCidade,
    clinicaContato: `${clinicaNome} Medicina & Saúde Integrativa  •  WhatsApp: (31) 98440-0076`,
  };
}

export function DocumentosTab({
  pacienteId,
  pacienteNome,
  pacienteCpf,
  pacienteRecordCode,
}: DocumentosTabProps) {
  const router = useRouter();
  const authContext = useContext(AuthContext);
  const [fetchedSessionUser, setFetchedSessionUser] =
    useState<UsuarioLogado | null>(null);

  // Carrega sessão do médico logado via /api/auth/me caso AuthProvider não envolva a rota
  useEffect(() => {
    if (authContext?.usuario) return;

    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.autenticado && data?.usuario) {
          setFetchedSessionUser(data.usuario as UsuarioLogado);
        }
      })
      .catch(() => {
        // Fallback automático da Dra. Malu permanece ativo
      });

    return () => {
      active = false;
    };
  }, [authContext?.usuario]);

  const activeUser = authContext?.usuario ?? fetchedSessionUser;
  const doctorProfile = useMemo(
    () => resolveDoctorProfile(activeUser),
    [activeUser]
  );

  // Data atual e dados do paciente são injetados automaticamente do prontuário aberto
  const dataAtual = useMemo(() => getTodayDisplayDate(), []);

  const [tipo, setTipo] = useState<TipoDocumentoMedico>("RECEITUARIO");
  const [tituloDocumento, setTituloDocumento] = useState<string>(
    INITIAL_RECEITA_STARTER.documentTitle || DOC_TYPES[0].defaultTitle
  );
  const [conteudo, setConteudo] = useState<string>(
    INITIAL_RECEITA_STARTER.content
  );
  const latestConteudoRef = useRef<string>(INITIAL_RECEITA_STARTER.content);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Estado dos Templates Dinâmicos salvos no banco (DocumentTemplate)
  const [templates, setTemplates] = useState<DocumentTemplateDTO[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateFeedback, setTemplateFeedback] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState<string>("");
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState<boolean>(false);

  const [cpfPreference, setCpfPreference] = useState<{
    pacienteId: string;
    enabled: boolean;
  } | null>(null);
  const incluirCpf =
    cpfPreference?.pacienteId === pacienteId
      ? cpfPreference.enabled
      : Boolean(pacienteCpf);

  const [showPdfPreview, setShowPdfPreview] = useState<boolean>(false);
  const [downloadFeedback, setDownloadFeedback] = useState<boolean>(false);
  const [logoSrc] = useState<string>(() =>
    typeof window !== "undefined"
      ? `${window.location.origin}/logo-faaz.png`
      : "/logo-faaz.png"
  );

  const currentTypeConfig = useMemo(
    () => DOC_TYPES.find((item) => item.id === tipo) || DOC_TYPES[0],
    [tipo]
  );

  const currentShortcutsConfig = QUICK_SHORTCUTS_BY_TYPE[tipo];
  const activeCategory = toTemplateCategory(tipo);
  const activeTemplates = useMemo(
    () => templates.filter((tpl) => tpl.category === activeCategory),
    [templates, activeCategory]
  );

  useEffect(() => {
    let active = true;
    getDocumentTemplates()
      .then((res) => {
        if (!active) return;
        if (res.success) {
          setTemplates(res.templates);
          setTemplatesError(null);
        } else {
          setTemplatesError(
            res.error || "Não foi possível carregar os modelos."
          );
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error("[DocumentosTab] Erro ao carregar templates:", err);
        setTemplatesError("Erro de conexão ao carregar modelos salvos.");
      })
      .finally(() => {
        if (active) setLoadingTemplates(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Payload com dados automáticos do médico logado, paciente e data atual
  const draftPayload: PrescriptionPDFProps = useMemo(
    () => ({
      tipo,
      tituloDocumento,
      conteudo,
      pacienteNome: pacienteNome.trim() || "Paciente",
      pacienteCpf: incluirCpf ? pacienteCpf : null,
      pacienteRecordCode,
      dataEmissao: dataAtual,
      localCidade: doctorProfile.localCidade,
      medicoNome: doctorProfile.medicoNome,
      crm: doctorProfile.crm,
      especialidades: doctorProfile.especialidades,
      clinicaNome: doctorProfile.clinicaNome,
      clinicaContato: doctorProfile.clinicaContato,
      logoSrc,
    }),
    [
      tipo,
      tituloDocumento,
      conteudo,
      pacienteNome,
      incluirCpf,
      pacienteCpf,
      pacienteRecordCode,
      dataAtual,
      doctorProfile,
      logoSrc,
    ]
  );

  // Debounce leve durante a digitação para não travar a thread principal ao atualizar o PDFViewer
  const [committedPayload, setCommittedPayload] =
    useState<PrescriptionPDFProps>(draftPayload);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDraftDirty = useMemo(
    () => JSON.stringify(draftPayload) !== JSON.stringify(committedPayload),
    [draftPayload, committedPayload]
  );

  useEffect(() => {
    if (!isDraftDirty) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setCommittedPayload(draftPayload);
    }, 260);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [draftPayload, isDraftDirty]);

  const flushPendingDraft = useCallback(
    (overridePayload?: PrescriptionPDFProps) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setCommittedPayload(overridePayload ?? draftPayload);
    },
    [draftPayload]
  );

  const handleSelectType = (nextType: TipoDocumentoMedico) => {
    const targetConfig = DOC_TYPES.find((item) => item.id === nextType);
    if (!targetConfig) return;

    const nextCategory = toTemplateCategory(nextType);
    setTipo(nextType);
    let nextTitle = targetConfig.defaultTitle;
    let nextBody = latestConteudoRef.current;

    const isUsingPresetOrEmpty =
      nextBody.trim().length === 0 ||
      templates.some((tpl) => tpl.content.trim() === nextBody.trim()) ||
      STARTER_DOCUMENT_TEMPLATES.some(
        (tpl) => tpl.content.trim() === nextBody.trim()
      );

    const firstTemplateForNextType =
      templates.find((tpl) => tpl.category === nextCategory) ??
      STARTER_DOCUMENT_TEMPLATES.find((tpl) => tpl.category === nextCategory);

    if (isUsingPresetOrEmpty && firstTemplateForNextType) {
      nextBody = firstTemplateForNextType.content;
      nextTitle =
        firstTemplateForNextType.documentTitle?.trim() ||
        targetConfig.defaultTitle;
      latestConteudoRef.current = nextBody;
      setConteudo(nextBody);
    }

    setTituloDocumento(nextTitle);
    flushPendingDraft({
      ...draftPayload,
      tipo: nextType,
      tituloDocumento: nextTitle,
      conteudo: nextBody,
    });
  };

  // Carrega modelo salvo no banco e atualiza o PDF em tempo real imediatamente
  const handleApplyTemplate = useCallback(
    (tpl: DocumentTemplateDTO) => {
      const nextTitle =
        tpl.documentTitle?.trim() || currentTypeConfig.defaultTitle;
      const nextBody = tpl.content;

      latestConteudoRef.current = nextBody;
      setTituloDocumento(nextTitle);
      setConteudo(nextBody);
      flushPendingDraft({
        ...draftPayload,
        tituloDocumento: nextTitle,
        conteudo: nextBody,
      });
    },
    [currentTypeConfig.defaultTitle, draftPayload, flushPendingDraft]
  );

  const handleOpenSaveModal = () => {
    setSaveTemplateError(null);
    setNewTemplateTitle("");
    setIsSaveModalOpen(true);
  };

  const handleSaveCurrentTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newTemplateTitle.trim();
    if (trimmedTitle.length < 2) {
      setSaveTemplateError("Informe um nome com pelo menos 2 caracteres.");
      return;
    }

    const currentBody = latestConteudoRef.current;
    if (!currentBody.trim()) {
      setSaveTemplateError(
        "O campo de Texto Clínico está vazio. Escreva algo antes de salvar."
      );
      return;
    }

    try {
      setSavingTemplate(true);
      setSaveTemplateError(null);

      const res = await saveDocumentTemplate({
        title: trimmedTitle,
        content: currentBody,
        category: activeCategory,
        documentTitle:
          tituloDocumento.trim() || currentTypeConfig.defaultTitle,
      });

      if (!res.success || !res.template) {
        setSaveTemplateError(
          res.error || "Não foi possível salvar o modelo no banco."
        );
        return;
      }

      const createdTemplate = res.template;
      setTemplates((prev) => [...prev, createdTemplate]);
      setIsSaveModalOpen(false);
      setNewTemplateTitle("");
      setTemplateFeedback(
        `Modelo "${createdTemplate.title}" salvo em ${currentTypeConfig.label}!`
      );
      setTimeout(() => setTemplateFeedback(null), 3500);
      router.refresh();
      const refreshed = await getDocumentTemplates();
      if (refreshed.success) {
        setTemplates(refreshed.templates);
      }
    } catch (err) {
      console.error("[DocumentosTab] Erro ao salvar modelo:", err);
      setSaveTemplateError("Erro inesperado ao salvar modelo.");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Inserção rápida via chips com marcador + quebra de linha e sincronização imediata no PDF
  const handleInsertShortcut = useCallback(
    (itemText: string) => {
      const nextBody = appendShortcutLine(latestConteudoRef.current, itemText);
      latestConteudoRef.current = nextBody;
      setConteudo(nextBody);
      flushPendingDraft({
        ...draftPayload,
        conteudo: nextBody,
      });

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        });
      }
    },
    [draftPayload, flushPendingDraft]
  );

  const handleToggleRealPreview = () => {
    if (isDraftDirty) {
      flushPendingDraft(draftPayload);
    }
    setShowPdfPreview((prev) => !prev);
  };

  const safeFileName = useMemo(
    () => buildSafeFileName(tipo, pacienteNome),
    [tipo, pacienteNome]
  );

  const isContentEmpty = conteudo.trim().length === 0;

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-4 sm:p-6 pb-32 space-y-6 bg-slate-50/50">
      {/* BARRA SUPERIOR DO EMISSOR NATIVO */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900">
                Emissor de Documentos Clínicos (PDF Nativo)
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Sparkles className="w-3 h-3" /> Vetorial A4
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cabeçalho médico, nome do paciente e data preenchidos
              automaticamente pelo prontuário e sessão ativa.
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-2.5 flex-wrap"
          onMouseEnter={() => {
            if (isDraftDirty) flushPendingDraft();
          }}
        >
          <button
            type="button"
            onClick={handleToggleRealPreview}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              showPdfPreview
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>
              {showPdfPreview ? "Ocultar PDF real" : "Visualizar PDF real"}
            </span>
          </button>

          <PdfDownloadButtonClient
            pdfProps={committedPayload}
            fileName={safeFileName}
            disabled={isContentEmpty}
            onDownloadTriggered={() => {
              setDownloadFeedback(true);
              setTimeout(() => setDownloadFeedback(false), 3200);
            }}
          />
        </div>
      </div>

      {/* FEEDBACK DE DOWNLOAD */}
      {downloadFeedback && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Download iniciado: <strong>{safeFileName}</strong> — arquivo pronto
            para envio via WhatsApp ao paciente ou impressão.
          </span>
        </div>
      )}

      {/* FEEDBACK DE SALVAMENTO DE MODELO */}
      {templateFeedback && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{templateFeedback}</span>
        </div>
      )}

      {/* GRID PRINCIPAL: FORMULÁRIO + PRÉ-VISUALIZAÇÃO DA FOLHA */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: EDITOR CLÍNICO */}
        <div className="xl:col-span-7 space-y-5 pb-32">
          {/* SELETOR DO TIPO DE DOCUMENTO */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              1. Tipo de Documento Clínico
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DOC_TYPES.map((item) => {
                const Icon = item.icon;
                const active = tipo === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectType(item.id)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? "bg-teal-50/70 border-teal-600 ring-1 ring-teal-600/20"
                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`w-4 h-4 ${
                          active ? "text-teal-700" : "text-slate-500"
                        }`}
                      />
                      <span
                        className={`text-xs font-bold ${
                          active ? "text-teal-950" : "text-slate-800"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 leading-snug">
                      {item.shortDesc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* MODELOS RÁPIDOS DINÂMICOS + BOTÃO SALVAR MODELO */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <span className="text-[11px] font-semibold text-slate-500 mr-1">
                    Modelos rápidos:
                  </span>
                  {loadingTemplates ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Carregando modelos...</span>
                    </span>
                  ) : activeTemplates.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">
                      Nenhum modelo salvo nesta categoria ainda.
                    </span>
                  ) : (
                    activeTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 text-[11px] font-semibold border border-slate-200 hover:border-teal-200 transition-colors cursor-pointer"
                      >
                        {tpl.title}
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleOpenSaveModal}
                  disabled={isContentEmpty}
                  title={
                    isContentEmpty
                      ? "Digite ou carregue um texto antes de salvar um modelo"
                      : "Salvar texto atual como modelo reutilizável"
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-2.5 py-1 text-[11px] font-bold text-teal-700 shadow-2xs hover:bg-teal-50 hover:border-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 shrink-0" />
                  <span>+ Salvar Modelo Atual</span>
                </button>
              </div>

              {templatesError && (
                <p className="text-[11px] text-amber-700 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{templatesError}</span>
                </p>
              )}
            </div>
          </div>

          {/* CONTEÚDO CLÍNICO COM DADOS INJETADOS AUTOMATICAMENTE */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                2. Dados Automáticos & Conteúdo Clínico
              </span>
              {pacienteCpf ? (
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={incluirCpf}
                    onChange={(e) =>
                      setCpfPreference({
                        pacienteId,
                        enabled: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Incluir CPF ({pacienteCpf})</span>
                </label>
              ) : null}
            </div>

            {/* RESUMO AUTOMÁTICO (SEM INPUTS MANUAIS DE MÉDICO, PACIENTE OU DATA) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
              <div className="flex items-start gap-2">
                <UserCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Paciente
                  </span>
                  <span className="block font-bold text-slate-800 truncate">
                    {pacienteNome}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CalendarDays className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Data Atual
                  </span>
                  <span className="block font-bold text-slate-800">
                    {dataAtual}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <BadgeCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Médico / Clínica
                  </span>
                  <span className="block font-bold text-slate-800 truncate">
                    {doctorProfile.medicoNome}
                  </span>
                  <span className="block text-[10px] text-teal-700 font-semibold truncate">
                    {doctorProfile.crm} • {doctorProfile.clinicaNome}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Título / Subtítulo do Documento
              </label>
              <input
                type="text"
                value={tituloDocumento}
                onChange={(e) => setTituloDocumento(e.target.value)}
                onBlur={() => flushPendingDraft()}
                placeholder={currentTypeConfig.defaultTitle}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-600">
                  Texto Clínico ({currentTypeConfig.label})
                </label>
                <span className="text-[11px] text-slate-400">
                  {conteudo.length} caracteres
                </span>
              </div>

              {/* ATALHOS DE INSERÇÃO RÁPIDA (QUICK-ADD CHIPS) */}
              <div
                className="mb-2.5 p-3 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-2"
                aria-label={currentShortcutsConfig.label}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>{currentShortcutsConfig.label}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Clique para inserir ao final do texto
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {currentShortcutsConfig.items.map((shortcut) => (
                    <button
                      key={shortcut}
                      type="button"
                      onClick={() => handleInsertShortcut(shortcut)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-teal-600 shrink-0" />
                      <span>{shortcut}</span>
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                ref={textareaRef}
                rows={12}
                value={conteudo}
                onChange={(e) => {
                  latestConteudoRef.current = e.target.value;
                  setConteudo(e.target.value);
                }}
                onBlur={() => flushPendingDraft()}
                placeholder={currentTypeConfig.placeholder}
                className="w-full min-h-[300px] p-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-sans resize-y"
              />
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: PRÉ-VISUALIZAÇÃO ESTRUTURAL OU PDFVIEWER REAL */}
        <div className="xl:col-span-5 xl:sticky xl:top-0">
          <div className="bg-slate-200/70 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                {showPdfPreview
                  ? "Visualizador PDF Real (@react-pdf)"
                  : "Prévia Estrutural da Folha A4"}
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                {isDraftDirty ? "Sincronizando..." : "Pronto para emissão"}
              </span>
            </div>

            {showPdfPreview ? (
              <PdfViewerClient pdfProps={committedPayload} />
            ) : (
              <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
                {/* Faixa superior */}
                <div className="h-1.5 bg-teal-700" />
                <div className="h-0.5 bg-amber-500/70" />

                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* Cabeçalho */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-teal-700">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-12 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center p-1 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/logo-faaz.png"
                            alt="Logo Clínica FAAZ"
                            className="w-8 h-10 object-contain"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-black tracking-wider text-teal-800 uppercase">
                            {doctorProfile.clinicaNome}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Medicina & Saúde Integrativa
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">
                          {doctorProfile.medicoNome}
                        </div>
                        <div className="text-[10px] font-bold text-teal-700">
                          {doctorProfile.crm}
                        </div>
                        <div className="text-[9px] text-slate-500 max-w-[175px] ml-auto leading-tight mt-0.5">
                          {doctorProfile.especialidades}
                        </div>
                      </div>
                    </div>

                    {/* Badge do Tipo */}
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-[9px] font-bold text-teal-800 tracking-wider">
                        {currentTypeConfig.label.toUpperCase()}
                      </span>
                      {pacienteRecordCode && (
                        <span className="text-[10px] text-slate-400">
                          Prontuário: {pacienteRecordCode}
                        </span>
                      )}
                    </div>

                    {/* Bloco Paciente */}
                    <div className="bg-slate-50 border border-slate-200 border-l-4 border-l-teal-700 rounded-lg p-3 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">
                          Paciente
                        </span>
                        <span className="text-xs font-bold text-slate-900 block">
                          {pacienteNome}
                        </span>
                        {incluirCpf && pacienteCpf && (
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            CPF: {pacienteCpf}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">
                          Emissão
                        </span>
                        <span className="text-[11px] font-bold text-slate-800">
                          {dataAtual}
                        </span>
                      </div>
                    </div>

                    {/* Título & Conteúdo */}
                    <div>
                      <div className="text-xs font-bold text-teal-950 pb-1.5 mb-2 border-b border-slate-200">
                        {tituloDocumento || currentTypeConfig.defaultTitle}
                      </div>
                      <div className="text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[210px]">
                        {conteudo.trim() ? (
                          conteudo
                        ) : (
                          <span className="text-slate-400 italic">
                            Digite o texto do documento ao lado para compor o
                            PDF...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rodapé Fixo Preview */}
                  <div className="pt-8 mt-6 space-y-3">
                    <div className="flex flex-col items-center">
                      <div className="w-48 border-t border-slate-700 mb-1" />
                      <span className="text-[10px] font-bold text-slate-900">
                        {doctorProfile.medicoNome}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        {doctorProfile.crm} • {doctorProfile.especialidades}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-500 gap-2">
                      <span className="truncate">
                        {doctorProfile.clinicaContato}
                      </span>
                      <span className="shrink-0">Página 1 de 1</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DIALOG MODAL PARA SALVAR MODELO ATUAL NO BANCO */}
      <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BookmarkPlus className="w-4 h-4 text-teal-600" />
              <span>Salvar Novo Modelo Clínico</span>
            </DialogTitle>
            <DialogDescription>
              Salve o texto atual na categoria{" "}
              <strong>{currentTypeConfig.label}</strong> para reutilizar em um
              clique nos próximos atendimentos.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCurrentTemplate}>
            <div className="p-6 space-y-4">
              <div>
                <label
                  htmlFor="document-template-name"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Nome do Modelo
                </label>
                <Input
                  id="document-template-name"
                  noUppercase
                  autoFocus
                  maxLength={160}
                  value={newTemplateTitle}
                  onChange={(e) => setNewTemplateTitle(e.target.value)}
                  placeholder={
                    tipo === "RECEITUARIO"
                      ? "Ex: Protocolo Metabólico Base"
                      : tipo === "EXAMES"
                      ? "Ex: Check-up Endócrino Trimestral"
                      : "Ex: Afastamento Pós-Procedimento"
                  }
                />
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-700">
                  Prévia do conteúdo a salvar ({conteudo.trim().length} caracteres):
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap text-slate-500">
                  {conteudo.trim()}
                </p>
              </div>

              {saveTemplateError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveTemplateError}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                disabled={savingTemplate}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingTemplate}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {savingTemplate ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Modelo</span>
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
