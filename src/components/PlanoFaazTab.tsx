"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Award,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  User,
  FileText,
  Sparkles,
  Loader2,
  X,
  Save,
  Ban,
  Gift,
  Video,
  Building2,
  RotateCcw,
} from "lucide-react";
import {
  adicionarDiasDataBR,
  formatarHoraBR,
  getDataDiaBR,
} from "@/lib/date-br";
import { invalidateClientCache } from "@/lib/client-swr-cache";
import {
  formatIsoDateBr,
  labelStatusConsulta,
  labelStatusPacote,
  labelTipoConsulta,
  type ConsultaPacoteDTO,
  type PacoteResumoDTO,
  type PacotesPacienteResponse,
  type StatusConsultaPacote,
  type StatusPacoteAcompanhamento,
  type TipoConsultaPacote,
} from "@/lib/pacotes-faaz";

export interface PlanoFaazTabProps {
  pacienteId: string;
  pacienteNome: string;
  pacotesDataInicial?: PacotesPacienteResponse | null;
  onPacotesUpdated?: (next: PacotesPacienteResponse) => void;
  /** Modo administrativo (Recepção / Tela de Pacientes) oculta vínculos clínicos */
  modo?: "prontuario" | "administrativo";
}

interface PresetPlano {
  id: string;
  titulo: string;
  nomePlano: string;
  consultas: number;
  validadeDias: number | null;
  descricao: string;
  destaque?: boolean;
}

const PLANO_PRESETS: PresetPlano[] = [
  {
    id: "trimestral",
    titulo: "Trimestral",
    nomePlano: "Plano FAAZ Trimestral",
    consultas: 3,
    validadeDias: 90,
    descricao: "3 consultas · 90 dias",
  },
  {
    id: "semestral",
    titulo: "Semestral",
    nomePlano: "Plano FAAZ Semestral",
    consultas: 6,
    validadeDias: 180,
    descricao: "6 consultas · 180 dias",
    destaque: true,
  },
  {
    id: "anual",
    titulo: "Anual",
    nomePlano: "Plano FAAZ Anual",
    consultas: 12,
    validadeDias: 365,
    descricao: "12 consultas · 365 dias",
  },
  {
    id: "personalizado",
    titulo: "Personalizado",
    nomePlano: "",
    consultas: 4,
    validadeDias: 120,
    descricao: "Definir consultas e prazo",
  },
];

const MAX_PLACEHOLDERS_VISIVEIS = 12;

