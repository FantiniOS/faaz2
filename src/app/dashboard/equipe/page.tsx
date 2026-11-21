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
  User,
  KeyRound,
  Mail,
} from "lucide-react";
import { TopMenu } from "@/components/TopMenu";
import { formatarDataBR } from "@/lib/date-br";

interface MembroEquipe {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  cargo: string;
  role: string;
  specialty: string | null;
  councilType: string | null;
  councilNumber: string | null;
  accountStatus: string;
  lastLoginAt: string | null;
  createdAt: string;
}

const cargoConfig: Record<string, { label: string; cor: string; icon: React.ElementType }> = {
  DONO_CLINICA: { label: "Diretoria Clínica", cor: "bg-emerald-50 text-emerald-800 border border-emerald-200", icon: Shield },
  MEDICO: { label: "Médico", cor: "bg-sky-50 text-sky-800 border border-sky-200", icon: Stethoscope },
  SECRETARIA: { label: "Secretária", cor: "bg-amber-50 text-amber-800 border border-amber-200", icon: ClipboardList },
  ADMINISTRADOR: { label: "Administrador", cor: "bg-violet-50 text-violet-800 border border-violet-200", icon: Building2 },
};

const statusConfig: Record<string, { label: string; cor: string }> = {
  ACTIVE: { label: "Ativo", cor: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  PENDING_INVITE: { label: "Convite Pendente", cor: "bg-amber-50 text-amber-700 border border-amber-200" },
  REVOKED: { label: "Revogado", cor: "bg-rose-50 text-rose-700 border border-rose-200" },
  LOCKED: { label: "Bloqueado", cor: "bg-slate-100 text-slate-600 border border-slate-200" },
};

export default function EquipePage() {
  const router = useRouter();
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  
  // Controle de Modais
  const [modalAberto, setModalAberto] = useState(false);
  const [membroEmEdicao, setMembroEmEdicao] = useState<MembroEquipe | null>(null);
  const [membroParaExcluir, setMembroParaExcluir] = useState<MembroEquipe | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  // Campos do Formulário
  const [formNome, setFormNome] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCargo, setFormCargo] = useState("MEDICO");
  const [formSenha, setFormSenha] = useState("");
  const [formEspecialidade, setFormEspecialidade] = useState("");
  const [formCRM, setFormCRM] = useState("");

  const carregarEquipe = useCallback(async () => {
    try {
      const res = await fetch("/api/equipe");
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

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => {
      if (ativo) {
        void carregarEquipe();
      }
    });
    return () => {
      ativo = false;
    };
  }, [carregarEquipe]);

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
      normalizarBusca(cargoConfig[m.cargo]?.label || "").includes(termoBusca)
  );

  function handleAbrirNovoModal() {
    setMembroEmEdicao(null);
    setFormNome("");
    setFormUsername("");
    setFormEmail("");
    setFormCargo("MEDICO");
    setFormSenha("");
    setFormEspecialidade("");
    setFormCRM("");
    setMensagem(null);
    setModalAberto(true);
  }

  function handleAbrirEditarModal(membro: MembroEquipe) {
    setMembroEmEdicao(membro);
    setFormNome(membro.fullName);
    setFormUsername(membro.username || "");
    setFormEmail(membro.email || "");
    setFormCargo(membro.cargo);
    setFormSenha("");
    setFormEspecialidade(membro.specialty || "");
    setFormCRM(membro.councilNumber || "");
    setMensagem(null);
    setModalAberto(true);
  }

  async function handleSalvarMembro(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setMensagem(null);

    const isEdicao = Boolean(membroEmEdicao);
    const endpoint = isEdicao
      ? `/api/usuarios/${membroEmEdicao!.id}`
      : "/api/equipe";
    const method = isEdicao ? "PUT" : "POST";

    const payload: Record<string, string | undefined> = {
      nome: formNome.trim(),
      username: formUsername.trim().toLowerCase(),
      email: formEmail.trim() ? formEmail.trim().toLowerCase() : undefined,
      cargo: formCargo,
      especialidade: formEspecialidade.trim() || undefined,
      crm: formCRM.trim() || undefined,
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
        setMensagem({
          tipo: "sucesso",
          texto: isEdicao
            ? `Membro ${formNome} atualizado com sucesso!`
            : `${formNome} (@${formUsername}) cadastrado com sucesso!`,
        });
        setModalAberto(false);
        carregarEquipe();
      } else {
        setMensagem({ tipo: "erro", texto: data.error || "Erro ao salvar membro." });
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
        setMensagem({
          tipo: "sucesso",
          texto: data.mensagem || `Acesso de ${membroParaExcluir.fullName} removido com sucesso.`,
        });
        setMembroParaExcluir(null);
        carregarEquipe();
      } else {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Não foi possível remover o acesso do membro.",
        });
      }
    } catch {
      setMensagem({ tipo: "erro", texto: "Erro de conexão ao remover membro." });
    } finally {
      setExcluindo(false);
    }
  }

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
                  <span>Administração • Acessos</span>
                </span>
                <span className="cl-badge-slate px-2.5 py-0.5 text-[11px] font-mono tabular-nums">
                  {equipe.length} {equipe.length === 1 ? "membro" : "membros"}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Configurações & Gestão da Equipe
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Cadastre, edite e gerencie os acessos e perfis da equipe da clínica.
              </p>
            </div>
          </div>

          <button
            onClick={handleAbrirNovoModal}
            className="cl-btn-primary px-4 py-2 text-xs self-start sm:self-center active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Membro</span>
          </button>
        </div>

        {/* Toast de Feedback */}
        {mensagem && (
          <div
            className={`rounded-2xl p-4 flex items-center gap-3 text-xs sm:text-sm font-semibold animate-in fade-in slide-in-from-top-1 duration-200 ${
              mensagem.tipo === "sucesso"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
          >
            {mensagem.tipo === "sucesso" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{mensagem.texto}</span>
          </div>
        )}

        {/* Busca */}
        <div className="cl-card px-3.5 py-2.5 max-w-md flex items-center gap-2.5 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/15 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome, username, e-mail ou cargo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-transparent text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
          />
        </div>

        {/* Tabela da Equipe */}
        {carregando ? (
          <div className="cl-card flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="ml-2.5 text-xs font-medium text-slate-500">Carregando equipe da clínica...</span>
          </div>
        ) : (
          <div className="cl-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left">
                <thead className="bg-slate-50/90 border-b border-slate-200/80">
                  <tr>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nome & Usuário</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Username</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">E-mail</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cargo</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Especialidade / CRM</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {equipeFiltrada.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
                        {busca ? "Nenhum membro encontrado com esse filtro." : "Nenhum membro cadastrado ainda."}
                      </td>
                    </tr>
                  ) : (
                    equipeFiltrada.map((membro) => {
                      const cfg = cargoConfig[membro.cargo] || cargoConfig.MEDICO;
                      const Icon = cfg.icon;
                      const statusCfg = statusConfig[membro.accountStatus] || statusConfig.ACTIVE;

                      return (
                        <tr key={membro.id} className="hover:bg-emerald-50/35 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 shrink-0">
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 block">{membro.fullName}</span>
                                <span className="text-[11px] text-slate-400 tabular-nums">
                                  Cadastrado em {formatarDataBR(membro.createdAt)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                              @{membro.username}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{membro.email || "—"}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cfg.cor}`}>
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 text-xs">
                            {membro.specialty || "—"}
                            {membro.councilNumber && (
                              <span className="ml-1.5 text-[11px] text-slate-400 font-mono">
                                ({membro.councilType || "CRM"} {membro.councilNumber})
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusCfg.cor}`}>
                              {statusCfg.label}
                            </span>
                          </td>
                          {/* Coluna Ações */}
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAbrirEditarModal(membro)}
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
                {equipeFiltrada.length === 1 ? "membro cadastrado" : "membros cadastrados"}
              </span>
              <span>Autenticação unificada por Username</span>
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE CADASTRO / EDIÇÃO DE MEMBRO */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto border border-slate-200/90">
            {/* Header Clinical Light Glass */}
            <div className="cl-modal-header flex items-center justify-between px-6 py-4">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  {membroEmEdicao ? (
                    <Pencil className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </span>
                <span>{membroEmEdicao ? "Editar Membro da Equipe" : "Cadastrar Novo Membro"}</span>
              </h3>
              <button
                onClick={() => setModalAberto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSalvarMembro} className="px-6 py-5 space-y-4">
              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nome Completo *</label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Dra. Ana Silva"
                  required
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Username (Obrigatório) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Nome de Usuário (Username) *
                  </label>
                  <span className="text-[11px] text-slate-400">Usado para login rápido</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm font-bold">@</span>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="ex: ana.silva ou recepcao"
                    required
                    pattern="^[a-zA-Z0-9._-]+$"
                    className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* E-mail (Opcional) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    E-mail Profissional (Opcional)
                  </label>
                  <span className="text-[11px] text-slate-400">Não obrigatório</span>
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="ana.silva@clinicafaaz.com.br"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Cargo / Perfil */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cargo / Perfil *</label>
                <select
                  value={formCargo}
                  onChange={(e) => setFormCargo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="MEDICO">Médico (Atendimento Clínico)</option>
                  <option value="SECRETARIA">Secretária (Agenda & Recepção)</option>
                  <option value="ADMINISTRADOR">Administrador (Gestão Financeira/Equipe)</option>
                  <option value="DONO_CLINICA">Diretoria Clínica (Acesso Total)</option>
                </select>
              </div>

              {/* Campos condicionais para médicos */}
              {(formCargo === "MEDICO" || formCargo === "DONO_CLINICA") && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Especialidade</label>
                    <input
                      type="text"
                      value={formEspecialidade}
                      onChange={(e) => setFormEspecialidade(e.target.value)}
                      placeholder="Ex: Endocrinologia"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">CRM</label>
                    <input
                      type="text"
                      value={formCRM}
                      onChange={(e) => setFormCRM(e.target.value)}
                      placeholder="12345/SP"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Senha */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {membroEmEdicao ? "Nova Senha (Deixe em branco para manter a atual)" : "Senha Inicial de Acesso *"}
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    value={formSenha}
                    onChange={(e) => setFormSenha(e.target.value)}
                    placeholder={membroEmEdicao ? "Digite apenas se desejar trocar" : "Mínimo 6 caracteres"}
                    required={!membroEmEdicao}
                    minLength={membroEmEdicao ? 0 : 6}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
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
                    <span>{membroEmEdicao ? "Salvar Alterações" : "Cadastrar Membro"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIALOG DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {membroParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200/90 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Remover Acesso da Equipe</h3>
                <p className="text-xs text-slate-500">Confirmação de inativação de conta</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p>
                Tem certeza que deseja remover o acesso de{" "}
                <strong className="text-slate-900">{membroParaExcluir.fullName}</strong>?
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
