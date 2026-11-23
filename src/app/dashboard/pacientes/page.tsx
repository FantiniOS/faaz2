"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Users,
  Phone,
  MapPin,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Building,
  UserCheck,
  RefreshCw,
  Send,
  FileText,
  Calendar,
  Award,
} from "lucide-react";
import { TopMenu } from "@/components/TopMenu";
import { mockUserSession } from "@/mocks/dashboard";
import { ProntuarioModal } from "@/components/ProntuarioModal";
import { PacotePacienteModal } from "@/components/PacotePacienteModal";
import { podeGerenciarPacotes } from "@/lib/auth-rbac";
import {
  formatIsoDateBr,
  type PacoteAtivoResumoListaDTO,
  type PacotesPacienteResponse,
} from "@/lib/pacotes-faaz";
import {
  getClientCache,
  invalidateClientCache,
  setClientCache,
} from "@/lib/client-swr-cache";

export interface MedicoResponsavelOption {
  id: string;
  nome: string;
  especialidade: string | null;
  crm: string | null;
}

export interface PacienteCadastral {
  id: string;
  recordCode?: string;
  nome: string;
  cpf: string;
  rg?: string;
  dataNascimento?: string;
  sexo?: string;
  estadoCivil?: string;
  profissao?: string;
  convenio?: string;
  planoFaaz?: boolean;
  pacoteAtivo?: PacoteAtivoResumoListaDTO | null;
  status?: string;
  telefoneWhatsapp: string;
  telefoneSecundario?: string;
  email?: string;
  contatoEmergenciaNome?: string;
  contatoEmergenciaTelefone?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  medicoResponsavelId?: string | null;
  medicoResponsavel?: MedicoResponsavelOption | null;
  metaHidricaMl?: number;
  avatarUrl?: string | null;
  criadoEm?: string;
}

