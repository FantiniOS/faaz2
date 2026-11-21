"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Database,
  Eye,
  EyeOff,
  FileHeart,
  HeartPulse,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  User,
} from "lucide-react";

const ECOSYSTEM_PILLARS = [
  {
    title: "Prontuário & Telemetria",
    subtitle: "Evoluções, bioimpedância e adesão",
    icon: FileHeart,
    iconBg: "bg-emerald-50 border-emerald-200/80 text-emerald-700",
    dot: "bg-emerald-500",
  },
  {
    title: "Mapa Glicêmico & Nutrição",
    subtitle: "Curva glicêmica, insulinas e TACO",
    icon: HeartPulse,
    iconBg: "bg-teal-50 border-teal-200/80 text-teal-700",
    dot: "bg-teal-500",
  },
  {
    title: "App Paciente Sincronizado",
    subtitle: "Check-ins diários em tempo real",
    icon: Smartphone,
    iconBg: "bg-cyan-50 border-cyan-200/80 text-cyan-700",
    dot: "bg-cyan-500",
  },
] as const;

const SECURITY_SEALS = [
  { label: "Isolamento RBAC", icon: ShieldCheck },
  { label: "Criptografia TLS", icon: Lock },
  { label: "Oracle Cloud São Paulo", icon: Database },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [capsLockAtivo, setCapsLockAtivo] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Limpeza puramente local de resíduos de URL/storage após logout explícito — zero chamadas de rede/Oracle antes do submit
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1" || params.get("error") === "loop") {
      try {
        localStorage.removeItem("endoc_session");
        localStorage.removeItem("faaz_auth_user");
        sessionStorage.removeItem("faaz_auth_user");
        sessionStorage.removeItem("faaz_login_mounts");
      } catch {
        // Ignora restrições de storage do navegador
      }
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  function handleCheckCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") {
      setCapsLockAtivo(e.getModifierState("CapsLock"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedIdentifier = username.trim();
    if (!trimmedIdentifier || !senha) {
      setErro("Informe seu usuário ou e-mail e sua senha.");
      return;
    }

    setErro("");
    setCarregando(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedIdentifier,
          email: trimmedIdentifier,
          senha,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.sucesso) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setErro(data?.error || "Usuário ou senha inválidos.");
      setCarregando(false);
    } catch {
      setErro("Não foi possível conectar ao servidor. Tente novamente.");
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row bg-slate-50 text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      {/* ================================================================== */}
      {/* COLUNA ESQUERDA (~58%) — SHOWCASE CLÍNICO HIGH-TECH CLINICAL LIGHT */}
      {/* ================================================================== */}
      <section
        aria-label="Plataforma Clínica EnDoc 2.0"
        className="relative w-full lg:w-[58%] flex flex-col justify-between px-6 py-7 sm:px-10 sm:py-9 lg:px-12 xl:px-16 lg:py-9 overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-200/80"
        style={{
          background:
            "linear-gradient(145deg, #F8FAFC 0%, #F1FCF9 52%, #ECFDF5 100%)",
        }}
      >
        {/* Grade arquitetônica de precisão */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 cl-login-grid"
        />

        {/* 2 Auras luminosas suaves (GPU-friendly, baixa opacidade) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-28 -left-24 w-[420px] h-[420px] rounded-full blur-3xl cl-aura-a"
          style={{
            background:
              "radial-gradient(circle, rgba(16,185,129,0.16) 0%, rgba(20,184,166,0.06) 52%, transparent 74%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-24 w-[460px] h-[460px] rounded-full blur-3xl cl-aura-b"
          style={{
            background:
              "radial-gradient(circle, rgba(13,148,136,0.15) 0%, rgba(6,182,212,0.07) 48%, transparent 74%)",
          }}
        />

        {/* TOPO: Logo Oficial Clínica FAAZ + Pílula Tecnológica */}
        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 sm:h-10 flex items-center shrink-0">
              <Image
                src="/logo.png"
                alt="Clínica FAAZ"
                width={848}
                height={1024}
                className="h-9 sm:h-10 w-auto object-contain shrink-0"
                priority
              />
            </div>
            <div className="h-6 w-px bg-slate-200/90 hidden sm:block" />
            <div className="leading-tight">
              <span className="block text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-900">
                Clínica FAAZ
              </span>
              <span className="block text-[10px] font-semibold tracking-wide text-slate-500">
                Medicina &amp; Saúde Integrativa
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/85 backdrop-blur-md border border-emerald-500/20 shadow-[0_2px_10px_-4px_rgba(15,118,110,0.18)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-emerald-800">
              ENDOC 2.0 • CLINICAL INTELLIGENCE
            </span>
          </div>
        </header>

        {/* CENTRO: Headline Executiva + Peça Visual Glassmorphism HUD */}
        <div className="relative z-10 my-6 lg:my-0 flex flex-col gap-5 xl:gap-6 max-w-2xl">
          <div className="space-y-2.5">
            <h1 className="text-3xl sm:text-4xl xl:text-[42px] font-extrabold tracking-[-0.03em] leading-[1.08] text-slate-900">
              Inteligência Clínica{" "}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent">
                em Tempo Real.
              </span>
            </h1>
            <p className="text-sm sm:text-[15px] text-slate-600 font-medium leading-relaxed max-w-xl">
              Precisão endocrinológica, prontuário integrado e conexão contínua
              com a jornada diária de cada paciente — em uma única estação clínica.
            </p>
          </div>

          {/* PEÇA CENTRAL VISUAL — GLASSMORPHISM HUD */}
          <div className="relative rounded-3xl backdrop-blur-xl bg-white/75 border border-emerald-500/15 shadow-[0_28px_70px_-28px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] p-4 sm:p-5 space-y-4">
            {/* Barra superior do instrumento HUD */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0">
                  <Activity className="w-3.5 h-3.5" />
                </span>
                <div>
                  <span className="block text-xs font-extrabold text-slate-800 leading-tight">
                    Telemetria Biométrica Contínua
                  </span>
                  <span className="block text-[10px] font-medium text-slate-500">
                    Fluxo clínico unificado • Web &amp; Mobile
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50/90 border border-emerald-200/80 text-[10px] font-bold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Sincronia Ativa</span>
                </span>
                <span className="hidden sm:inline-block font-mono text-[10px] font-bold text-slate-400 bg-slate-100/80 border border-slate-200/70 px-2 py-0.5 rounded-md tabular-nums">
                  TLS 1.3
                </span>
              </div>
            </div>

            {/* Onda Biométrica / Telemetria SVG Animada */}
            <div className="relative rounded-2xl bg-gradient-to-b from-emerald-50/45 via-white/80 to-white/95 border border-slate-200/70 px-3 pt-3 pb-2 overflow-hidden">
              <svg
                viewBox="0 0 600 132"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-24 sm:h-28 xl:h-[124px] block"
                role="img"
                aria-label="Onda de telemetria clínica em tempo real"
              >
                <defs>
                  <linearGradient
                    id="clWaveAreaGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="132"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                    <stop offset="65%" stopColor="#14B8A6" stopOpacity="0.06" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient
                    id="clWaveStrokeGrad"
                    x1="0"
                    y1="66"
                    x2="600"
                    y2="66"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.45" />
                    <stop offset="45%" stopColor="#0D9488" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.65" />
                  </linearGradient>
                  <linearGradient
                    id="clWavePulseGrad"
                    x1="0"
                    y1="0"
                    x2="600"
                    y2="0"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#34D399" />
                    <stop offset="50%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#06B6D4" />
                  </linearGradient>
                  <filter
                    id="clWaveGlow"
                    x="-10%"
                    y="-30%"
                    width="120%"
                    height="160%"
                  >
                    <feGaussianBlur stdDeviation="3.2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Linhas horizontais de referência clínica */}
                <line
                  x1="0"
                  y1="28"
                  x2="600"
                  y2="28"
                  stroke="#CBD5E1"
                  strokeOpacity="0.45"
                  strokeDasharray="3 5"
                />
                <line
                  x1="0"
                  y1="66"
                  x2="600"
                  y2="66"
                  stroke="#94A3B8"
                  strokeOpacity="0.35"
                  strokeDasharray="3 5"
                />
                <line
                  x1="0"
                  y1="104"
                  x2="600"
                  y2="104"
                  stroke="#CBD5E1"
                  strokeOpacity="0.45"
                  strokeDasharray="3 5"
                />

                {/* Área suave sob a curva */}
                <path
                  d="M0 92 C48 92 66 78 106 78 C144 78 164 42 204 42 C240 42 252 84 286 84 C312 84 324 22 346 22 C366 22 378 96 402 96 C428 96 446 54 486 54 C526 54 548 68 600 60 L600 132 L0 132 Z"
                  fill="url(#clWaveAreaGrad)"
                />

                {/* Curva base contínua */}
                <path
                  d="M0 92 C48 92 66 78 106 78 C144 78 164 42 204 42 C240 42 252 84 286 84 C312 84 324 22 346 22 C366 22 378 96 402 96 C428 96 446 54 486 54 C526 54 548 68 600 60"
                  stroke="url(#clWaveStrokeGrad)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Pulso luminoso percorrendo o traçado via CSS @keyframes */}
                <path
                  d="M0 92 C48 92 66 78 106 78 C144 78 164 42 204 42 C240 42 252 84 286 84 C312 84 324 22 346 22 C366 22 378 96 402 96 C428 96 446 54 486 54 C526 54 548 68 600 60"
                  stroke="url(#clWavePulseGrad)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#clWaveGlow)"
                  className="cl-wave-pulse-stroke"
                />

                {/* Pontos nodais de telemetria */}
                <circle cx="204" cy="42" r="4" fill="#FFFFFF" stroke="#059669" strokeWidth="2.2" />
                <circle cx="346" cy="22" r="5" fill="#10B981" fillOpacity="0.22" />
                <circle cx="346" cy="22" r="3.5" fill="#059669" stroke="#FFFFFF" strokeWidth="1.8" />
                <circle cx="486" cy="54" r="4" fill="#FFFFFF" stroke="#0D9488" strokeWidth="2.2" />
              </svg>

              {/* Eixo discreto de telemetria */}
              <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                <span>FAIXA METABÓLICA ALVO</span>
                <span className="text-emerald-700 font-semibold">
                  MONITORAMENTO EM TEMPO REAL
                </span>
              </div>
            </div>

            {/* 3 Micro-cards limpos do Ecossistema Real */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {ECOSYSTEM_PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className="rounded-2xl bg-white/90 border border-slate-200/80 p-3 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.18)] flex flex-col gap-2 transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 ${pillar.iconBg}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full ${pillar.dot}`} />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-slate-900 leading-snug">
                        {pillar.title}
                      </p>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5 leading-snug">
                        {pillar.subtitle}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RODAPÉ DA VITRINE: 3 Selos Discretos de Engenharia */}
        <footer className="relative z-10 pt-5 lg:pt-4 border-t border-slate-200/75 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {SECURITY_SEALS.map((seal) => {
              const Icon = seal.icon;
              return (
                <div
                  key={seal.label}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"
                >
                  <Icon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{seal.label}</span>
                </div>
              );
            })}
          </div>
          <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
            LGPD • CFM
          </span>
        </footer>
      </section>

      {/* ================================================================== */}
      {/* COLUNA DIREITA (~42%) — PORTAL DE ACESSO CIRÚRGICO                 */}
      {/* ================================================================== */}
      <main className="relative w-full lg:w-[42%] flex-1 flex items-center justify-center px-5 py-10 sm:px-10 lg:px-12 bg-white">
        {/* Glow cerâmico quase imperceptível no canto superior direito */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 w-72 h-72 rounded-full blur-3xl opacity-60"
          style={{
            background:
              "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 72%)",
          }}
        />

        <div className="relative z-10 w-full max-w-[420px]">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.04)] p-7 sm:p-9 space-y-6">
            {/* Cabeçalho Minimalista */}
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100/90 border border-slate-200/80 text-[10px] font-extrabold tracking-[0.14em] uppercase text-slate-600">
                <Lock className="w-3 h-3 text-emerald-600" />
                <span>Acesso Restrito</span>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-[-0.025em] text-slate-900">
                  Bem-vindo ao EnDoc
                </h2>
                <p className="text-xs sm:text-[13px] text-slate-500 font-medium mt-1">
                  Autentique-se com suas credenciais da equipe
                </p>
              </div>
            </div>

            {/* Feedback de Erro Elegante (sem revelar existência do usuário) */}
            {erro ? (
              <div
                role="alert"
                className="cl-error-enter rounded-2xl bg-rose-50/90 border border-rose-200/90 px-3.5 py-3 flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-rose-800 leading-relaxed">
                  {erro}
                </p>
              </div>
            ) : null}

            {/* Formulário Cirúrgico */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Campo: Usuário ou E-mail */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-username"
                  className="block text-xs font-bold text-slate-700 tracking-wide"
                >
                  Usuário ou E-mail
                </label>
                <div className="relative group">
                  <User className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (erro) setErro("");
                    }}
                    placeholder="usuario ou e-mail institucional"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={carregando}
                    className="no-uppercase w-full h-11 pl-10 pr-4 bg-slate-50/80 border border-slate-200/90 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/12 transition-all disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Campo: Senha com detector nativo de Caps Lock */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-bold text-slate-700 tracking-wide"
                  >
                    Senha
                  </label>
                  {capsLockAtivo ? (
                    <span
                      role="status"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/90 text-[10px] font-bold text-amber-700"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>Caps Lock ativado</span>
                    </span>
                  ) : null}
                </div>
                <div className="relative group">
                  <Lock className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    name="password"
                    type={mostrarSenha ? "text" : "password"}
                    value={senha}
                    onChange={(e) => {
                      setSenha(e.target.value);
                      if (erro) setErro("");
                    }}
                    onKeyDown={handleCheckCapsLock}
                    onKeyUp={handleCheckCapsLock}
                    onBlur={() => setCapsLockAtivo(false)}
                    placeholder="Digite sua senha"
                    required
                    autoComplete="current-password"
                    disabled={carregando}
                    className="no-uppercase w-full h-11 pl-10 pr-11 bg-slate-50/80 border border-slate-200/90 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/12 transition-all disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((prev) => !prev)}
                    disabled={carregando}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Botão Primário de Alto Impacto */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={carregando}
                  className="cl-btn-shimmer relative overflow-hidden group w-full h-11.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:via-emerald-700 hover:to-teal-700 text-white text-sm font-bold shadow-[0_12px_28px_-10px_rgba(5,150,105,0.65)] hover:shadow-[0_16px_32px_-10px_rgba(5,150,105,0.78)] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-65 disabled:cursor-not-allowed"
                >
                  {carregando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Autenticando...</span>
                    </>
                  ) : (
                    <>
                      <span>Acessar Painel Clínico</span>
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Rodapé do Card */}
            <div className="pt-5 border-t border-slate-100 space-y-3">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Acesso exclusivo para profissionais autorizados da Clínica FAAZ.
                Precisa de acesso ou redefinição? Contate a administração.
              </p>
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
                <div className="flex items-center gap-2.5">
                  <span>Clínica FAAZ</span>
                  <span className="text-slate-300">•</span>
                  <Link
                    href="/privacidade"
                    className="text-slate-500 hover:text-emerald-700 transition-colors underline-offset-2 hover:underline"
                  >
                    Privacidade &amp; LGPD
                  </Link>
                </div>
                <span className="font-mono px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/70 text-slate-500">
                  EnDoc 2.0
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
