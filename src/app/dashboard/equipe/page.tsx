"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Stethoscope,
  ClipboardList,
  Building2,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Settings,
  Pencil,
  Trash2,
  KeyRound,
  Mail,
  Tag,
  Plus,
  Power,
  Check,
  Database,
  UploadCloud,
} from "lucide-react";
import { TopMenu } from "@/components/TopMenu";
import { ExportacaoClinicaTab } from "@/components/ExportacaoClinicaTab";
import { ImportacaoIClinicTab } from "@/components/ImportacaoIClinicTab";
import { isDonoClinica } from "@/lib/auth-rbac";
import { formatarDataBR } from "@/lib/date-br";
import { invalidateClientCache } from "@/lib/client-swr-cache";
import {
  CORES_ESPECIALIDADE_LISTA,
  extrairSubespecialidadeParaForm,
  getCorEspecialidadeEstilo,
  normalizarTextoEspecialidade,
  type CorEspecialidadeToken,
  type EspecialidadeDTO,
} from "@/lib/especialidades-clinica";

interface MembroEquipe {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  cargo: string;
  role: string;
  specialty: string | null;
  especialidadeId: string | null;
  especialidadeNome: string | null;
  especialidadeCor: CorEspecialidadeToken | null;
  especialidadeAtiva: boolean | null;
  councilType: string | null;
  councilNumber: string | null;
  accountStatus: string;
  lastLoginAt: string | null;
  createdAt: string;
}

const cargoConfig: Record<
  string,
  { label: string; cor: string; icon: React.ElementType }
> = {
  DONO_CLINICA: {
    label: "Diretoria Clínica",
    cor: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    icon: Shield,
  },
  MEDICO: {
    label: "Médico",
    cor: "bg-sky-50 text-sky-800 border border-sky-200",
    icon: Stethoscope,
  },
  SECRETARIA: {
    label: "Secretária",
    cor: "bg-amber-50 text-amber-800 border border-amber-200",
    icon: ClipboardList,
  },
  ADMINISTRADOR: {
    label: "Administrador",
    cor: "bg-violet-50 text-violet-800 border border-violet-200",
    icon: Building2,
  },
};