export function PlanoFaazTab({
  pacienteId,
  pacienteNome,
  pacotesDataInicial,
  onPacotesUpdated,
  modo = "prontuario",
}: PlanoFaazTabProps) {
  const isModoAdmin = modo === "administrativo";
  const [data, setData] = useState<PacotesPacienteResponse | null>(
    pacotesDataInicial ?? null
  );
  const [isLoading, setIsLoading] = useState(!pacotesDataInicial);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    tipo: "success" | "error";
  } | null>(null);

  // Acordeão de ciclos anteriores (fechado por padrão)
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // Modal Criar / Renovar / Editar Pacote
  const [modalPacoteModo, setModalPacoteModo] = useState<
    "criar" | "renovar" | "editar" | null
  >(null);
  const [pacoteEditandoId, setPacoteEditandoId] = useState<string | null>(null);
  const [pacoteEditandoRef, setPacoteEditandoRef] =
    useState<PacoteResumoDTO | null>(null);
  const [pacoteEditandoRealizadasOrig, setPacoteEditandoRealizadasOrig] =
    useState<number>(0);
  const [pacoteEditandoStatusOrig, setPacoteEditandoStatusOrig] =
    useState<StatusPacoteAcompanhamento>("ATIVO");
  const [formNomePlano, setFormNomePlano] = useState("");
  const [formQtdConsultas, setFormQtdConsultas] = useState("4");
  const [formConsultasRealizadas, setFormConsultasRealizadas] = useState("0");
  const [formStatusPacote, setFormStatusPacote] =
    useState<StatusPacoteAcompanhamento>("ATIVO");
  const [formDataInicio, setFormDataInicio] = useState("");
  const [formDataValidade, setFormDataValidade] = useState("");
  const [formObsPacote, setFormObsPacote] = useState("");
  const [formPacoteErro, setFormPacoteErro] = useState<string | null>(null);
  const [isSavingPacote, setIsSavingPacote] = useState(false);

  // Modal Registrar / Editar Consulta no Pacote
  const [modalConsultaModo, setModalConsultaModo] = useState<
    "registrar" | "editar" | null
  >(null);
  const [consultaPacoteAlvoId, setConsultaPacoteAlvoId] = useState<string | null>(
    null
  );
  const [consultaEditandoId, setConsultaEditandoId] = useState<string | null>(
    null
  );
  const [formDataConsulta, setFormDataConsulta] = useState("");
  const [formHoraConsulta, setFormHoraConsulta] = useState("");
  const [formTipoConsulta, setFormTipoConsulta] =
    useState<TipoConsultaPacote>("PRESENCIAL");
  const [formStatusConsulta, setFormStatusConsulta] =
    useState<StatusConsultaPacote>("REALIZADA");
  const [formProfissional, setFormProfissional] = useState("");
  const [formObsConsulta, setFormObsConsulta] = useState("");
  const [formConsultaErro, setFormConsultaErro] = useState<string | null>(null);
  const [isSavingConsulta, setIsSavingConsulta] = useState(false);

  // Confirmação de Estorno de Consulta ou Cancelamento de Pacote
  const [consultaParaEstornar, setConsultaParaEstornar] =
    useState<ConsultaPacoteDTO | null>(null);
  const [pacoteParaCancelar, setPacoteParaCancelar] =
    useState<PacoteResumoDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = useCallback(
    (msg: string, tipo: "success" | "error" = "success") => {
      setToast({ msg, tipo });
      setTimeout(() => setToast(null), 3500);
    },
    []
  );

  const aplicarResposta = useCallback(
    (json: PacotesPacienteResponse) => {
      setData(json);
      onPacotesUpdated?.(json);
    },
    [onPacotesUpdated]
  );

  const carregarPacotes = useCallback(
    async (silent = false) => {
      if (!pacienteId) return;
      try {
        if (!silent) setIsLoading(true);
        setErroCarga(null);
        const res = await fetch(`/api/pacientes/${pacienteId}/pacotes`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setErroCarga(
            json?.error || "Não foi possível carregar os pacotes do Plano FAAZ."
          );
          return;
        }
        aplicarResposta(json as PacotesPacienteResponse);
      } catch (err) {
        console.error("[PlanoFaazTab] Erro ao carregar pacotes:", err);
        setErroCarga("Falha de conexão ao carregar pacotes de acompanhamento.");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [pacienteId, aplicarResposta]
  );

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (!ativo) return;
      void carregarPacotes(Boolean(pacotesDataInicial));
    });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId]);

  // Helpers para abrir modais pré-preenchidos (fuso America/Sao_Paulo)
  function abrirModalCriarPacote(preset?: PresetPlano, isRenovacao = false) {
    const hoje = getDataDiaBR();
    const nome = preset?.nomePlano ?? "Plano FAAZ Trimestral";
    const qtd = preset?.consultas ?? 3;
    const validade =
      preset && preset.validadeDias
        ? adicionarDiasDataBR(hoje, preset.validadeDias)
        : !preset
          ? adicionarDiasDataBR(hoje, 90)
          : "";

    setPacoteEditandoId(null);
    setPacoteEditandoRef(null);
    setPacoteEditandoRealizadasOrig(0);
    setPacoteEditandoStatusOrig("ATIVO");
    setFormNomePlano(nome);
    setFormQtdConsultas(String(qtd));
    setFormConsultasRealizadas("0");
    setFormStatusPacote("ATIVO");
    setFormDataInicio(hoje);
    setFormDataValidade(validade);
    setFormObsPacote("");
    setFormPacoteErro(null);
    setModalPacoteModo(isRenovacao ? "renovar" : "criar");
  }

  function abrirModalRenovarComBase(pacoteBase: PacoteResumoDTO) {
    const hoje = getDataDiaBR();
    let validadeSugerida = adicionarDiasDataBR(hoje, 90);
    if (pacoteBase.dataInicio && pacoteBase.dataValidade) {
      const [iy, im, id] = pacoteBase.dataInicio.split("-").map(Number);
      const [vy, vm, vd] = pacoteBase.dataValidade.split("-").map(Number);
      const duracao = Math.round(
        (Date.UTC(vy, (vm || 1) - 1, vd || 1) -
          Date.UTC(iy, (im || 1) - 1, id || 1)) /
          (24 * 60 * 60 * 1000)
      );
      if (duracao >= 15 && duracao <= 730) {
        validadeSugerida = adicionarDiasDataBR(hoje, duracao);
      }
    }

    setPacoteEditandoId(null);
    setPacoteEditandoRef(null);
    setPacoteEditandoRealizadasOrig(0);
    setPacoteEditandoStatusOrig("ATIVO");
    setFormNomePlano(pacoteBase.nomePlano);
    setFormQtdConsultas(String(pacoteBase.qtdTotalConsultas));
    setFormConsultasRealizadas("0");
    setFormStatusPacote("ATIVO");
    setFormDataInicio(hoje);
    setFormDataValidade(validadeSugerida);
    setFormObsPacote(pacoteBase.observacoes || "");
    setFormPacoteErro(null);
    setModalPacoteModo("renovar");
  }

  function abrirModalEditarPacote(pacote: PacoteResumoDTO) {
    setPacoteEditandoId(pacote.id);
    setPacoteEditandoRef(pacote);
    setPacoteEditandoRealizadasOrig(pacote.consultasRealizadas);
    setPacoteEditandoStatusOrig(pacote.status);
    setFormNomePlano(pacote.nomePlano);
    setFormQtdConsultas(String(pacote.qtdTotalConsultas));
    setFormConsultasRealizadas(String(pacote.consultasRealizadas));
    setFormStatusPacote(pacote.status);
    setFormDataInicio(pacote.dataInicio);
    setFormDataValidade(pacote.dataValidade || "");
    setFormObsPacote(pacote.observacoes || "");
    setFormPacoteErro(null);
    setModalPacoteModo("editar");
  }

  function abrirModalRegistrarConsulta(pacote: PacoteResumoDTO) {
    setConsultaPacoteAlvoId(pacote.id);
    setConsultaEditandoId(null);
    setFormDataConsulta(getDataDiaBR());
    setFormHoraConsulta(formatarHoraBR(new Date()));
    setFormTipoConsulta("PRESENCIAL");
    setFormStatusConsulta("REALIZADA");
    setFormProfissional("");
    setFormObsConsulta("");
    setFormConsultaErro(null);
    setModalConsultaModo("registrar");
  }

  function abrirModalEditarConsulta(consulta: ConsultaPacoteDTO) {
    setConsultaPacoteAlvoId(consulta.pacoteId);
    setConsultaEditandoId(consulta.id);
    setFormDataConsulta(consulta.dataConsulta);
    setFormHoraConsulta(consulta.horaConsulta || "");
    setFormTipoConsulta(consulta.tipo);
    setFormStatusConsulta(consulta.status);
    setFormProfissional(consulta.profissionalNome || "");
    setFormObsConsulta(consulta.observacao || "");
    setFormConsultaErro(null);
    setModalConsultaModo("editar");
  }

  async function handleSalvarPacote(e: React.FormEvent) {
    e.preventDefault();
    setFormPacoteErro(null);

    const nomeLimpo = formNomePlano.trim();
    const qtd = Number.parseInt(formQtdConsultas, 10);
    const realizadas =
      formConsultasRealizadas.trim() === ""
        ? 0
        : Number.parseInt(formConsultasRealizadas, 10);

    if (!nomeLimpo) {
      setFormPacoteErro("Informe o nome do plano (ex.: Plano FAAZ Trimestral).");
      return;
    }
    if (!Number.isFinite(qtd) || qtd < 1 || qtd > 999) {
      setFormPacoteErro("Quantidade total de consultas deve estar entre 1 e 999.");
      return;
    }
    if (!Number.isFinite(realizadas) || realizadas < 0 || realizadas > qtd) {
      setFormPacoteErro(
        "Consultas realizadas deve estar entre 0 e o total de consultas do pacote."
      );
      return;
    }
    if (!formDataInicio) {
      setFormPacoteErro("Informe a data de início do pacote.");
      return;
    }
    if (formDataValidade && formDataValidade < formDataInicio) {
      setFormPacoteErro("A data de validade não pode ser anterior ao início.");
      return;
    }

    try {
      setIsSavingPacote(true);
      const isEdit = modalPacoteModo === "editar" && Boolean(pacoteEditandoId);
      const editPayload: Record<string, unknown> = {
        pacoteId: pacoteEditandoId,
        nomePlano: nomeLimpo,
        qtdTotalConsultas: qtd,
        dataInicio: formDataInicio,
        dataValidade: formDataValidade || null,
        observacoes: formObsPacote.trim() || null,
      };
      if (isEdit && realizadas !== pacoteEditandoRealizadasOrig) {
        editPayload.consultasRealizadas = realizadas;
      }
      if (isEdit && formStatusPacote !== pacoteEditandoStatusOrig) {
        editPayload.status = formStatusPacote;
      }

      const createPayload: Record<string, unknown> = {
        acao:
          modalPacoteModo === "renovar" ? "renovar_pacote" : "criar_pacote",
        nomePlano: nomeLimpo,
        qtdTotalConsultas: qtd,
        consultasRealizadas: realizadas,
        dataInicio: formDataInicio,
        dataValidade: formDataValidade || null,
        observacoes: formObsPacote.trim() || null,
      };
      if (formStatusPacote !== "ATIVO") {
        createPayload.status = formStatusPacote;
      }

      const res = await fetch(`/api/pacientes/${pacienteId}/pacotes`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? editPayload : createPayload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setFormPacoteErro(json?.error || "Erro ao salvar o pacote.");
        return;
      }

      aplicarResposta(json as PacotesPacienteResponse);
      invalidateClientCache("pacientes:");
      setModalPacoteModo(null);
      showToast(
        json.message ||
          (isEdit
            ? "Pacote atualizado com sucesso!"
            : "Pacote do Plano FAAZ salvo com sucesso!")
      );
    } catch (err) {
      console.error("[PlanoFaazTab] Erro ao salvar pacote:", err);
      setFormPacoteErro("Falha de comunicação ao salvar o pacote.");
    } finally {
      setIsSavingPacote(false);
    }
  }

  async function handleSalvarConsulta(e: React.FormEvent) {
    e.preventDefault();
    setFormConsultaErro(null);

    if (!formDataConsulta) {
      setFormConsultaErro("Informe a data da consulta.");
      return;
    }

    try {
      setIsSavingConsulta(true);
      const isEdit =
        modalConsultaModo === "editar" && Boolean(consultaEditandoId);

      const res = await fetch(`/api/pacientes/${pacienteId}/pacotes`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                consultaId: consultaEditandoId,
                dataConsulta: formDataConsulta,
                horaConsulta: formHoraConsulta || null,
                tipo: formTipoConsulta,
                status: formStatusConsulta,
                profissionalNome: formProfissional.trim() || null,
                observacao: formObsConsulta.trim() || null,
              }
            : {
                acao: "registrar_consulta",
                pacoteId: consultaPacoteAlvoId,
                dataConsulta: formDataConsulta,
                horaConsulta: formHoraConsulta || null,
                tipo: formTipoConsulta,
                status: formStatusConsulta,
                profissionalNome: formProfissional.trim() || undefined,
                observacao: formObsConsulta.trim() || null,
              }
        ),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setFormConsultaErro(json?.error || "Erro ao salvar a consulta.");
        return;
      }

      aplicarResposta(json as PacotesPacienteResponse);
      invalidateClientCache("pacientes:");
      setModalConsultaModo(null);
      showToast(
        json.message ||
          (isEdit
            ? "Consulta atualizada com sucesso!"
            : "Consulta registrada no extrato do pacote!")
      );
    } catch (err) {
      console.error("[PlanoFaazTab] Erro ao salvar consulta:", err);
      setFormConsultaErro("Falha de comunicação ao salvar a consulta.");
    } finally {
      setIsSavingConsulta(false);
    }
  }

  async function handleConfirmarEstornoConsulta() {
    if (!consultaParaEstornar) return;
    try {
      setIsDeleting(true);
      const res = await fetch(
        `/api/pacientes/${pacienteId}/pacotes?consultaId=${encodeURIComponent(
          consultaParaEstornar.id
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast(json?.error || "Erro ao estornar consulta.", "error");
        return;
      }

      aplicarResposta(json as PacotesPacienteResponse);
      invalidateClientCache("pacientes:");
      setConsultaParaEstornar(null);
      showToast(json.message || "Consulta estornada e saldo recalculado!");
    } catch (err) {
      console.error("[PlanoFaazTab] Erro ao estornar consulta:", err);
      showToast("Falha de comunicação ao estornar consulta.", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleConfirmarCancelarPacote() {
    if (!pacoteParaCancelar) return;
    try {
      setIsDeleting(true);
      const res = await fetch(
        `/api/pacientes/${pacienteId}/pacotes?pacoteId=${encodeURIComponent(
          pacoteParaCancelar.id
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        showToast(json?.error || "Erro ao cancelar pacote.", "error");
        return;
      }

      aplicarResposta(json as PacotesPacienteResponse);
      invalidateClientCache("pacientes:");
      setPacoteParaCancelar(null);
      setModalPacoteModo(null);
      showToast(json.message || "Pacote cancelado e arquivado no histórico.");
    } catch (err) {
      console.error("[PlanoFaazTab] Erro ao cancelar pacote:", err);
      showToast("Falha de comunicação ao cancelar pacote.", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center gap-3 p-8 text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
        <span className="text-xs font-semibold text-slate-600">
          Carregando controle de pacotes e consultas do Plano FAAZ...
        </span>
      </div>
    );
  }

  const pacoteAtivo = data?.pacoteAtivo ?? null;
  const ultimoConcluido = data?.ultimoPacoteConcluido ?? null;
  const historicoPacotes = data?.historicoPacotes ?? [];

  const renderTipoIcon = (tipo: TipoConsultaPacote) => {
    if (tipo === "ONLINE") return <Video className="w-3 h-3 text-sky-600" />;
    if (tipo === "RETORNO")
      return <RotateCcw className="w-3 h-3 text-teal-600" />;
    return <Building2 className="w-3 h-3 text-emerald-600" />;
  };

  const renderConsultaStatusBadge = (status: StatusConsultaPacote) => {
    if (status === "BONIFICADA") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
          <Gift className="w-2.5 h-2.5" />
          <span>Bonificada · Não desconta</span>
        </span>
      );
    }
    if (status === "FALTA_COBRADA") {
      return (
        <span className="cl-badge-amber px-2 py-0.5 text-[10px]">
          <AlertTriangle className="w-2.5 h-2.5" />
          <span>{labelStatusConsulta(status)}</span>
        </span>
      );
    }
    return (
      <span className="cl-badge-emerald px-2 py-0.5 text-[10px]">
        <CheckCircle2 className="w-2.5 h-2.5" />
        <span>{labelStatusConsulta(status)}</span>
      </span>
    );
  };

  const renderPacoteStatusBadge = (p: PacoteResumoDTO) => {
    if (p.status === "ATIVO") {
      if (p.vencido || p.consultasRestantes === 0) {
        return (
          <span className="cl-badge-rose px-2.5 py-0.5 text-[11px]">
            <AlertTriangle className="w-3 h-3" />
            <span>{p.vencido ? "Vencido · Renovar" : "Esgotado"}</span>
          </span>
        );
      }
      if (p.alertaRenovacao) {
        return (
          <span className="cl-badge-amber px-2.5 py-0.5 text-[11px]">
            <AlertTriangle className="w-3 h-3" />
            <span>Renovar em breve</span>
          </span>
        );
      }
      return (
        <span className="cl-badge-emerald px-2.5 py-0.5 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Ciclo Ativo</span>
        </span>
      );
    }
    if (p.status === "CONCLUIDO") {
      return (
        <span className="cl-badge-rose px-2.5 py-0.5 text-[11px]">
          <CheckCircle2 className="w-3 h-3" />
          <span>Concluído</span>
        </span>
      );
    }
    if (p.status === "RENOVADO") {
      return (
        <span className="cl-badge-teal px-2.5 py-0.5 text-[11px]">
          <RefreshCw className="w-3 h-3" />
          <span>Renovado</span>
        </span>
      );
    }
    return (
      <span className="cl-badge-slate px-2.5 py-0.5 text-[11px]">
        <Ban className="w-3 h-3" />
        <span>Cancelado</span>
      </span>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7 space-y-6 bg-slate-50/50">
      {/* TOAST CLINICAL LIGHT */}
      {toast && (
        <div
          className={`fixed top-16 right-8 z-50 cl-toast flex items-center gap-2 px-4 py-2.5 text-xs font-bold animate-in fade-in slide-in-from-top-4 ${
            toast.tipo === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : ""
          }`}
        >
          {toast.tipo === "error" ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* CABEÇALHO DA ABA PLANO FAAZ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Controle de Pacotes & Consultas • Plano FAAZ</span>
            </h2>
            {data?.membroPlanoFaaz && (
              <span className="cl-badge-emerald px-2 py-0.5 text-[10px]">
                <Sparkles className="w-3 h-3" />
                <span>Membro Plano FAAZ</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Gestão de saldo de consultas contratadas, extrato cronológico e renovações de {pacienteNome}.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pacoteAtivo ? (
            <>
              <button
                type="button"
                onClick={() => abrirModalRegistrarConsulta(pacoteAtivo)}
                className="cl-btn-primary px-4 py-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Registrar Consulta</span>
              </button>
              <button
                type="button"
                onClick={() => abrirModalRenovarComBase(pacoteAtivo)}
                className="cl-btn-secondary px-3.5 py-2 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Renovar Pacote</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                ultimoConcluido
                  ? abrirModalRenovarComBase(ultimoConcluido)
                  : abrirModalCriarPacote(PLANO_PRESETS[0], false)
              }
              className="cl-btn-primary px-4 py-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>
                {ultimoConcluido
                  ? "Renovar Pacote de Acompanhamento"
                  : "Criar Pacote de Acompanhamento"}
              </span>
            </button>
          )}
        </div>
      </div>

      {erroCarga && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{erroCarga}</span>
          </span>
          <button
            type="button"
            onClick={() => void carregarPacotes(false)}
            className="underline font-bold cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ESTADO A: PACOTE ATIVO CONFIGURADO                                   */}
      {/* ==================================================================== */}
      {pacoteAtivo ? (
        <div className="space-y-6">
          {/* CARD RESUMO DO CICLO ATUAL */}
          <div className="cl-card p-5 sm:p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                    {pacoteAtivo.nomePlano}
                  </h3>
                  {renderPacoteStatusBadge(pacoteAtivo)}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Início:{" "}
                    <strong className="text-slate-800 font-mono tabular-nums">
                      {formatIsoDateBr(pacoteAtivo.dataInicio)}
                    </strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Validade:{" "}
                    <strong className="text-slate-800 font-mono tabular-nums">
                      {pacoteAtivo.dataValidade
                        ? formatIsoDateBr(pacoteAtivo.dataValidade)
                        : "Sem vencimento"}
                    </strong>
                    {pacoteAtivo.diasParaVencer !== null && (
                      <span
                        className={`text-[11px] font-bold ${
                          pacoteAtivo.vencido
                            ? "text-rose-600"
                            : pacoteAtivo.diasParaVencer <= 15
                              ? "text-amber-700"
                              : "text-slate-400"
                        }`}
                      >
                        (
                        {pacoteAtivo.vencido
                          ? `expirado há ${Math.abs(pacoteAtivo.diasParaVencer)}d`
                          : pacoteAtivo.diasParaVencer === 0
                            ? "vence hoje"
                            : `${pacoteAtivo.diasParaVencer}d restantes`}
                        )
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* AÇÕES DO PACOTE */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => abrirModalEditarPacote(pacoteAtivo)}
                  className="cl-btn-secondary px-3 py-1.5 text-xs"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Editar Pacote</span>
                </button>
                <button
                  type="button"
                  onClick={() => abrirModalRenovarComBase(pacoteAtivo)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                    pacoteAtivo.alertaRenovacao || pacoteAtivo.vencido
                      ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-2xs"
                      : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Renovar Pacote</span>
                </button>
              </div>
            </div>

            {/* BARRA DE PROGRESSO + KPIs DE SALDO */}
            <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-black font-mono tabular-nums text-slate-900">
                    {pacoteAtivo.consultasRealizadas}
                    <span className="text-slate-400 font-bold text-lg">
                      /{pacoteAtivo.qtdTotalConsultas}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-slate-700">
                    {pacoteAtivo.consultasRealizadas} de{" "}
                    {pacoteAtivo.qtdTotalConsultas} realizadas •{" "}
                    {pacoteAtivo.consultasRestantes === 0
                      ? "Saldo encerrado"
                      : pacoteAtivo.consultasRestantes === 1
                        ? "Falta 1"
                        : `Faltam ${pacoteAtivo.consultasRestantes}`}
                  </span>
                  {pacoteAtivo.consultasBonificadas > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                      <Gift className="w-2.5 h-2.5" />
                      <span>
                        +{pacoteAtivo.consultasBonificadas} bonificada(s)
                      </span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-extrabold font-mono tabular-nums px-2.5 py-1 rounded-full border ${
                      pacoteAtivo.consultasRestantes === 0 || pacoteAtivo.vencido
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : pacoteAtivo.alertaRenovacao
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    {pacoteAtivo.consultasRestantes}{" "}
                    {pacoteAtivo.consultasRestantes === 1
                      ? "restante"
                      : "restantes"}
                  </span>
                  <span className="text-xs font-bold font-mono tabular-nums text-slate-500">
                    {pacoteAtivo.percentualUso}%
                  </span>
                </div>
              </div>

              <div className="w-full h-3 rounded-full bg-slate-200/80 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pacoteAtivo.vencido || pacoteAtivo.consultasRestantes === 0
                      ? "bg-rose-500"
                      : pacoteAtivo.alertaRenovacao
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${pacoteAtivo.percentualUso}%` }}
                />
              </div>

              {pacoteAtivo.motivoAlerta && (
                <div
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${
                    pacoteAtivo.vencido || pacoteAtivo.consultasRestantes === 0
                      ? "bg-rose-50/90 text-rose-800 border-rose-200"
                      : "bg-amber-50/90 text-amber-900 border-amber-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{pacoteAtivo.motivoAlerta}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => abrirModalRenovarComBase(pacoteAtivo)}
                    className="text-[11px] font-extrabold underline cursor-pointer shrink-0"
                  >
                    Iniciar renovação
                  </button>
                </div>
              )}
            </div>

            {pacoteAtivo.observacoes && (
              <div className="text-xs text-slate-600 bg-white border border-slate-200/80 rounded-xl px-3.5 py-2.5 leading-relaxed">
                <span className="font-bold text-slate-700">Observações: </span>
                {pacoteAtivo.observacoes}
              </div>
            )}
          </div>

          {/* EXTRATO VISUAL DAS CONSULTAS DO CICLO ATIVO */}
          <div className="cl-card overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Extrato de Consultas do Pacote
                </h3>
                <span className="cl-badge-slate px-2 py-0.5 text-[10px] font-mono tabular-nums">
                  {pacoteAtivo.consultas.length} lançada(s)
                </span>
              </div>

              <button
                type="button"
                onClick={() => abrirModalRegistrarConsulta(pacoteAtivo)}
                className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar Consulta</span>
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-2.5">
              {/* Consultas já realizadas / lançadas */}
              {pacoteAtivo.consultas.map((c) => (
                <div
                  key={c.id}
                  className="bg-white border border-slate-200/90 hover:border-emerald-300/80 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center font-mono text-xs font-black tabular-nums shrink-0 ${
                        c.descontaSaldo
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-sky-50 text-sky-700 border-sky-200"
                      }`}
                    >
                      #{c.numeroSequencial}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-900 font-mono tabular-nums">
                          {formatIsoDateBr(c.dataConsulta)}
                          {c.horaConsulta ? ` • ${c.horaConsulta}` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {renderTipoIcon(c.tipo)}
                          <span>{labelTipoConsulta(c.tipo)}</span>
                        </span>
                        {renderConsultaStatusBadge(c.status)}
                        {!isModoAdmin && c.evolucaoId && (
                          <span className="cl-badge-teal px-2 py-0.5 text-[10px]">
                            <FileText className="w-2.5 h-2.5" />
                            <span>Vinculada à evolução médica</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        {c.profissionalNome && (
                          <span className="inline-flex items-center gap-1 font-medium">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{c.profissionalNome}</span>
                          </span>
                        )}
                        {c.observacao && (
                          <span className="text-slate-500 truncate max-w-md" title={c.observacao}>
                            • {c.observacao}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações rápidas da consulta */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => abrirModalEditarConsulta(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer"
                      title="Editar dados desta consulta"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConsultaParaEstornar(c)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-500 bg-white hover:bg-rose-50 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
                      title="Estornar consulta lançada por engano"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Estornar</span>
                    </button>
                  </div>
                </div>
              ))}

              {/* Slots pontilhados representando as consultas ainda disponíveis no pacote */}
              {Array.from({
                length: Math.min(
                  pacoteAtivo.consultasRestantes,
                  MAX_PLACEHOLDERS_VISIVEIS
                ),
              }).map((_, i) => {
                const slotNum = pacoteAtivo.consultasRealizadas + i + 1;
                const isNext = i === 0;
                return (
                  <div
                    key={`slot-disponivel-${slotNum}`}
                    className="rounded-xl border border-dashed border-slate-300/90 bg-slate-50/50 px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center font-mono text-xs font-bold text-slate-400 tabular-nums shrink-0">
                        #{slotNum}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-500 block">
                          Consulta #{slotNum} • Disponível no pacote
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {isNext
                            ? "Próxima consulta disponível para agendamento ou baixa automática"
                            : "Saldo reservado neste ciclo"}
                        </span>
                      </div>
                    </div>

                    {isNext && (
                      <button
                        type="button"
                        onClick={() => abrirModalRegistrarConsulta(pacoteAtivo)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Registrar</span>
                      </button>
                    )}
                  </div>
                );
              })}

              {pacoteAtivo.consultasRestantes > MAX_PLACEHOLDERS_VISIVEIS && (
                <div className="text-center text-[11px] font-semibold text-slate-400 py-1">
                  + {pacoteAtivo.consultasRestantes - MAX_PLACEHOLDERS_VISIVEIS}{" "}
                  consulta(s) adicional(is) disponível(is) neste pacote
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* ESTADO B: SEM PACOTE ATIVO — PRESETS RÁPIDOS DE 1 CLIQUE           */
        /* ================================================================== */
        <div className="space-y-4">
          {ultimoConcluido && (
            <div className="rounded-2xl bg-amber-50/80 border border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-amber-950">
                    Ciclo anterior concluído: {ultimoConcluido.nomePlano} (
                    {ultimoConcluido.consultasRealizadas}/
                    {ultimoConcluido.qtdTotalConsultas} consultas)
                  </h3>
                  <p className="text-[11px] text-amber-800/90 mt-0.5">
                    Todas as consultas contratadas foram realizadas. Inicie uma renovação rápida para continuar o acompanhamento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => abrirModalRenovarComBase(ultimoConcluido)}
                className="cl-btn-primary px-4 py-2 text-xs shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Renovar Mesmo Plano</span>
              </button>
            </div>
          )}

          <div className="cl-card p-6 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  Nenhum pacote ativo para {pacienteNome}
                </h3>
                <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                  {isModoAdmin ? (
                    <>
                      Configure um programa ou pacote de consultas (ex.:{" "}
                      <strong>Plano FAAZ</strong>) para acompanhar saldo, vigência
                      e renovações diretamente pela recepção.
                    </>
                  ) : (
                    <>
                      Configure um pacote de acompanhamento do{" "}
                      <strong>Plano FAAZ</strong> para controlar automaticamente o
                      saldo de consultas realizadas, emitir alertas de renovação e
                      vincular baixas diretamente ao registro médico.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Presets de 1 clique */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PLANO_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    abrirModalCriarPacote(preset, Boolean(ultimoConcluido))
                  }
                  className={`text-left rounded-2xl p-4 border transition-all cursor-pointer group ${
                    preset.destaque
                      ? "bg-emerald-50/50 border-emerald-200 hover:border-emerald-400 hover:shadow-sm"
                      : "bg-slate-50/60 border-slate-200 hover:bg-white hover:border-emerald-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                      {preset.titulo}
                    </span>
                    {preset.destaque && (
                      <span className="cl-badge-emerald px-2 py-0.5 text-[9px]">
                        Mais usado
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 font-mono tabular-nums">
                    {preset.descricao}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                    <Plus className="w-3 h-3" />
                    <span>Selecionar</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  abrirModalCriarPacote(
                    PLANO_PRESETS[0],
                    Boolean(ultimoConcluido)
                  )
                }
                className="cl-btn-primary px-5 py-2.5 text-xs"
              >
                <Plus className="w-4 h-4 stroke-[2.4]" />
                <span>Criar Pacote de Acompanhamento</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* HISTÓRICO DE CICLOS ANTERIORES (ACORDEÃO FECHADO POR PADRÃO)         */}
      {/* ==================================================================== */}
      {historicoPacotes.length > 0 && (
        <div className="cl-card overflow-hidden">
          <button
            type="button"
            onClick={() => setHistoricoAberto((prev) => !prev)}
            className="w-full px-5 py-3.5 bg-slate-50/80 hover:bg-slate-100/70 transition-colors flex items-center justify-between gap-2 cursor-pointer text-left"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Histórico de Ciclos Anteriores
              </span>
              <span className="cl-badge-slate px-2 py-0.5 text-[10px] font-mono tabular-nums">
                {historicoPacotes.length}
              </span>
            </div>
            {historicoAberto ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {historicoAberto && (
            <div className="divide-y divide-slate-100 p-4 space-y-3">
              {historicoPacotes.map((ciclo) => (
                <div
                  key={ciclo.id}
                  className="pt-3 first:pt-0 space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900">
                          {ciclo.nomePlano}
                        </span>
                        {renderPacoteStatusBadge(ciclo)}
                        <span className="text-[11px] font-bold font-mono tabular-nums text-slate-600">
                          {ciclo.consultasRealizadas}/{ciclo.qtdTotalConsultas}{" "}
                          consultas
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {formatIsoDateBr(ciclo.dataInicio)}
                        {ciclo.dataValidade
                          ? ` → ${formatIsoDateBr(ciclo.dataValidade)}`
                          : " • Sem vencimento"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold text-slate-400">
                        {labelStatusPacote(ciclo.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirModalEditarPacote(ciclo)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-600 bg-white hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer"
                        title="Editar status, datas ou saldo deste pacote"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>

                  {ciclo.consultas.length > 0 && (
                    <div className="pl-3 border-l-2 border-slate-200 space-y-1.5">
                      {ciclo.consultas.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50/70 border border-slate-200/70 rounded-lg px-3 py-1.5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-slate-700 tabular-nums">
                              #{c.numeroSequencial} •{" "}
                              {formatIsoDateBr(c.dataConsulta)}
                              {c.horaConsulta ? ` ${c.horaConsulta}` : ""}
                            </span>
                            <span className="text-slate-500">
                              {labelTipoConsulta(c.tipo)}
                            </span>
                            {renderConsultaStatusBadge(c.status)}
                            {c.profissionalNome && (
                              <span className="text-slate-500">
                                ({c.profissionalNome})
                              </span>
                            )}
                          </div>
                          {ciclo.status === "CONCLUIDO" && (
                            <button
                              type="button"
                              onClick={() => setConsultaParaEstornar(c)}
                              className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                              title="Estornar consulta e reabrir ciclo"
                            >
                              Estornar
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: CRIAR / RENOVAR / EDITAR PACOTE                             */}
      {/* ==================================================================== */}
      {modalPacoteModo && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="cl-modal-header px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    {modalPacoteModo === "editar"
                      ? "Editar Pacote de Acompanhamento"
                      : modalPacoteModo === "renovar"
                        ? "Renovar Pacote • Plano FAAZ"
                        : "Novo Pacote • Plano FAAZ"}
                  </h3>
                  <p className="text-[11px] text-slate-500">{pacienteNome}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingPacote && setModalPacoteModo(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSalvarPacote} className="p-5 space-y-4 text-xs">
              {formPacoteErro && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 font-semibold text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formPacoteErro}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nome do Plano / Pacote *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formNomePlano}
                  onChange={(e) => setFormNomePlano(e.target.value)}
                  placeholder="Ex: Plano FAAZ Trimestral"
                  className="cl-input no-uppercase px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Total de Consultas *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    required
                    value={formQtdConsultas}
                    onChange={(e) => setFormQtdConsultas(e.target.value)}
                    className="cl-input px-3 py-2 text-xs font-bold font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Consultas Realizadas
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(1, Number.parseInt(formQtdConsultas, 10) || 999)}
                    value={formConsultasRealizadas}
                    onChange={(e) => setFormConsultasRealizadas(e.target.value)}
                    className="cl-input px-3 py-2 text-xs font-bold font-mono tabular-nums"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5 font-mono tabular-nums">
                    Saldo restante:{" "}
                    {Math.max(
                      0,
                      (Number.parseInt(formQtdConsultas, 10) || 0) -
                        (Number.parseInt(formConsultasRealizadas, 10) || 0)
                    )}{" "}
                    consulta(s)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Data de Início *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDataInicio}
                    onChange={(e) => setFormDataInicio(e.target.value)}
                    className="cl-input px-3 py-2 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Validade (Opcional)
                  </label>
                  <input
                    type="date"
                    value={formDataValidade}
                    onChange={(e) => setFormDataValidade(e.target.value)}
                    className="cl-input px-3 py-2 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Status do Pacote *
                  </label>
                  <select
                    value={formStatusPacote}
                    onChange={(e) =>
                      setFormStatusPacote(
                        e.target.value as StatusPacoteAcompanhamento
                      )
                    }
                    className="cl-input px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <option value="ATIVO">Ativo</option>
                    <option value="CONCLUIDO">Concluído (Encerrado)</option>
                    <option value="RENOVADO">Renovado (Encerrado)</option>
                    <option value="CANCELADO">Cancelado</option>
                  </select>
                </div>
              </div>

              {/* Atalhos rápidos de prazo a partir da data de início */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 mr-1">
                  Prazo rápido:
                </span>
                {[
                  { label: "+90 dias", dias: 90 },
                  { label: "+180 dias", dias: 180 },
                  { label: "+365 dias", dias: 365 },
                ].map((opt) => (
                  <button
                    key={opt.dias}
                    type="button"
                    onClick={() =>
                      setFormDataValidade(
                        adicionarDiasDataBR(
                          formDataInicio || getDataDiaBR(),
                          opt.dias
                        )
                      )
                    }
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 transition-colors cursor-pointer"
                  >
                    {opt.label}
                  </button>
                ))}
                {formDataValidade && (
                  <button
                    type="button"
                    onClick={() => setFormDataValidade("")}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 underline ml-1 cursor-pointer"
                  >
                    Limpar validade
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Observações Administrativas do Pacote (Opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={formObsPacote}
                  onChange={(e) => setFormObsPacote(e.target.value)}
                  placeholder="Ex: Condições comerciais, forma de contratação ou lembrete de renovação..."
                  className="cl-input no-uppercase px-3 py-2 text-xs resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                {modalPacoteModo === "editar" &&
                pacoteEditandoRef &&
                pacoteEditandoRef.status !== "CANCELADO" ? (
                  <button
                    type="button"
                    onClick={() => setPacoteParaCancelar(pacoteEditandoRef)}
                    disabled={isSavingPacote}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancelar pacote</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">
                    Ativa automaticamente a flag Membro Plano FAAZ
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalPacoteModo(null)}
                    disabled={isSavingPacote}
                    className="cl-btn-secondary px-3.5 py-2 text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPacote}
                    className="cl-btn-primary px-4 py-2 text-xs"
                  >
                    {isSavingPacote ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>
                          {modalPacoteModo === "editar"
                            ? "Salvar Alterações"
                            : modalPacoteModo === "renovar"
                              ? "Confirmar Renovação"
                              : "Criar Pacote"}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: REGISTRAR / EDITAR CONSULTA NO PACOTE                       */}
      {/* ==================================================================== */}
      {modalConsultaModo && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="cl-modal-header px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    {modalConsultaModo === "editar"
                      ? "Editar Consulta do Pacote"
                      : "Registrar Consulta no Pacote"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {pacoteAtivo?.nomePlano || "Plano FAAZ"} • {pacienteNome}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingConsulta && setModalConsultaModo(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSalvarConsulta}
              className="p-5 space-y-4 text-xs"
            >
              {formConsultaErro && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 font-semibold text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formConsultaErro}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Data da Consulta *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDataConsulta}
                    onChange={(e) => setFormDataConsulta(e.target.value)}
                    className="cl-input px-3 py-2 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Horário (Opcional)
                  </label>
                  <input
                    type="time"
                    value={formHoraConsulta}
                    onChange={(e) => setFormHoraConsulta(e.target.value)}
                    className="cl-input px-3 py-2 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tipo de Atendimento *
                  </label>
                  <select
                    value={formTipoConsulta}
                    onChange={(e) =>
                      setFormTipoConsulta(e.target.value as TipoConsultaPacote)
                    }
                    className="cl-input px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <option value="PRESENCIAL">Presencial</option>
                    <option value="ONLINE">Online (Telemedicina)</option>
                    <option value="RETORNO">Retorno</option>
                    <option value="AVALIACAO">Avaliação</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Status / Regra de Saldo *
                  </label>
                  <select
                    value={formStatusConsulta}
                    onChange={(e) =>
                      setFormStatusConsulta(
                        e.target.value as StatusConsultaPacote
                      )
                    }
                    className="cl-input px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <option value="REALIZADA">
                      Realizada (desconta do saldo)
                    </option>
                    <option value="FALTA_COBRADA">
                      Falta cobrada (desconta do saldo)
                    </option>
                    <option value="BONIFICADA">
                      Bonificada / Cortesia (não desconta)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Profissional Responsável (Opcional — usa usuário logado se vazio)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={formProfissional}
                  onChange={(e) => setFormProfissional(e.target.value)}
                  placeholder="Deixe em branco para usar o profissional da sessão"
                  className="cl-input no-uppercase px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Observação (Opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={formObsConsulta}
                  onChange={(e) => setFormObsConsulta(e.target.value)}
                  placeholder="Ex: Consulta de acompanhamento mensal + revisão de exames"
                  className="cl-input no-uppercase px-3 py-2 text-xs resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalConsultaModo(null)}
                  disabled={isSavingConsulta}
                  className="cl-btn-secondary px-3.5 py-2 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingConsulta}
                  className="cl-btn-primary px-4 py-2 text-xs"
                >
                  {isSavingConsulta ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        {modalConsultaModo === "editar"
                          ? "Salvar Consulta"
                          : "Registrar no Extrato"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: CONFIRMAÇÃO DE ESTORNO DE CONSULTA                          */}
      {/* ==================================================================== */}
      {consultaParaEstornar && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Estornar Consulta #{consultaParaEstornar.numeroSequencial}?
                </h3>
                <p className="text-xs text-slate-500">
                  A consulta será removida do extrato e o saldo do pacote será recalculado automaticamente.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 space-y-1">
              <div>
                <strong>Data:</strong>{" "}
                {formatIsoDateBr(consultaParaEstornar.dataConsulta)}
                {consultaParaEstornar.horaConsulta
                  ? ` às ${consultaParaEstornar.horaConsulta}`
                  : ""}
              </div>
              <div>
                <strong>Tipo:</strong>{" "}
                {labelTipoConsulta(consultaParaEstornar.tipo)} •{" "}
                {labelStatusConsulta(consultaParaEstornar.status)}
              </div>
              {consultaParaEstornar.profissionalNome && (
                <div>
                  <strong>Profissional:</strong>{" "}
                  {consultaParaEstornar.profissionalNome}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConsultaParaEstornar(null)}
                disabled={isDeleting}
                className="cl-btn-secondary px-3.5 py-1.5 text-xs"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEstornoConsulta}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Sim, Estornar Consulta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: CONFIRMAÇÃO DE CANCELAMENTO DE PACOTE                       */}
      {/* ==================================================================== */}
      {pacoteParaCancelar && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Cancelar pacote {pacoteParaCancelar.nomePlano}?
                </h3>
                <p className="text-xs text-slate-500">
                  O pacote será movido para o Histórico de Ciclos Anteriores como Cancelado (os registros já feitos não são apagados).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPacoteParaCancelar(null)}
                disabled={isDeleting}
                className="cl-btn-secondary px-3.5 py-1.5 text-xs"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmarCancelarPacote}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Sim, Cancelar Pacote</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