export default function PacientesPage() {
  // Inicialização 100% determinística idêntica ao SSR (cache SWR hidrata em useEffect)
  const [pacientes, setPacientes] = useState<PacienteCadastral[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [apenasMembrosFaaz, setApenasMembrosFaaz] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Estado do Modal Compacto de Cadastro / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCepLoading, setIsCepLoading] = useState(false);

  // Perfil RBAC do Usuário Logado
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserCargo, setCurrentUserCargo] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Médicos responsáveis da clínica (populado dinamicamente via API)
  const [medicosClinica, setMedicosClinica] = useState<MedicoResponsavelOption[]>([]);

  // Estado do Modal de Prontuário Clínico (Ficha Digital)
  const [selectedPatientForProntuario, setSelectedPatientForProntuario] = useState<PacienteCadastral | null>(null);
  const [isProntuarioOpen, setIsProntuarioOpen] = useState(false);

  // Estado do Modal Administrativo de Programa & Pacote de Consultas (Secretária, Médico, Admin e Dono)
  const [selectedPatientForPacote, setSelectedPatientForPacote] = useState<PacienteCadastral | null>(null);
  const [isPacoteModalOpen, setIsPacoteModalOpen] = useState(false);

  // Estado para exclusão com confirmação (Somente Dono/Admin)
  const [patientToDelete, setPatientToDelete] = useState<PacienteCadastral | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Campos do Formulário Compacto
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [sexo, setSexo] = useState("MALE");
  const [estadoCivil, setEstadoCivil] = useState("Solteiro(a)");
  const [profissao, setProfissao] = useState("");
  const [convenio, setConvenio] = useState("Particular");
  const [planoFaaz, setPlanoFaaz] = useState(false);
  const [status, setStatus] = useState("Ativo");
  const [medicoResponsavelId, setMedicoResponsavelId] = useState("");

  // Contato
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState("");
  const [telefoneSecundario, setTelefoneSecundario] = useState("");
  const [email, setEmail] = useState("");
  const [contatoEmergenciaNome, setContatoEmergenciaNome] = useState("");
  const [contatoEmergenciaTelefone, setContatoEmergenciaTelefone] = useState("");

  // Endereço
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");

  const numeroInputRef = useRef<HTMLInputElement>(null);
  const hasCheckedUrlParamRef = useRef<boolean>(false);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  // Carrega pacientes da API com cache SWR em memória (~30s) para navegação instantânea
  async function loadPacientes(isInitial = false, forceBypassCache = false) {
    const cacheKey = "pacientes:list";
    const medicosCacheKey = "medicos:responsaveis";

    if (!forceBypassCache) {
      const cachedMedicos = getClientCache<MedicoResponsavelOption[]>(medicosCacheKey, 60_000);
      if (cachedMedicos?.data) {
        setMedicosClinica(cachedMedicos.data);
      }
      const cached = getClientCache<PacienteCadastral[]>(cacheKey);
      if (cached) {
        setPacientes(cached.data);
        setIsLoading(false);
        if (cached.isFresh) {
          return;
        }
      }
    }

    try {
      if (isInitial && !getClientCache(cacheKey)) setIsLoading(true);
      const res = await fetch("/api/pacientes", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.pacientes) {
        setClientCache(cacheKey, json.pacientes as PacienteCadastral[]);
        setPacientes(json.pacientes);
      }
      if (Array.isArray(json.medicos)) {
        setClientCache(medicosCacheKey, json.medicos as MedicoResponsavelOption[]);
        setMedicosClinica(json.medicos as MedicoResponsavelOption[]);
      }
    } catch (err) {
      console.error("[PacientesPage] Erro ao carregar pacientes:", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    let ativo = true;

    async function inicializar() {
      await Promise.resolve();
      if (!ativo) return;
      void loadPacientes(true, false);

      // Garante lista de médicos responsáveis mesmo se pacientes:list veio do cache SWR
      const cachedMedicos = getClientCache<MedicoResponsavelOption[]>(
        "medicos:responsaveis",
        60_000,
      );
      if (cachedMedicos?.isFresh) {
        setMedicosClinica(cachedMedicos.data);
      } else {
        fetch("/api/medicos/responsaveis", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (ativo && Array.isArray(data?.medicos)) {
              setClientCache(
                "medicos:responsaveis",
                data.medicos as MedicoResponsavelOption[],
              );
              setMedicosClinica(data.medicos as MedicoResponsavelOption[]);
            }
          })
          .catch(() => {});
      }

      const cachedAuth = getClientCache<{
        userId?: string;
        cargo?: string;
        role?: string;
      }>("auth:me", 60_000);
      if (cachedAuth?.isFresh && cachedAuth.data.userId) {
        setCurrentUserId(cachedAuth.data.userId);
        if (cachedAuth.data.cargo) setCurrentUserCargo(cachedAuth.data.cargo);
        if (cachedAuth.data.role) setCurrentUserRole(cachedAuth.data.role);
        return;
      }

      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((data) => {
          if (!ativo) return;
          if (data.autenticado && data.usuario) {
            const uid = data.usuario.userId || data.usuario.id || null;
            setClientCache("auth:me", {
              userId: uid || undefined,
              cargo: data.usuario.cargo,
              role: data.usuario.role,
            });
            if (uid) setCurrentUserId(uid);
            if (data.usuario.cargo) setCurrentUserCargo(data.usuario.cargo);
            if (data.usuario.role) setCurrentUserRole(data.usuario.role);
          }
        })
        .catch(() => {});
    }

    void inicializar();
    return () => {
      ativo = false;
    };
  }, []);

  // Regras de RBAC e LGPD
  const isSecretaria =
    currentUserCargo === "SECRETARIA" || currentUserRole === "RECEPTIONIST";

  // O botão e acesso ao Prontuário Clínico SÓ é renderizado se o perfil for MÉDICO ou ADMIN (Dono da Clínica, Médico ou Administrador)
  // Secretária é estritamente bloqueada pela LGPD
  const canAccessProntuario =
    !isSecretaria &&
    (currentUserCargo === "MEDICO" ||
      currentUserCargo === "DONO_CLINICA" ||
      currentUserCargo === "ADMINISTRADOR" ||
      currentUserRole === "DOCTOR" ||
      currentUserRole === "ADMIN" ||
      currentUserRole === "CLINIC_ADMIN");

  const canDelete =
    currentUserCargo === "DONO_CLINICA" ||
    currentUserCargo === "ADMINISTRADOR" ||
    currentUserRole === "ADMIN" ||
    currentUserRole === "CLINIC_ADMIN";

  // Gestão administrativa de programas/pacotes de consultas (visível para Secretária, Médico, Admin e Dono da Clínica)
  const canManagePacotes =
    podeGerenciarPacotes(currentUserCargo) ||
    podeGerenciarPacotes(currentUserRole);

  // Sincroniza imediatamente o selo do pacote na linha do paciente após alteração no Modal de Pacotes
  function handlePacotesPacienteUpdated(
    pacienteId: string,
    next: PacotesPacienteResponse
  ) {
    const ativo = next.pacoteAtivo;
    const resumoLista: PacoteAtivoResumoListaDTO | null = ativo
      ? {
          id: ativo.id,
          nomePlano: ativo.nomePlano,
          qtdTotalConsultas: ativo.qtdTotalConsultas,
          consultasRealizadas: ativo.consultasRealizadas,
          consultasRestantes: ativo.consultasRestantes,
          dataInicio: ativo.dataInicio,
          dataValidade: ativo.dataValidade,
          status: ativo.status,
          diasParaVencer: ativo.diasParaVencer,
          vencido: ativo.vencido,
          alertaRenovacao: ativo.alertaRenovacao,
        }
      : null;

    setPacientes((prev) => {
      const updated = prev.map((item) =>
        item.id === pacienteId
          ? {
              ...item,
              planoFaaz: next.membroPlanoFaaz,
              pacoteAtivo: resumoLista,
            }
          : item
      );
      setClientCache("pacientes:list", updated);
      return updated;
    });
  }

  // Abre automaticamente o Prontuário quando redirecionado da Agenda (?prontuarioId=...)
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      pacientes.length === 0 ||
      hasCheckedUrlParamRef.current ||
      currentUserCargo === null
    ) {
      return;
    }

    hasCheckedUrlParamRef.current = true;
    const params = new URLSearchParams(window.location.search);

    let ativo = true;
    void Promise.resolve().then(() => {
      if (!ativo) return;

      // Se solicitado abertura de novo cadastro via Command Palette (?novo=true)
      if (params.get("novo") === "true") {
        handleOpenNewModal();
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      const searchParam = params.get("q") || params.get("search");
      if (searchParam) {
        setSearchQuery(searchParam);
      }

      // Se for secretária, NÃO abre o prontuário por compliance da LGPD
      if (isSecretaria || !canAccessProntuario) {
        return;
      }

      const prontuarioId =
        params.get("prontuarioId") || params.get("pacienteId");
      if (prontuarioId) {
        const target = pacientes.find((p) => p.id === prontuarioId);
        if (target) {
          setSelectedPatientForProntuario(target);
          setIsProntuarioOpen(true);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    });

    return () => {
      ativo = false;
    };
  }, [pacientes, currentUserCargo, currentUserRole, isSecretaria, canAccessProntuario]);

  async function handleConfirmDelete() {
    if (!patientToDelete) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/pacientes/${patientToDelete.id}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Acesso negado para exclusão.");
        return;
      }

      showToast(`Paciente '${patientToDelete.nome}' excluído com sucesso!`);
      setPatientToDelete(null);
      invalidateClientCache("pacientes:list");
      invalidateClientCache("telemetria:");
      void loadPacientes(false, true);
    } catch (err) {
      console.error("Erro ao excluir paciente:", err);
      alert("Erro ao excluir paciente.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Formatação de Máscaras
  function formatCpf(val: string) {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function formatPhone(val: string) {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10)
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function formatCep(val: string) {
    const digits = val.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  // Gera link do WhatsApp (wa.me/55...)
  function getWhatsAppLink(phone: string | null | undefined): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (!digits || digits.length < 8) return null;
    const cleanNumber = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
    return `https://wa.me/${cleanNumber}`;
  }

  // Normalização de texto para busca sem acentos e minúscula
  function normalizeSearch(text: string | null | undefined): string {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  // Busca Automática por CEP via ViaCEP
  async function handleCepChange(rawVal: string) {
    const formatted = formatCep(rawVal);
    setCep(formatted);

    const cleanCep = rawVal.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      try {
        setIsCepLoading(true);
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setLogradouro(data.logradouro || "");
          setBairro(data.bairro || "");
          setCidade(data.localidade || "");
          setEstado(data.uf || "");
          // Foca direto no campo número
          setTimeout(() => {
            numeroInputRef.current?.focus();
          }, 100);
        }
      } catch (e) {
        console.error("Erro ao consultar ViaCEP:", e);
      } finally {
        setIsCepLoading(false);
      }
    }
  }

  // Abertura do Modal de Cadastro
  function handleOpenNewModal() {
    setEditingId(null);
    setNome("");
    setCpf("");
    setRg("");
    setDataNascimento("");
    setSexo("MALE");
    setEstadoCivil("Solteiro(a)");
    setProfissao("");
    setConvenio("Particular");
    setPlanoFaaz(false);
    setStatus("Ativo");
    // Pré-seleciona o médico logado quando ele faz parte do corpo clínico
    const medicoLogado =
      currentUserId && medicosClinica.some((m) => m.id === currentUserId)
        ? currentUserId
        : "";
    setMedicoResponsavelId(medicoLogado);
    setTelefoneWhatsapp("");
    setTelefoneSecundario("");
    setEmail("");
    setContatoEmergenciaNome("");
    setContatoEmergenciaTelefone("");
    setCep("");
    setLogradouro("");
    setNumero("");
    setComplemento("");
    setBairro("");
    setCidade("");
    setEstado("");
    setIsModalOpen(true);
  }

  // Abertura do Modal para Edição
  function handleOpenEditModal(p: PacienteCadastral) {
    setEditingId(p.id);
    setNome(p.nome);
    setCpf(p.cpf ? formatCpf(p.cpf) : "");
    setRg(p.rg || "");
    setDataNascimento(p.dataNascimento || "");
    setSexo(p.sexo || "MALE");
    setEstadoCivil(p.estadoCivil || "Solteiro(a)");
    setProfissao(p.profissao || "");
    setConvenio(p.convenio || "Particular");
    setPlanoFaaz(Boolean(p.planoFaaz || p.convenio === "Plano FAAZ"));
    setStatus(p.status || "Ativo");
    setMedicoResponsavelId(p.medicoResponsavelId || "");
    setTelefoneWhatsapp(p.telefoneWhatsapp ? formatPhone(p.telefoneWhatsapp) : "");
    setTelefoneSecundario(p.telefoneSecundario ? formatPhone(p.telefoneSecundario) : "");
    setEmail(p.email || "");
    setContatoEmergenciaNome(p.contatoEmergenciaNome || "");
    setContatoEmergenciaTelefone(
      p.contatoEmergenciaTelefone ? formatPhone(p.contatoEmergenciaTelefone) : ""
    );
    setCep(p.cep ? formatCep(p.cep) : "");
    setLogradouro(p.logradouro || "");
    setNumero(p.numero || "");
    setComplemento(p.complemento || "");
    setBairro(p.bairro || "");
    setCidade(p.cidade || "");
    setEstado(p.estado || "");
    setIsModalOpen(true);
  }

  // Submissão do Formulário Compacto
  async function handleSavePaciente(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !telefoneWhatsapp.trim()) {
      alert("Por favor, preencha o Nome e o WhatsApp do paciente.");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        id: editingId,
        nome: nome.trim().toUpperCase(),
        cpf: cpf.replace(/\D/g, ""),
        rg: rg.trim().toUpperCase(),
        dataNascimento: dataNascimento || null,
        sexo,
        estadoCivil,
        profissao: profissao.trim().toUpperCase(),
        convenio,
        planoFaaz,
        status,
        medicoResponsavelId: medicoResponsavelId || null,
        telefoneWhatsapp: telefoneWhatsapp.trim(),
        telefoneSecundario: telefoneSecundario.trim(),
        email: email.trim(), // Regra: E-mail não é forçado em uppercase
        contatoEmergenciaNome: contatoEmergenciaNome.trim().toUpperCase(),
        contatoEmergenciaTelefone: contatoEmergenciaTelefone.trim(),
        cep: cep.trim(),
        logradouro: logradouro.trim().toUpperCase(),
        numero: numero.trim().toUpperCase(),
        complemento: complemento.trim().toUpperCase(),
        bairro: bairro.trim().toUpperCase(),
        cidade: cidade.trim().toUpperCase(),
        estado: estado.trim().toUpperCase(),
        metaHidricaMl: 2500, // Invisível no formulário conforme diretriz
      };

      const res = await fetch("/api/pacientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Erro ao salvar paciente.");
        return;
      }

      setIsModalOpen(false);
      if (editingId && selectedPatientForProntuario?.id === editingId) {
        const medicoObj =
          medicosClinica.find((m) => m.id === medicoResponsavelId) ?? null;
        setSelectedPatientForProntuario((prev) =>
          prev
            ? {
                ...prev,
                nome: payload.nome,
                convenio: payload.convenio,
                planoFaaz: payload.planoFaaz,
                status: payload.status,
                medicoResponsavelId: medicoResponsavelId || null,
                medicoResponsavel: medicoObj,
              }
            : null,
        );
      }
      showToast(editingId ? "Paciente atualizado com sucesso!" : "Paciente cadastrado com sucesso!");
      invalidateClientCache("pacientes:list");
      invalidateClientCache("telemetria:");
      void loadPacientes(false, true);
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro de comunicação ao salvar paciente.");
    } finally {
      setIsSaving(false);
    }
  }

  // Filtro de Busca em Tempo Real + Filtro Rápido "Ver Membros FAAZ"
  const filteredPacientes = useMemo(() => {
    const baseList = apenasMembrosFaaz
      ? pacientes.filter((p) => Boolean(p.planoFaaz))
      : pacientes;

    const rawQuery = searchQuery.trim();
    if (!rawQuery) return baseList;

    const qNorm = normalizeSearch(rawQuery);
    const qDigits = rawQuery.replace(/\D/g, "");

    return baseList.filter((p) => {
      // 1. Busca por Nome (sem diferenciar maiúsculas ou acentos)
      const nomeNorm = normalizeSearch(p.nome);
      const matchNome = nomeNorm.includes(qNorm);

      // 2. Busca por CPF (busca flexível com ou sem pontuação)
      const cpfDigits = (p.cpf || "").replace(/\D/g, "");
      const cpfFormatado = p.cpf ? formatCpf(p.cpf) : "";
      const matchCpf =
        (p.cpf || "").toLowerCase().includes(qNorm) ||
        cpfFormatado.toLowerCase().includes(qNorm) ||
        (qDigits.length > 0 && cpfDigits.includes(qDigits));

      // 3. Busca por Telefone / WhatsApp (busca com ou sem DDD, máscara ou dígitos)
      const telDigits = (p.telefoneWhatsapp || "").replace(/\D/g, "");
      const telFormatado = p.telefoneWhatsapp ? formatPhone(p.telefoneWhatsapp) : "";
      const matchTel =
        (p.telefoneWhatsapp || "").toLowerCase().includes(qNorm) ||
        telFormatado.toLowerCase().includes(qNorm) ||
        (qDigits.length > 0 && telDigits.includes(qDigits));

      // 4. Busca por Código de Prontuário
      const matchRecordCode = normalizeSearch(p.recordCode).includes(qNorm);

      // 5. Busca por Cidade, Bairro, Convênio ou Programa/Pacote
      const matchEnd =
        normalizeSearch(p.cidade).includes(qNorm) ||
        normalizeSearch(p.bairro).includes(qNorm);
      const matchConv = normalizeSearch(p.convenio).includes(qNorm);
      const matchPacote =
        normalizeSearch(p.pacoteAtivo?.nomePlano).includes(qNorm) ||
        (!p.pacoteAtivo && "avulso".includes(qNorm));

      return (
        matchNome ||
        matchCpf ||
        matchTel ||
        matchRecordCode ||
        matchEnd ||
        matchConv ||
        matchPacote
      );
    });
  }, [pacientes, searchQuery, apenasMembrosFaaz]);

  return (
    <div className="min-h-screen cl-page flex flex-col font-sans">
      <TopMenu user={mockUserSession} activePath="/dashboard/pacientes" />

      {/* ÁREA PRINCIPAL — CLINICAL LIGHT */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">
        {/* CABEÇALHO DE COMANDO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="cl-badge-emerald px-2.5 py-0.5 text-[10px] uppercase tracking-widest">
                <Users className="w-3 h-3" />
                <span>Base Cadastral • Clínica FAAZ</span>
              </span>
              <span className="cl-badge-slate px-2.5 py-0.5 text-[11px] font-mono tabular-nums">
                {pacientes.length} {pacientes.length === 1 ? "paciente" : "pacientes"}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Cadastro de Pacientes
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Gestão cadastral com dados pessoais, contatos e endereço integrado ao ViaCEP.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setApenasMembrosFaaz((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
                apenasMembrosFaaz
                  ? "bg-amber-50 text-amber-800 border-amber-300"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-amber-50/50 hover:border-amber-200"
              }`}
              title="Filtrar apenas pacientes Membros do Plano FAAZ"
            >
              <span className="text-amber-500">✨</span>
              <span>Membros FAAZ</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono tabular-nums ${
                  apenasMembrosFaaz
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {pacientes.filter((p) => Boolean(p.planoFaaz)).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                invalidateClientCache("pacientes:list");
                void loadPacientes(false, true);
              }}
              className="cl-btn-secondary px-2.5 py-2 text-xs"
              title="Recarregar pacientes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
            </button>
            <button
              type="button"
              onClick={handleOpenNewModal}
              className="cl-btn-primary px-4 py-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Novo Paciente</span>
            </button>
          </div>
        </div>

        {/* BARRA DE PESQUISA COMPACTA */}
        <div className="cl-card px-3.5 py-2.5 flex items-center gap-2.5 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/15 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
            placeholder="PESQUISAR POR NOME, CPF, WHATSAPP, BAIRRO OU CIDADE..."
            className="w-full text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden uppercase bg-transparent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-slate-400 hover:text-slate-700 text-xs font-semibold px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          )}
        </div>

        {/* TABELA DE ALTA DENSIDADE — CLINICAL LIGHT */}
        <div className="cl-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 text-[10px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-200/80">
                  <th className="py-2.5 px-4 font-bold">Nome Completo</th>
                  <th className="py-2.5 px-3 font-bold">CPF</th>
                  <th className="py-2.5 px-3 font-bold">WhatsApp</th>
                  <th className="py-2.5 px-3 font-bold">Cidade / Bairro</th>
                  <th className="py-2.5 px-3 font-bold">Convênio</th>
                  <th className="py-2.5 px-3 font-bold">Programa / Pacote</th>
                  <th className="py-2.5 px-3 font-bold text-center">Status</th>
                  <th className="py-2.5 px-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        <span>Carregando pacientes da clínica...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredPacientes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      Nenhum paciente encontrado para esta busca.
                    </td>
                  </tr>
                ) : (
                  filteredPacientes.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-emerald-50/35 transition-colors"
                    >
                      {/* Nome + Selo FAAZ ✨ */}
                      <td className="py-2 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <span>{p.nome}</span>
                          {p.planoFaaz && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black tracking-wider uppercase">
                              FAAZ ✨
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CPF */}
                      <td className="py-2 px-3 text-slate-500 font-mono tabular-nums text-[11px] whitespace-nowrap">
                        {p.cpf ? formatCpf(p.cpf) : "--"}
                      </td>

                      {/* WhatsApp com atalho direto e ícone */}
                      <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                        {p.telefoneWhatsapp ? (
                          <div className="flex items-center gap-1.5">
                            {getWhatsAppLink(p.telefoneWhatsapp) && (
                              <a
                                href={getWhatsAppLink(p.telefoneWhatsapp)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-5 h-5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-700 flex items-center justify-center transition-colors border border-emerald-200/80 shrink-0"
                                title={`Abrir conversa no WhatsApp: ${formatPhone(p.telefoneWhatsapp)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="w-3.5 h-3.5 fill-current"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67ZM8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7.02 8.48 7.02 9.68C7.02 10.88 7.89 12.04 8.01 12.2C8.13 12.36 9.7 14.79 12.11 15.83C12.69 16.08 13.14 16.23 13.49 16.34C14.07 16.53 14.6 16.5 15.02 16.44C15.49 16.37 16.46 15.85 16.66 15.28C16.86 14.71 16.86 14.23 16.8 14.12C16.74 14.02 16.58 13.96 16.34 13.84C16.1 13.72 14.93 13.14 14.71 13.06C14.49 12.98 14.33 12.94 14.17 13.19C14.01 13.43 13.55 13.96 13.41 14.12C13.27 14.28 13.13 14.3 12.89 14.18C12.65 14.06 11.88 13.81 10.96 12.99C10.25 12.35 9.76 11.57 9.62 11.33C9.48 11.09 9.6 10.95 9.72 10.83C9.83 10.72 9.97 10.54 10.09 10.4C10.21 10.26 10.25 10.16 10.33 10C10.41 9.84 10.37 9.7 10.31 9.58C10.25 9.46 9.79 8.33 9.6 7.87C9.41 7.41 9.22 7.48 9.07 7.47C8.93 7.46 8.76 7.46 8.6 7.46L8.53 7.33Z" />
                                </svg>
                              </a>
                            )}
                            <span className="font-mono tabular-nums text-slate-800 text-[11px]">
                              {formatPhone(p.telefoneWhatsapp)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">--</span>
                        )}
                      </td>

                      {/* Cidade / Bairro */}
                      <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                        {p.cidade ? `${p.cidade}${p.bairro ? ` - ${p.bairro}` : ""}` : "--"}
                      </td>

                      {/* Convênio */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                          {p.convenio || "Particular"}
                        </span>
                      </td>

                      {/* Selo discreto do Programa / Pacote ativo ou Avulso */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {p.pacoteAtivo ? (
                          <button
                            type="button"
                            disabled={!canManagePacotes}
                            onClick={() => {
                              if (!canManagePacotes) return;
                              setSelectedPatientForPacote(p);
                              setIsPacoteModalOpen(true);
                            }}
                            title={`${p.pacoteAtivo.nomePlano} • ${p.pacoteAtivo.consultasRealizadas} de ${p.pacoteAtivo.qtdTotalConsultas} realizadas • ${
                              p.pacoteAtivo.consultasRestantes === 0
                                ? "Saldo encerrado"
                                : p.pacoteAtivo.consultasRestantes === 1
                                  ? "Falta 1"
                                  : `Faltam ${p.pacoteAtivo.consultasRestantes}`
                            }${
                              p.pacoteAtivo.dataValidade
                                ? ` • Validade ${formatIsoDateBr(p.pacoteAtivo.dataValidade)}`
                                : ""
                            }`}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                              canManagePacotes ? "cursor-pointer hover:shadow-2xs" : "cursor-default"
                            } ${
                              p.pacoteAtivo.vencido || p.pacoteAtivo.consultasRestantes === 0
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : p.pacoteAtivo.alertaRenovacao
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            <Award className="w-3 h-3 shrink-0" />
                            <span className="max-w-[130px] truncate">
                              {p.pacoteAtivo.nomePlano}
                            </span>
                            <span className="font-mono font-black tabular-nums opacity-90">
                              {p.pacoteAtivo.consultasRealizadas}/{p.pacoteAtivo.qtdTotalConsultas}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canManagePacotes}
                            onClick={() => {
                              if (!canManagePacotes) return;
                              setSelectedPatientForPacote(p);
                              setIsPacoteModalOpen(true);
                            }}
                            title={
                              canManagePacotes
                                ? "Atendimento avulso — clique para configurar um programa/pacote"
                                : "Atendimento avulso"
                            }
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 transition-colors ${
                              canManagePacotes
                                ? "cursor-pointer hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200"
                                : "cursor-default"
                            }`}
                          >
                            <span>Avulso</span>
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            p.status === "Ativo"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          {p.status || "Ativo"}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* BOTÃO CLÍNICO: PRONTUÁRIO — Exclusivo MÉDICO / ADMIN */}
                          {canAccessProntuario && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPatientForProntuario(p);
                                setIsProntuarioOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-2xs rounded-lg transition-all cursor-pointer"
                              title="Abrir Prontuário Clínico Digital"
                            >
                              <FileText className="w-3.5 h-3.5 text-emerald-100" />
                              <span>Prontuário</span>
                            </button>
                          )}

                          {/* BOTÃO OPERACIONAL: NOVO AGENDAMENTO (Exclusivo para Recepção / Secretária) */}
                          {isSecretaria && (
                            <Link
                              href={`/agenda?pacienteId=${p.id}&pacienteNome=${encodeURIComponent(p.nome)}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-2xs rounded-lg transition-all cursor-pointer"
                              title="Criar novo agendamento para este paciente na Agenda"
                            >
                              <Calendar className="w-3.5 h-3.5 text-emerald-100" />
                              <span>Novo Agendamento</span>
                            </Link>
                          )}

                          {/* BOTÃO ADMINISTRATIVO: PACOTE / PROGRAMA DE CONSULTAS (Secretária, Médico, Admin e Dono) */}
                          {canManagePacotes && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPatientForPacote(p);
                                setIsPacoteModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 hover:border-teal-300 rounded-lg transition-colors cursor-pointer"
                              title="Configurar Programa & Pacote de Consultas"
                            >
                              <Award className="w-3.5 h-3.5 text-teal-600" />
                              <span>Pacote</span>
                            </button>
                          )}

                          {/* BOTÃO OPERACIONAL: EDITAR CADASTRO */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer"
                            title="Editar cadastro do paciente"
                          >
                            <Edit2 className="w-3 h-3 text-slate-500" />
                            <span>Editar</span>
                          </button>

                          {/* BOTÃO ADMINISTRATIVO: EXCLUIR CADASTRO (Apenas Dono/Admin) */}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setPatientToDelete(p)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="Excluir paciente (Apenas Diretoria Clínica/Admin)"
                            >
                              <Trash2 className="w-3 h-3 text-rose-600" />
                              <span>Apagar</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* RODAPÉ DA TABELA */}
          <div className="px-4 py-2.5 border-t border-slate-200/70 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-500">
            <span className="tabular-nums">
              Exibindo <strong className="text-slate-700">{filteredPacientes.length}</strong> de{" "}
              <strong className="text-slate-700">{pacientes.length}</strong>{" "}
              {pacientes.length === 1 ? "paciente cadastrado" : "pacientes cadastrados"}
            </span>
            <span>Clínica FAAZ • Medicina & Saúde Integrativa</span>
          </div>
        </div>
      </main>

      {/* TOAST DE FEEDBACK — CLINICAL LIGHT */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 cl-toast px-4 py-2.5 flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MODAL COMPACTO "+ NOVO PACIENTE" / "EDITAR" */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[94vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* CABEÇALHO CLINICAL LIGHT GLASS */}
            <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {editingId ? "Editar Cadastro do Paciente" : "Novo Cadastro de Paciente"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Preenchimento cadastral administrativo (Dados Pessoais, Contato e Endereço).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* FORMULÁRIO COMPACTO ORGANIZADO EM 3 BLOCOS (GRIDS DE 3 A 4 COLUNAS) */}
            <form onSubmit={handleSavePaciente} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-xs">
              {/* BLOCO 1: DADOS PESSOAIS */}
              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                  1. Dados Pessoais
                </span>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                  {/* Nome Completo */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={nome}
                      onChange={(e) => setNome(e.target.value.toUpperCase())}
                      placeholder="Ex: Carlos Eduardo Fantini"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* CPF */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      CPF *
                    </label>
                    <input
                      type="text"
                      required
                      value={cpf}
                      onChange={(e) => setCpf(formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full h-8 px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* RG */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      RG
                    </label>
                    <input
                      type="text"
                      value={rg}
                      onChange={(e) => setRg(e.target.value.toUpperCase())}
                      placeholder="Ex: MG-12.345.678"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* Data de Nascimento */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={dataNascimento}
                      onChange={(e) => setDataNascimento(e.target.value)}
                      className="w-full h-8 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Sexo */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Sexo
                    </label>
                    <select
                      value={sexo}
                      onChange={(e) => setSexo(e.target.value)}
                      className="w-full h-8 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="MALE">Masculino</option>
                      <option value="FEMALE">Feminino</option>
                      <option value="OTHER">Outro</option>
                    </select>
                  </div>

                  {/* Estado Civil */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Estado Civil
                    </label>
                    <select
                      value={estadoCivil}
                      onChange={(e) => setEstadoCivil(e.target.value)}
                      className="w-full h-8 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="Solteiro(a)">Solteiro(a)</option>
                      <option value="Casado(a)">Casado(a)</option>
                      <option value="União Estável">União Estável</option>
                      <option value="Divorciado(a)">Divorciado(a)</option>
                      <option value="Viúvo(a)">Viúvo(a)</option>
                    </select>
                  </div>

                  {/* Profissão */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Profissão
                    </label>
                    <input
                      type="text"
                      value={profissao}
                      onChange={(e) => setProfissao(e.target.value.toUpperCase())}
                      placeholder="Ex: Arquiteto, Advogado"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* Convênio */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Convênio
                    </label>
                    <select
                      value={convenio}
                      onChange={(e) => setConvenio(e.target.value)}
                      className="w-full h-8 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="Particular">Particular</option>
                      <option value="Convênio">Convênio</option>
                      <option value="Plano FAAZ">Plano FAAZ</option>
                    </select>
                  </div>

                  {/* Status Cadastral */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full h-8 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Inativo">Inativo</option>
                    </select>
                  </div>

                  {/* Médico Responsável */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Médico Responsável
                    </label>
                    <select
                      value={medicoResponsavelId}
                      onChange={(e) => setMedicoResponsavelId(e.target.value)}
                      className="w-full h-8 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">
                        Automático (conforme consultas / clínica)
                      </option>
                      {medicosClinica.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                          {m.especialidade ? ` — ${m.especialidade}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Toggle / Switch Elegante: Membro Plano FAAZ */}
                  <div className="md:col-span-4 flex items-end">
                    <label
                      htmlFor="toggle-plano-faaz"
                      className={`w-full h-8 px-3 rounded-lg border flex items-center justify-between cursor-pointer select-none transition-all ${
                        planoFaaz
                          ? "bg-amber-50 border-amber-300 text-amber-900 shadow-2xs"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-amber-500 text-xs">✨</span>
                        <span className="text-xs font-extrabold">
                          Membro Plano FAAZ
                        </span>
                        {planoFaaz && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider">
                            FAAZ ✨
                          </span>
                        )}
                      </div>

                      <div className="relative inline-flex items-center">
                        <input
                          id="toggle-plano-faaz"
                          type="checkbox"
                          checked={planoFaaz}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPlanoFaaz(checked);
                            if (checked && convenio === "Particular") {
                              setConvenio("Plano FAAZ");
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5" />
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* BLOCO 2: TELEFONES E CONTATO */}
              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                  2. Telefones e Contato
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {/* WhatsApp */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      WhatsApp Principal *
                    </label>
                    <input
                      type="text"
                      required
                      value={telefoneWhatsapp}
                      onChange={(e) => setTelefoneWhatsapp(formatPhone(e.target.value))}
                      placeholder="(31) 90000-0000"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Telefone Secundário */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Telefone Secundário
                    </label>
                    <input
                      type="text"
                      value={telefoneSecundario}
                      onChange={(e) => setTelefoneSecundario(formatPhone(e.target.value))}
                      placeholder="(31) 3000-0000"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* E-mail */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="paciente@exemplo.com.br"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Contato Emergência (Nome) */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Contato de Emergência (Nome e Parentesco)
                    </label>
                    <input
                      type="text"
                      value={contatoEmergenciaNome}
                      onChange={(e) => setContatoEmergenciaNome(e.target.value.toUpperCase())}
                      placeholder="Ex: Maria Fantini (Esposa)"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* Contato Emergência (Telefone) */}
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Telefone do Contato de Emergência
                    </label>
                    <input
                      type="text"
                      value={contatoEmergenciaTelefone}
                      onChange={(e) => setContatoEmergenciaTelefone(formatPhone(e.target.value))}
                      placeholder="(31) 90000-0000"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCO 3: ENDEREÇO COM BUSCA AUTOMÁTICA POR CEP */}
              <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                    3. Endereço Residencial (ViaCEP)
                  </span>
                  {isCepLoading && (
                    <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Consultando CEP...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {/* CEP */}
                  <div className="md:col-span-2 lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      CEP (8 dígitos)
                    </label>
                    <input
                      type="text"
                      value={cep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      placeholder="00000-000"
                      className="w-full h-8 px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Logradouro / Rua */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Rua / Avenida
                    </label>
                    <input
                      type="text"
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value.toUpperCase())}
                      placeholder="Rua, Avenida, Praça..."
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* Número */}
                  <div className="lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Número *
                    </label>
                    <input
                      ref={numeroInputRef}
                      type="text"
                      value={numero}
                      onChange={(e) => setNumero(e.target.value.toUpperCase())}
                      placeholder="Ex: 120"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* Complemento */}
                  <div className="md:col-span-2 lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value.toUpperCase())}
                      placeholder="Apto, Bloco, Sala..."
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* Bairro */}
                  <div className="md:col-span-2 lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value.toUpperCase())}
                      placeholder="Bairro"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* Cidade */}
                  <div className="md:col-span-3 lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value.toUpperCase())}
                      placeholder="Cidade"
                      className="w-full h-8 px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  {/* UF */}
                  <div className="md:col-span-1 lg:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      UF
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={estado}
                      onChange={(e) => setEstado(e.target.value.toUpperCase())}
                      placeholder="MG"
                      className="w-full h-8 px-2.5 py-1 text-xs font-mono uppercase border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* BOTÕES DE AÇÃO DO FORMULÁRIO */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-2xs"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingId ? "Salvar Alterações" : "Salvar Paciente"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO (SOMENTE DONO / ADMIN) */}
      {patientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200/90 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Confirmar Exclusão de Paciente
                </h3>
                <p className="text-xs text-slate-500">
                  Esta ação é irreversível e removerá todos os check-ins associados.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div>
                <span className="font-bold">Paciente:</span> {patientToDelete.nome}
              </div>
              <div>
                <span className="font-bold">CPF:</span>{" "}
                <span className="font-mono">{patientToDelete.cpf || "--"}</span>
              </div>
              <div>
                <span className="font-bold">WhatsApp:</span>{" "}
                {patientToDelete.telefoneWhatsapp || "--"}
              </div>
              <div>
                <span className="font-bold">Cidade:</span>{" "}
                {patientToDelete.cidade ? `${patientToDelete.cidade}/${patientToDelete.estado}` : "--"}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPatientToDelete(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-2xs"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Sim, Excluir Paciente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DO PRONTUÁRIO CLÍNICO DIGITAL (ABA ÚNICA FUNCIONAL + ABAS PREPARADAS — Exclusivo Médico/Admin) */}
      {canAccessProntuario && (
        <ProntuarioModal
          isOpen={isProntuarioOpen}
          onClose={() => {
            setIsProntuarioOpen(false);
            setSelectedPatientForProntuario(null);
            void loadPacientes(false, false);
          }}
          paciente={selectedPatientForProntuario}
          currentUserCargo={currentUserCargo}
        />
      )}

      {/* MODAL ADMINISTRATIVO: PROGRAMA & PACOTE DE CONSULTAS (Secretária, Médico, Admin e Dono — sem prontuário) */}
      {canManagePacotes && (
        <PacotePacienteModal
          isOpen={isPacoteModalOpen}
          onClose={() => {
            setIsPacoteModalOpen(false);
            setSelectedPatientForPacote(null);
          }}
          paciente={selectedPatientForPacote}
          onPacotesUpdated={handlePacotesPacienteUpdated}
        />
      )}
    </div>
  );
}