const statusConfig: Record<string, { label: string; cor: string }> = {
  ACTIVE: {
    label: "Ativo",
    cor: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  PENDING_INVITE: {
    label: "Convite Pendente",
    cor: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  REVOKED: {
    label: "Revogado",
    cor: "bg-rose-50 text-rose-700 border border-rose-200",
  },
  LOCKED: {
    label: "Bloqueado",
    cor: "bg-slate-100 text-slate-600 border border-slate-200",
  },
};

export default function EquipePage() {
  const router = useRouter();
  const [abaAtiva, setAbaAtiva] = useState<
    "equipe" | "especialidades" | "exportacao" | "importacao"
  >("equipe");
  const [isDiretoriaClinica, setIsDiretoriaClinica] = useState(false);

  // Estado da Equipe
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  // Estado das Especialidades
  const [especialidades, setEspecialidades] = useState<EspecialidadeDTO[]>([]);
  const [carregandoEspecialidades, setCarregandoEspecialidades] =
    useState(true);

  // Modais da Equipe
  const [modalAberto, setModalAberto] = useState(false);
  const [membroEmEdicao, setMembroEmEdicao] = useState<MembroEquipe | null>(
    null,
  );
  const [membroParaExcluir, setMembroParaExcluir] =
    useState<MembroEquipe | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Modal de Especialidade
  const [modalEspecialidadeAberto, setModalEspecialidadeAberto] =
    useState(false);
  const [especialidadeEmEdicao, setEspecialidadeEmEdicao] =
    useState<EspecialidadeDTO | null>(null);
  const [formEspNome, setFormEspNome] = useState("");
  const [formEspCor, setFormEspCor] =
    useState<CorEspecialidadeToken>("emerald");
  const [salvandoEspecialidade, setSalvandoEspecialidade] = useState(false);
  const [alternandoEspecialidadeId, setAlternandoEspecialidadeId] = useState<
    string | null
  >(null);

  // Feedback global
  const [mensagem, setMensagem] = useState<{
    tipo: "sucesso" | "erro";
    texto: string;
  } | null>(null);

  // Campos do Formulário de Membro
  const [formNome, setFormNome] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCargo, setFormCargo] = useState("MEDICO");
  const [formSenha, setFormSenha] = useState("");
  const [formEspecialidadeId, setFormEspecialidadeId] = useState("");
  const [formSubespecialidade, setFormSubespecialidade] = useState("");
  const [formCRM, setFormCRM] = useState("");

  const isCargoClinico = (cargo: string) =>
    cargo === "MEDICO" || cargo === "DONO_CLINICA";

  const carregarEquipe = useCallback(async () => {
    try {
      const res = await fetch("/api/equipe", { cache: "no-store" });
      if (res.status === 403) {
        router.push("/dashboard");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setEquipe(data.equipe || []);
      }
    } catch {
      console.error("Erro ao carregar equipe");
    } finally {
      setCarregando(false);
    }
  }, [router]);

  const carregarEspecialidades = useCallback(async () => {
    try {
      const res = await fetch("/api/especialidades?incluirInativas=true", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setEspecialidades(data.especialidades || []);
      }
    } catch {
      console.error("Erro ao carregar especialidades");
    } finally {
      setCarregandoEspecialidades(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) {
        void Promise.all([
          carregarEquipe(),
          carregarEspecialidades(),
          fetch("/api/auth/me", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (!ativo || !data?.autenticado || !data?.usuario) return;
              const cargo = String(data.usuario.cargo || "");
              const role = String(data.usuario.role || "");
              setIsDiretoriaClinica(isDonoClinica(cargo) || isDonoClinica(role));
            })
            .catch(() => {}),
        ]);
      }
    });
    return () => {
      ativo = false;
    };
  }, [carregarEquipe, carregarEspecialidades]);

  const especialidadesAtivas = especialidades.filter((e) => e.ativo);

  const normalizarBusca = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const termoBusca = normalizarBusca(busca);

  const equipeFiltrada = equipe.filter(
    (m) =>
      normalizarBusca(m.fullName).includes(termoBusca) ||
      (m.username && normalizarBusca(m.username).includes(termoBusca)) ||
      (m.email && normalizarBusca(m.email).includes(termoBusca)) ||
      (m.especialidadeNome &&
        normalizarBusca(m.especialidadeNome).includes(termoBusca)) ||
      normalizarBusca(cargoConfig[m.cargo]?.label || "").includes(termoBusca),
  );

  // ---------- Handlers Equipe ----------
  function handleAbrirNovoModal() {
    setMembroEmEdicao(null);
    setFormNome("");
    setFormUsername("");
    setFormEmail("");
    setFormCargo("MEDICO");
    setFormSenha("");
    setFormEspecialidadeId(especialidadesAtivas[0]?.id || "");
    setFormSubespecialidade("");
    setFormCRM("");
    setMensagem(null);
    setModalAberto(true);
  }

  function handleAbrirEditarModal(membro: MembroEquipe) {
    const clinico = isCargoClinico(membro.cargo);
    const subInicial = clinico
      ? extrairSubespecialidadeParaForm(
          membro.specialty,
          membro.especialidadeNome,
        )
      : "";
    setMembroEmEdicao(membro);
    setFormNome((membro.fullName || "").toUpperCase());
    setFormUsername((membro.username || "").toLowerCase());
    setFormEmail((membro.email || "").toLowerCase());
    setFormCargo(membro.cargo);
    setFormSenha("");
    setFormEspecialidadeId(clinico ? membro.especialidadeId || "" : "");
    setFormSubespecialidade(subInicial);
    setFormCRM(clinico ? (membro.councilNumber || "").toUpperCase() : "");
    setMensagem(null);
    setModalAberto(true);
  }

  async function handleSalvarMembro(e: React.FormEvent) {
    e.preventDefault();
    setMensagem(null);

    const clinico = isCargoClinico(formCargo);
    if (clinico && !formEspecialidadeId) {
      setMensagem({
        tipo: "erro",
        texto:
          "Selecione a Especialidade de Atendimento para perfis clínicos (Médico ou Diretoria Clínica).",
      });
      return;
    }

    setSalvando(true);

    const isEdicao = Boolean(membroEmEdicao);
    const endpoint = isEdicao
      ? `/api/usuarios/${membroEmEdicao!.id}`
      : "/api/equipe";
    const method = isEdicao ? "PUT" : "POST";

    const payload: Record<string, string | null | undefined> = {
      nome: formNome.trim().toUpperCase(),
      username: formUsername.trim().toLowerCase(),
      email: formEmail.trim() ? formEmail.trim().toLowerCase() : undefined,
      cargo: formCargo,
      especialidadeId: clinico ? formEspecialidadeId || null : null,
      subespecialidade: clinico ? formSubespecialidade.trim() || null : null,
      crm: clinico ? formCRM.trim().toUpperCase() || null : null,
    };

    if (formSenha.trim()) {
      payload.senha = formSenha.trim();
    }

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.sucesso) {
        invalidateClientCache("medicos:");
        invalidateClientCache("especialidades:");
        setMensagem({
          tipo: "sucesso",
          texto: isEdicao
            ? `Membro ${formNome} atualizado com sucesso!`
            : `${formNome} (@${formUsername}) cadastrado com sucesso!`,
        });
        setModalAberto(false);
        await Promise.all([carregarEquipe(), carregarEspecialidades()]);
      } else {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Erro ao salvar membro.",
        });
      }
    } catch {
      setMensagem({ tipo: "erro", texto: "Erro de conexão com o servidor." });
    } finally {
      setSalvando(false);
    }
  }

  async function handleConfirmarExclusao() {
    if (!membroParaExcluir) return;
    setExcluindo(true);

    try {
      const res = await fetch(`/api/usuarios/${membroParaExcluir.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok && data.sucesso) {
        invalidateClientCache("medicos:");
        invalidateClientCache("especialidades:");
        setMensagem({
          tipo: "sucesso",
          texto:
            data.mensagem ||
            `Acesso de ${membroParaExcluir.fullName} removido com sucesso.`,
        });
        setMembroParaExcluir(null);
        await Promise.all([carregarEquipe(), carregarEspecialidades()]);
      } else {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Não foi possível remover o acesso do membro.",
        });
      }
    } catch {
      setMensagem({
        tipo: "erro",
        texto: "Erro de conexão ao remover membro.",
      });
    } finally {
      setExcluindo(false);
    }
  }

  // ---------- Handlers Especialidades ----------
  function handleAbrirNovaEspecialidade() {
    setEspecialidadeEmEdicao(null);
    setFormEspNome("");
    // Sugere uma cor ainda não usada (se houver)
    const coresEmUso = new Set(especialidades.map((e) => e.cor));
    const corDisponivel =
      CORES_ESPECIALIDADE_LISTA.find((c) => !coresEmUso.has(c.token))?.token ||
      "emerald";
    setFormEspCor(corDisponivel);
    setMensagem(null);
    setModalEspecialidadeAberto(true);
  }

  function handleAbrirEditarEspecialidade(esp: EspecialidadeDTO) {
    setEspecialidadeEmEdicao(esp);
    setFormEspNome(esp.nome);
    setFormEspCor(esp.cor);
    setMensagem(null);
    setModalEspecialidadeAberto(true);
  }

  async function handleSalvarEspecialidade(e: React.FormEvent) {
    e.preventDefault();
    setMensagem(null);

    const nomeClean = formEspNome.trim();
    if (nomeClean.length < 2) {
      setMensagem({
        tipo: "erro",
        texto: "Informe o nome da especialidade (mínimo 2 caracteres).",
      });
      return;
    }

    setSalvandoEspecialidade(true);
    try {
      const isEdicao = Boolean(especialidadeEmEdicao);
      const endpoint = isEdicao
        ? `/api/especialidades/${especialidadeEmEdicao!.id}`
        : "/api/especialidades";
      const method = isEdicao ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeClean,
          cor: formEspCor,
        }),
      });
      const data = await res.json();

      if (res.ok && (data.sucesso || data.success)) {
        invalidateClientCache("especialidades:");
        invalidateClientCache("medicos:");
        setMensagem({
          tipo: "sucesso",
          texto: isEdicao
            ? `Especialidade "${nomeClean}" atualizada com sucesso!`
            : `Especialidade "${nomeClean}" adicionada à clínica!`,
        });
        setModalEspecialidadeAberto(false);
        await Promise.all([carregarEspecialidades(), carregarEquipe()]);
      } else {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Erro ao salvar especialidade.",
        });
      }
    } catch {
      setMensagem({
        tipo: "erro",
        texto: "Erro de conexão ao salvar especialidade.",
      });
    } finally {
      setSalvandoEspecialidade(false);
    }
  }

  async function handleAlternarStatusEspecialidade(esp: EspecialidadeDTO) {
    setMensagem(null);
    setAlternandoEspecialidadeId(esp.id);
    try {
      const novoStatus = !esp.ativo;
      const res = await fetch(`/api/especialidades/${esp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novoStatus }),
      });
      const data = await res.json();

      if (res.ok && (data.sucesso || data.success)) {
        invalidateClientCache("especialidades:");
        invalidateClientCache("medicos:");
        setMensagem({
          tipo: "sucesso",
          texto: novoStatus
            ? `Especialidade "${esp.nome}" reativada e disponível na Agenda.`
            : `Especialidade "${esp.nome}" desativada (agendamentos antigos preservados).`,
        });
        await Promise.all([carregarEspecialidades(), carregarEquipe()]);
      } else {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Não foi possível alterar o status.",
        });
      }
    } catch {
      setMensagem({
        tipo: "erro",
        texto: "Erro de conexão ao atualizar especialidade.",
      });
    } finally {
      setAlternandoEspecialidadeId(null);
    }
  }

  // Opções de especialidade no select do modal de membro:
  // exibe todas as ativas + a especialidade atualmente vinculada caso tenha sido inativada.
  const opcoesEspecialidadeModal = (() => {
    const lista = [...especialidadesAtivas];
    if (
      formEspecialidadeId &&
      !lista.some((e) => e.id === formEspecialidadeId)
    ) {
      const atualInativa = especialidades.find(
        (e) => e.id === formEspecialidadeId,
      );
      if (atualInativa) lista.push(atualInativa);
    }
    return lista;
  })();

  const estiloPreviewCor = getCorEspecialidadeEstilo(formEspCor);

  return (
    <div className="min-h-screen cl-page flex flex-col font-sans">
      <TopMenu activePath="/dashboard/equipe" />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">
        {/* Cabeçalho de Comando */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-emerald-300 shadow-2xs transition-colors cursor-pointer"
              title="Voltar ao Início"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="cl-badge-emerald px-2.5 py-0.5 text-[10px] uppercase tracking-widest">
                  <Settings className="w-3 h-3" />
                  <span>Administração • Configurações</span>
                </span>
                <span className="cl-badge-slate px-2.5 py-0.5 text-[11px] font-mono tabular-nums">
                  {abaAtiva === "equipe"
                    ? `${equipe.length} ${equipe.length === 1 ? "membro" : "membros"}`
                    : abaAtiva === "especialidades"
                      ? `${especialidadesAtivas.length} ${especialidadesAtivas.length === 1 ? "ativa" : "ativas"}`
                      : abaAtiva === "exportacao"
                        ? "Portabilidade LGPD"
                        : "Migração iClinic"}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Configurações da Clínica
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {isDiretoriaClinica
                  ? "Gerencie os acessos da equipe, as especialidades da Agenda, a exportação completa (LGPD) e a importação do iClinic."
                  : "Gerencie os acessos da equipe e as especialidades atendidas na Agenda."}
              </p>
            </div>
          </div>

          {abaAtiva === "equipe" ? (
            <button
              onClick={handleAbrirNovoModal}
              className="cl-btn-primary px-4 py-2 text-xs self-start sm:self-center active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Membro</span>
            </button>
          ) : abaAtiva === "especialidades" ? (
            <button
              onClick={handleAbrirNovaEspecialidade}
              className="cl-btn-primary px-4 py-2 text-xs self-start sm:self-center active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Especialidade</span>
            </button>
          ) : null}
        </div>

        {/* Seletor Limpo de Abas */}
        <div className="flex items-center gap-1.5 border-b border-slate-200/80 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setAbaAtiva("equipe");
              setMensagem(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap ${
              abaAtiva === "equipe"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Equipe & Acessos</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                abaAtiva === "equipe"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {equipe.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAbaAtiva("especialidades");
              setMensagem(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap ${
              abaAtiva === "especialidades"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Especialidades</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                abaAtiva === "especialidades"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {especialidadesAtivas.length}
            </span>
          </button>

          {isDiretoriaClinica && (
            <>
              <button
                type="button"
                onClick={() => {
                  setAbaAtiva("exportacao");
                  setMensagem(null);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap ${
                  abaAtiva === "exportacao"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Database className="w-4 h-4" />
                <span>Exportação de Dados & LGPD</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    abaAtiva === "exportacao"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  Excel
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAbaAtiva("importacao");
                  setMensagem(null);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer -mb-px whitespace-nowrap ${
                  abaAtiva === "importacao"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>Importar do iClinic</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    abaAtiva === "importacao"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  CSV/ZIP
                </span>
              </button>
            </>
          )}
        </div>

        {/* Toast de Feedback */}
        {mensagem && (
          <div
            className={`rounded-2xl p-4 flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold animate-in fade-in slide-in-from-top-1 duration-200 ${
              mensagem.tipo === "sucesso"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
          >
            <div className="flex items-center gap-3">
              {mensagem.tipo === "sucesso" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span>{mensagem.texto}</span>
            </div>
            <button
              type="button"
              onClick={() => setMensagem(null)}
              className="p-1 rounded-lg opacity-60 hover:opacity-100 cursor-pointer"
              aria-label="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ==================== ABA 1: EQUIPE & ACESSOS ==================== */}
        {abaAtiva === "equipe" && (
          <>
            {/* Busca */}
            <div className="cl-card px-3.5 py-2.5 max-w-md flex items-center gap-2.5 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/15 transition-all">
              <Search className="w-4 h-4 text-slate-400 shrink-0 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por nome, username, especialidade ou cargo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
              />
            </div>

            {/* Tabela da Equipe */}
            {carregando ? (
              <div className="cl-card flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="ml-2.5 text-xs font-medium text-slate-500">
                  Carregando equipe da clínica...
                </span>
              </div>
            ) : (
              <div className="cl-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-50/90 border-b border-slate-200/80">
                      <tr>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Nome & Usuário
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Username
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          E-mail
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Cargo
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Especialidade / CRM
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {equipeFiltrada.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-6 py-12 text-center text-slate-400 text-xs"
                          >
                            {busca
                              ? "Nenhum membro encontrado com esse filtro."
                              : "Nenhum membro cadastrado ainda."}
                          </td>
                        </tr>
                      ) : (
                        equipeFiltrada.map((membro) => {
                          const cfg =
                            cargoConfig[membro.cargo] || cargoConfig.MEDICO;
                          const Icon = cfg.icon;
                          const statusCfg =
                            statusConfig[membro.accountStatus] ||
                            statusConfig.ACTIVE;

                          return (
                            <tr
                              key={membro.id}
                              className="hover:bg-emerald-50/35 transition-colors"
                            >
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 shrink-0">
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="font-bold text-slate-900 block">
                                      {(membro.fullName || "").toUpperCase()}
                                    </span>
                                    <span className="text-[11px] text-slate-400 tabular-nums">
                                      Cadastrado em{" "}
                                      {formatarDataBR(membro.createdAt)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                  @{membro.username}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">
                                {membro.email || "—"}
                              </td>
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cfg.cor}`}
                                >
                                  {cfg.label}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-slate-600 text-xs">
                                {(() => {
                                  const clinico = isCargoClinico(membro.cargo);
                                  if (!clinico) {
                                    return (
                                      <span className="text-slate-400">—</span>
                                    );
                                  }
                                  const crmFormatado = membro.councilNumber
                                    ? (membro.councilNumber
                                        .toUpperCase()
                                        .startsWith(
                                          (
                                            membro.councilType || "CRM"
                                          ).toUpperCase(),
                                        )
                                        ? membro.councilNumber
                                        : `${membro.councilType || "CRM"} ${membro.councilNumber}`
                                      ).toUpperCase()
                                    : null;

                                  if (!membro.especialidadeNome) {
                                    return (
                                      <div className="space-y-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleAbrirEditarModal(membro)
                                          }
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                                          title="Clique para vincular este profissional a uma especialidade da clínica"
                                        >
                                          Definir especialidade
                                        </button>
                                        {crmFormatado && (
                                          <span className="block text-[11px] text-slate-500 font-mono font-semibold">
                                            {crmFormatado}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  }

                                  const estiloCor = getCorEspecialidadeEstilo(
                                    membro.especialidadeCor,
                                  );
                                  const mostrarSubtitulo =
                                    Boolean(membro.specialty) &&
                                    normalizarTextoEspecialidade(
                                      membro.specialty,
                                    ) !==
                                      normalizarTextoEspecialidade(
                                        membro.especialidadeNome,
                                      );

                                  return (
                                    <div className="space-y-0.5">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span
                                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${estiloCor.badgeClass}`}
                                        >
                                          <span
                                            className={`w-1.5 h-1.5 rounded-full ${estiloCor.dotClass}`}
                                          />
                                          <span>{membro.especialidadeNome}</span>
                                          {membro.especialidadeAtiva ===
                                            false && (
                                            <span className="opacity-70">
                                              (Inativa)
                                            </span>
                                          )}
                                        </span>
                                        {crmFormatado && (
                                          <span className="text-[11px] text-slate-500 font-mono font-semibold">
                                            {crmFormatado}
                                          </span>
                                        )}
                                      </div>
                                      {mostrarSubtitulo && (
                                        <span className="block text-[11px] text-slate-500">
                                          {membro.specialty}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusCfg.cor}`}
                                >
                                  {statusCfg.label}
                                </span>
                              </td>
                              {/* Coluna Ações */}
                              <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAbrirEditarModal(membro)
                                    }
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer"
                                    title="Editar dados e perfil do usuário"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Editar</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setMembroParaExcluir(membro)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                    title="Remover acesso deste usuário"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Excluir</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé com contagem */}
                <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-200/70 text-[11px] text-slate-500 flex items-center justify-between">
                  <span className="tabular-nums">
                    {equipeFiltrada.length}{" "}
                    {equipeFiltrada.length === 1
                      ? "membro cadastrado"
                      : "membros cadastrados"}
                  </span>
                  <span>Autenticação unificada por Username</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== ABA 2: ESPECIALIDADES ==================== */}
        {abaAtiva === "especialidades" && (
          <>
            {carregandoEspecialidades ? (
              <div className="cl-card flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="ml-2.5 text-xs font-medium text-slate-500">
                  Carregando especialidades da clínica...
                </span>
              </div>
            ) : (
              <div className="cl-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-50/90 border-b border-slate-200/80">
                      <tr>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Especialidade
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Médicos Ativos
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {especialidades.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 py-12 text-center text-slate-400 text-xs"
                          >
                            Nenhuma especialidade cadastrada. Clique em{" "}
                            <strong className="text-slate-600">
                              + Nova Especialidade
                            </strong>{" "}
                            para começar.
                          </td>
                        </tr>
                      ) : (
                        especialidades.map((esp) => {
                          const estilo = getCorEspecialidadeEstilo(esp.cor);
                          const totalMedicos = esp.medicosAtivosCount ?? 0;
                          const emProcesso =
                            alternandoEspecialidadeId === esp.id;

                          return (
                            <tr
                              key={esp.id}
                              className={`transition-colors ${
                                esp.ativo
                                  ? "hover:bg-emerald-50/30"
                                  : "bg-slate-50/60 opacity-80"
                              }`}
                            >
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`w-3 h-3 rounded-full shrink-0 ring-4 ring-white shadow-xs ${estilo.dotClass}`}
                                    aria-hidden="true"
                                  />
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    <span className="font-bold text-slate-900">
                                      {esp.nome}
                                    </span>
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${estilo.badgeClass}`}
                                    >
                                      {estilo.label}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums ${
                                    totalMedicos > 0
                                      ? "bg-slate-100 text-slate-800 border border-slate-200"
                                      : "bg-slate-50 text-slate-400 border border-slate-200/70"
                                  }`}
                                >
                                  <Stethoscope className="w-3.5 h-3.5 text-slate-500" />
                                  <span>
                                    {totalMedicos}{" "}
                                    {totalMedicos === 1
                                      ? "médico ativo"
                                      : "médicos ativos"}
                                  </span>
                                </span>
                              </td>

                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                    esp.ativo
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-slate-100 text-slate-500 border-slate-200"
                                  }`}
                                >
                                  {esp.ativo ? "Ativa" : "Inativa"}
                                </span>
                              </td>

                              <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAbrirEditarEspecialidade(esp)
                                    }
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-colors cursor-pointer"
                                    title="Editar nome e cor da especialidade"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Editar</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={emProcesso}
                                    onClick={() =>
                                      handleAlternarStatusEspecialidade(esp)
                                    }
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer disabled:opacity-60 ${
                                      esp.ativo
                                        ? "text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200"
                                        : "text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                                    }`}
                                    title={
                                      esp.ativo
                                        ? "Desativar especialidade para novos agendamentos (histórico preservado)"
                                        : "Reativar especialidade na clínica e na Agenda"
                                    }
                                  >
                                    {emProcesso ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Power className="w-3.5 h-3.5" />
                                    )}
                                    <span>
                                      {esp.ativo ? "Desativar" : "Ativar"}
                                    </span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-200/70 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                  <span className="tabular-nums">
                    {especialidadesAtivas.length} de {especialidades.length}{" "}
                    {especialidades.length === 1
                      ? "especialidade ativa"
                      : "especialidades ativas"}
                  </span>
                  <span>
                    Sincronizado em tempo real com Equipe & Acessos e Agenda
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== ABA 3: EXPORTAÇÃO DE DADOS & LGPD ==================== */}
        {abaAtiva === "exportacao" && isDiretoriaClinica && (
          <ExportacaoClinicaTab />
        )}

        {/* ==================== ABA 4: IMPORTAR DO ICLINIC ==================== */}
        {abaAtiva === "importacao" && isDiretoriaClinica && (
          <ImportacaoIClinicTab />
        )}
      </main>

      {/* ==================== MODAL DE CADASTRO / EDIÇÃO DE MEMBRO ==================== */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto border border-slate-200/90">
            <div className="cl-modal-header flex items-center justify-between px-6 py-4">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  {membroEmEdicao ? (
                    <Pencil className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </span>
                <span>
                  {membroEmEdicao
                    ? "Editar Membro da Equipe"
                    : "Cadastrar Novo Membro"}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSalvarMembro} className="px-6 py-5 space-y-4">
              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value.toUpperCase())}
                  placeholder="EX: DRA. ANA SILVA"
                  required
                  className="uppercase w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Nome de Usuário (Username) *
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Usado para login rápido
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm font-bold">
                    @
                  </span>
                  <input
                    name="username"
                    type="text"
                    value={formUsername}
                    onChange={(e) =>
                      setFormUsername(
                        e.target.value.toLowerCase().replace(/\s+/g, ""),
                      )
                    }
                    placeholder="ex: ana.silva ou recepcao"
                    required
                    pattern="^[a-zA-Z0-9._-]+$"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="no-uppercase lowercase w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    E-mail Profissional (Opcional)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Não obrigatório
                  </span>
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    name="email"
                    type="email"
                    value={formEmail}
                    onChange={(e) =>
                      setFormEmail(e.target.value.toLowerCase().trim())
                    }
                    placeholder="ana.silva@clinicafaaz.com.br"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="no-uppercase lowercase w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Cargo / Perfil */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Cargo / Perfil *
                </label>
                <select
                  value={formCargo}
                  onChange={(e) => {
                    const novoCargo = e.target.value;
                    setFormCargo(novoCargo);
                    if (!isCargoClinico(novoCargo)) {
                      setFormEspecialidadeId("");
                      setFormSubespecialidade("");
                      setFormCRM("");
                    } else if (!formEspecialidadeId && especialidadesAtivas[0]) {
                      setFormEspecialidadeId(especialidadesAtivas[0].id);
                    }
                  }}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="MEDICO">Médico (Atendimento Clínico)</option>
                  <option value="SECRETARIA">
                    Secretária (Agenda & Recepção)
                  </option>
                  <option value="ADMINISTRADOR">
                    Administrador (Gestão Financeira/Equipe)
                  </option>
                  <option value="DONO_CLINICA">
                    Diretoria Clínica (Acesso Total)
                  </option>
                </select>
              </div>

              {/* Campos clínicos condicionais — apenas Médico e Diretoria Clínica */}
              {isCargoClinico(formCargo) && (
                <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Atendimento Clínico & Agenda</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setModalAberto(false);
                        setAbaAtiva("especialidades");
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Gerenciar especialidades
                    </button>
                  </div>

                  {/* 1. Especialidade de Atendimento (carregada dinamicamente) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Especialidade de Atendimento *
                    </label>
                    <select
                      value={formEspecialidadeId}
                      onChange={(e) => setFormEspecialidadeId(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="">Selecione a especialidade...</option>
                      {opcoesEspecialidadeModal.map((esp) => (
                        <option key={esp.id} value={esp.id}>
                          {esp.nome}
                          {!esp.ativo ? " (Inativa)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Subespecialidade / Título de Exibição + 3. CRM */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Subespecialidade / Título
                      </label>
                      <input
                        type="text"
                        value={formSubespecialidade}
                        onChange={(e) =>
                          setFormSubespecialidade(e.target.value)
                        }
                        maxLength={100}
                        placeholder="Ex: Endocrinologia & Metabologia"
                        className="no-uppercase w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        CRM (Opcional)
                      </label>
                      <input
                        type="text"
                        value={formCRM}
                        onChange={(e) => setFormCRM(e.target.value.toUpperCase())}
                        maxLength={40}
                        placeholder="EX: CRM 54321/MG"
                        className="uppercase w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Senha */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {membroEmEdicao
                    ? "Nova Senha (Deixe em branco para manter a atual)"
                    : "Senha Inicial de Acesso *"}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    value={formSenha}
                    onChange={(e) => setFormSenha(e.target.value)}
                    placeholder={
                      membroEmEdicao
                        ? "Digite apenas se desejar trocar"
                        : "Mínimo 6 caracteres"
                    }
                    required={!membroEmEdicao}
                    minLength={membroEmEdicao ? 0 : 6}
                    autoComplete="new-password"
                    className="no-uppercase w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Botões do Modal */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>
                      {membroEmEdicao
                        ? "Salvar Alterações"
                        : "Cadastrar Membro"}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL DE NOVA / EDITAR ESPECIALIDADE ==================== */}
      {modalEspecialidadeAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200/90 overflow-hidden">
            <div className="cl-modal-header flex items-center justify-between px-6 py-4">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Tag className="w-4 h-4" />
                </span>
                <span>
                  {especialidadeEmEdicao
                    ? "Editar Especialidade"
                    : "Nova Especialidade"}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setModalEspecialidadeAberto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSalvarEspecialidade}
              className="px-6 py-5 space-y-5"
            >
              {/* Nome da Especialidade */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Nome da Especialidade *
                </label>
                <input
                  type="text"
                  value={formEspNome}
                  onChange={(e) => setFormEspNome(e.target.value)}
                  placeholder="Ex: Dermatologia, Nutrologia, Cardiologia..."
                  required
                  minLength={2}
                  maxLength={100}
                  autoFocus
                  className="no-uppercase w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Seletor Visual de Cor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Cor na Agenda *
                  </label>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${estiloPreviewCor.badgeClass}`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${estiloPreviewCor.dotClass}`}
                    />
                    <span>{formEspNome.trim() || "Pré-visualização"}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CORES_ESPECIALIDADE_LISTA.map((item) => {
                    const selecionada = formEspCor === item.token;
                    return (
                      <button
                        key={item.token}
                        type="button"
                        onClick={() => setFormEspCor(item.token)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          selecionada
                            ? item.modalPillActiveClass
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`w-3 h-3 rounded-full shrink-0 flex items-center justify-center ${item.dotClass}`}
                        >
                          {selecionada && (
                            <Check className="w-2 h-2 text-white stroke-[3]" />
                          )}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalEspecialidadeAberto(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoEspecialidade}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-60 flex items-center gap-2 cursor-pointer"
                >
                  {salvandoEspecialidade ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>
                      {especialidadeEmEdicao
                        ? "Salvar Alterações"
                        : "Criar Especialidade"}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== DIALOG DE CONFIRMAÇÃO DE EXCLUSÃO ==================== */}
      {membroParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200/90 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Remover Acesso da Equipe
                </h3>
                <p className="text-xs text-slate-500">
                  Confirmação de inativação de conta
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p>
                Tem certeza que deseja remover o acesso de{" "}
                <strong className="text-slate-900">
                  {membroParaExcluir.fullName}
                </strong>
                ?
              </p>
              <p className="font-mono text-emerald-800 font-bold">
                Username: @{membroParaExcluir.username}
              </p>
              <p className="text-slate-500 text-[11px] pt-1">
                O usuário perderá o acesso imediato ao painel da clínica.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={excluindo}
                onClick={() => setMembroParaExcluir(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={excluindo}
                onClick={handleConfirmarExclusao}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-60"
              >
                {excluindo ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removendo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sim, Remover Acesso</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
