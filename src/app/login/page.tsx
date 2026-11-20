"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Activity,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  AlertCircle,
  Loader2,
  Shield,
  Stethoscope,
  ClipboardList,
  Building2,
  Smartphone,
  CheckCircle2,
  Zap,
} from "lucide-react";

interface PerfilHomologacao {
  cargo: "DONO_CLINICA" | "MEDICO" | "SECRETARIA" | "ADMINISTRADOR";
  nome: string;
  username: string;
  email: string;
  badge: string;
  badgeCor: string;
  bordaCor: string;
  bgCor: string;
  icon: React.ElementType;
  descricao: string;
}

const PERFIS_HOMOLOGACAO: PerfilHomologacao[] = [
  {
    cargo: "DONO_CLINICA",
    nome: "Dr. Carlos Fantini",
    username: "carlos.fantini",
    email: "carlos.fantini@clinicafaaz.com.br",
    badge: "Acesso Total + Prontuários + Gestão",
    badgeCor: "bg-emerald-100 text-emerald-800 border-emerald-300",
    bordaCor: "hover:border-emerald-500",
    bgCor: "bg-emerald-50/40",
    icon: Shield,
    descricao: "Poder administrativo irrestrito + acesso a todos os prontuários, dietas e relatórios.",
  },
  {
    cargo: "MEDICO",
    nome: "Dr. Rodrigo Mendes",
    username: "rodrigo.mendes",
    email: "medico.parceiro@clinicafaaz.com.br",
    badge: "Acesso Clínico aos Prontuários",
    badgeCor: "bg-blue-100 text-blue-800 border-blue-300",
    bordaCor: "hover:border-blue-500",
    bgCor: "bg-blue-50/40",
    icon: Stethoscope,
    descricao: "Atendimento clínico, prescrições, condutas e histórico de saúde dos pacientes.",
  },
  {
    cargo: "SECRETARIA",
    nome: "Patrícia Santos",
    username: "patricia.santos",
    email: "secretaria@clinicafaaz.com.br",
    badge: "Recepção & Agenda (Sem Prontuário)",
    badgeCor: "bg-amber-100 text-amber-800 border-amber-300",
    bordaCor: "hover:border-amber-500",
    bgCor: "bg-amber-50/40",
    icon: ClipboardList,
    descricao: "Controle de recepção e novos cadastros. Trava de segurança (RBAC) bloqueia prontuários.",
  },
  {
    cargo: "ADMINISTRADOR",
    nome: "Eduardo Lima",
    username: "eduardo.lima",
    email: "admin@clinicafaaz.com.br",
    badge: "Gestão & Financeiro (Sem Prontuário)",
    badgeCor: "bg-purple-100 text-purple-800 border-purple-300",
    bordaCor: "hover:border-purple-500",
    bgCor: "bg-purple-50/40",
    icon: Building2,
    descricao: "Gestão operacional, cadastros de equipe e faturamento. Bloqueado para dados médicos.",
  },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [perfilAtivo, setPerfilAtivo] = useState<string | null>(null);
  const hasVerifiedMountRef = useRef(false);

  // Função de fallback para limpar cookies e storage corrompidos e quebrar qualquer ciclo
  async function limparEstadoCorrompidoClient() {
    try {
      document.cookie =
        "endoc_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
      localStorage.removeItem("endoc_session");
      localStorage.removeItem("faaz_auth_user");
      sessionStorage.removeItem("faaz_auth_user");
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      // Ignora falhas de rede na limpeza preventiva
    }
  }

  // Auditoria de montagem: detecta ?error=loop ou sessão corrompida e estabiliza a tela
  useEffect(() => {
    if (typeof window === "undefined" || hasVerifiedMountRef.current) return;
    hasVerifiedMountRef.current = true;

    async function verificarOuLimparSessao() {
      const params = new URLSearchParams(window.location.search);
      const isExplicitLoop =
        params.get("error") === "loop" || params.get("logout") === "1";

      // Detector automático de loop rápido via sessionStorage (3+ montagens em < 4s)
      const now = Date.now();
      let recentMounts: number[] = [];
      try {
        const raw = sessionStorage.getItem("faaz_login_mounts");
        if (raw) {
          recentMounts = (JSON.parse(raw) as number[]).filter(
            (t) => now - t < 4000
          );
        }
        recentMounts.push(now);
        sessionStorage.setItem("faaz_login_mounts", JSON.stringify(recentMounts));
      } catch {
        // Ignora erro de storage
      }

      const isRapidLoopDetected = recentMounts.length >= 3;

      if (isExplicitLoop || isRapidLoopDetected) {
        await limparEstadoCorrompidoClient();
        try {
          sessionStorage.removeItem("faaz_login_mounts");
        } catch {}
        if (window.location.search) {
          window.history.replaceState({}, "", "/login");
        }
        return;
      }

      // Verifica se existe uma sessão genuinamente válida na API
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.autenticado && data.usuario) {
            try {
              sessionStorage.removeItem("faaz_login_mounts");
            } catch {}
            window.location.replace("/dashboard");
            return;
          }
        }
        // Se a sessão falhar na verificação (401 ou inválida), limpa resíduos locais sem redirecionar
        await limparEstadoCorrompidoClient();
      } catch {
        await limparEstadoCorrompidoClient();
      }
    }

    verificarOuLimparSessao();
  }, []);

  // Submissão do formulário manual
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: username.trim(), // fallback retrocompatível
          senha,
        }),
      });

      const data = await res.json();

      if (res.ok && data.sucesso) {
        window.location.assign("/dashboard");
      } else {
        setErro(data.error || "Credenciais inválidas. Verifique o usuário e a senha.");
        setCarregando(false);
      }
    } catch {
      setErro("Falha de conexão com o servidor da Clínica FAAZ.");
      setCarregando(false);
    }
  }

  // Acesso rápido de 1 clique para homologação
  async function handleQuickLogin(perfil: PerfilHomologacao) {
    setUsername(perfil.username);
    setSenha("faaz123");
    setErro("");
    setCarregando(true);
    setPerfilAtivo(perfil.cargo);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: perfil.username,
          email: perfil.email,
          senha: "faaz123",
          autoCargo: perfil.cargo,
        }),
      });

      const data = await res.json();

      if (res.ok && data.sucesso) {
        window.location.assign("/dashboard");
      } else {
        setErro(data.error || "Não foi possível autenticar o perfil de teste.");
        setCarregando(false);
        setPerfilAtivo(null);
      }
    } catch {
      setErro("Erro de conexão ao efetuar login rápido.");
      setCarregando(false);
      setPerfilAtivo(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row cl-page">
      {/* ======================================================== */}
      {/* PAINEL ESQUERDO — CLINICAL LIGHT GLASS BRANDING          */}
      {/* ======================================================== */}
      <div className="w-full lg:w-5/12 bg-white border-b lg:border-b-0 lg:border-r border-slate-200/80 text-slate-900 p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        {/* Aurora radial esmeralda/ciano claro sutil */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(16,185,129,0.14) 0%, rgba(20,184,166,0.05) 55%, transparent 75%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-28 -left-20 w-96 h-96 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(6,182,212,0.11) 0%, rgba(16,185,129,0.04) 55%, transparent 75%)",
          }}
        />

        <div className="relative z-10 space-y-6">
          {/* Logo e Título */}
          <div className="flex items-center gap-3">
            <div className="h-10 max-h-10 flex items-center shrink-0 overflow-hidden">
              <Image
                src="/logo.png"
                alt="Clínica FAAZ"
                width={848}
                height={1024}
                className="h-10 w-auto object-contain shrink-0"
                priority
              />
            </div>
            <div>
              <p className="text-xs text-emerald-700 font-extrabold tracking-wider uppercase">
                Clínica FAAZ • Medicina & Saúde Integrativa
              </p>
            </div>
          </div>

          <div>
            <span className="cl-badge-emerald px-2.5 py-0.5 text-[10px] uppercase tracking-widest mb-2.5">
              Clinical Command Center • Oracle ADB
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight mt-2">
              Painel Clínico Inteligente
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
              Sistema com isolamento rigoroso por perfil de acesso (RBAC), monitoramento de
              aderência hídrica coletiva e saúde intestinal em tempo real.
            </p>
          </div>

          {/* Banner de Credenciais Globais de Homologação */}
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 uppercase tracking-wider">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Credenciais Padrão de Homologação</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Senha padrão para todos os perfis web da equipe:{" "}
              <code className="bg-white border border-slate-200 px-2 py-0.5 rounded-md font-mono font-bold text-emerald-700 text-xs shadow-2xs">
                faaz123
              </code>
            </p>
            <div className="text-[11px] text-slate-500 pt-1.5 border-t border-slate-200/80">
              Ou utilize os botões de <strong className="text-slate-800">1 Clique</strong> ao lado para entrar diretamente sem digitar.
            </div>
          </div>

          {/* Card informativo do App Mobile (Paciente) */}
          <div className="bg-emerald-50/55 border border-emerald-200/80 rounded-2xl p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>Acesso no App Mobile (Paciente)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Para testar o aplicativo no emulador Android, utilize um dos CPFs cadastrados:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-200/70 shadow-2xs">
                <span className="text-[10px] text-emerald-700 font-bold block">Carlos Fantini (Meta 2.5L)</span>
                <code className="text-xs font-mono font-bold text-slate-900 tabular-nums">111.222.333-44</code>
              </div>
              <div className="bg-white/90 p-2.5 rounded-xl border border-teal-200/70 shadow-2xs">
                <span className="text-[10px] text-teal-700 font-bold block">Maria Luiza (Meta 3.0L)</span>
                <code className="text-xs font-mono font-bold text-slate-900 tabular-nums">222.333.444-55</code>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé institucional */}
        <div className="relative z-10 pt-6 mt-6 border-t border-slate-200/80 text-xs text-slate-500 flex items-center justify-between">
          <span>Clínica FAAZ • Endocrinologia & Nutrologia</span>
          <span className="font-mono text-slate-400">Versão 2.0.4</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* PAINEL DIREITO — FORMULÁRIO & ATALHOS DE HOMOLOGAÇÃO */}
      {/* ======================================================== */}
      <div className="w-full lg:w-7/12 p-6 sm:p-10 lg:p-12 overflow-y-auto max-h-screen">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Controle de Acesso Seguro • RBAC
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
              Autenticação de Equipe
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Escolha um perfil para teste imediato ou preencha as credenciais manualmente.
            </p>
          </div>

          {/* Feedback de erro */}
          {erro && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in duration-150">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-rose-800">{erro}</p>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* SEÇÃO 1: MODO HOMOLOGAÇÃO — 4 BOTÕES DE 1 CLIQUE */}
          {/* ======================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Acesso Rápido de Homologação (1 Clique)
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">
                Selecione o perfil desejado
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {PERFIS_HOMOLOGACAO.map((perfil) => {
                const Icon = perfil.icon;
                const isLoggingThis = perfilAtivo === perfil.cargo && carregando;

                return (
                  <button
                    key={perfil.cargo}
                    type="button"
                    onClick={() => handleQuickLogin(perfil)}
                    disabled={carregando}
                    className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group shadow-2xs hover:shadow-md cursor-pointer ${
                      perfil.bgCor
                    } border-slate-200 ${perfil.bordaCor} disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 text-slate-700 shadow-2xs group-hover:scale-105 transition-transform">
                        {isLoggingThis ? (
                          <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                        ) : (
                          <Icon className="w-4.5 h-4.5" />
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${perfil.badgeCor}`}
                      >
                        {perfil.badge}
                      </span>
                    </div>

                    <div className="mt-3">
                      <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {perfil.nome}
                      </h4>
                      <p className="text-[11px] text-emerald-700 font-mono font-bold mt-0.5">
                        @{perfil.username}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {perfil.email}
                      </p>
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                        {perfil.descricao}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-emerald-700">
                      <span>{isLoggingThis ? "Entrando..." : "Entrar com 1 Clique"}</span>
                      <span className="text-sm group-hover:translate-x-1 transition-transform">➔</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DIVISOR ESTILIZADO */}
          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-200" />
            <span className="absolute bg-slate-50 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              Ou faça login digitando
            </span>
          </div>

          {/* ======================================================== */}
          {/* SEÇÃO 2: FORMULÁRIO MANUAL (USERNAME E SENHA) */}
          {/* ======================================================== */}
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <label
                htmlFor="username-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Usuário
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="username-input"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: carlos.fantini, secretaria ou admin"
                  required
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="senha-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="senha-input"
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Sua senha de acesso"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label={mostrarSenha ? "Ocultar senha" : "Ver senha"}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={carregando}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {carregando && !perfilAtivo ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <span>Entrar no Painel Clínico</span>
                )}
              </button>
            </div>
          </form>

          {/* ======================================================== */}
          {/* SEÇÃO 3: TABELA RESUMO DE CREDENCIAIS DISPONÍVEIS */}
          {/* ======================================================== */}
          <div className="bg-slate-100/70 rounded-2xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Resumo dos Acessos de Homologação</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase">
                    <th className="pb-1.5">Cargo</th>
                    <th className="pb-1.5">Usuário (Login)</th>
                    <th className="pb-1.5">Senha</th>
                    <th className="pb-1.5">Prontuários</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50">
                  <tr>
                    <td className="py-1 font-bold text-slate-800">Dono</td>
                    <td className="py-1 font-mono text-emerald-700 font-bold">carlos.fantini</td>
                    <td className="py-1 font-mono text-slate-500">faaz123</td>
                    <td className="py-1 text-emerald-600 font-bold">Total (Sim)</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-bold text-slate-800">Médico</td>
                    <td className="py-1 font-mono text-emerald-700 font-bold">rodrigo.mendes</td>
                    <td className="py-1 font-mono text-slate-500">faaz123</td>
                    <td className="py-1 text-emerald-600 font-bold">Clínico (Sim)</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-bold text-slate-800">Secretária</td>
                    <td className="py-1 font-mono text-emerald-700 font-bold">patricia.santos</td>
                    <td className="py-1 font-mono text-slate-500">faaz123</td>
                    <td className="py-1 text-rose-600 font-bold">Bloqueado (Não)</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-bold text-slate-800">Admin</td>
                    <td className="py-1 font-mono text-emerald-700 font-bold">eduardo.lima</td>
                    <td className="py-1 font-mono text-slate-500">faaz123</td>
                    <td className="py-1 text-rose-600 font-bold">Bloqueado (Não)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
