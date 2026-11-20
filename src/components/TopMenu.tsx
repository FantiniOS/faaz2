"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  Search,
  Bell,
  Menu,
  X,
  Users,
  Calendar,
  AlertCircle,
  LayoutDashboard,
  Settings,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { mockUserSession, UserSession } from "@/mocks/dashboard";
import { CommandPalette } from "@/components/CommandPalette";
import { podeGerenciarEquipe } from "@/lib/auth-rbac";

interface TopMenuProps {
  user?: UserSession & { cargo?: string };
  activePath?: string;
}

interface NavLinkItem {
  label: string;
  href: string;
  icon: React.ElementType;
  somenteAdmin?: boolean;
  badge?: number;
}

const ALL_NAV_LINKS: NavLinkItem[] = [
  { label: "Início", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pacientes", href: "/dashboard/pacientes", icon: Users },
  { label: "Agenda", href: "/agenda", icon: Calendar },
  { label: "Configurações", href: "/dashboard/equipe", icon: Settings, somenteAdmin: true },
];

// Cache em nível de módulo para evitar pisca-pisca entre trocas de rota, sempre revalidado em /api/auth/me
let cachedAuthUser: { nome: string; cargo: string } | null = null;

export function TopMenu({
  user = mockUserSession,
  activePath = "/dashboard",
}: TopMenuProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [authUser, setAuthUser] = useState<{ nome: string; cargo: string } | null>(
    () => cachedAuthUser
  );

  // Atalho Global: Ctrl + K (Windows) / Cmd + K (Mac) para abrir a Busca Global Dinâmica
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let mounted = true;
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json.autenticado && json.usuario) {
            const nextUser = {
              nome: String(json.usuario.nome || ""),
              cargo: String(json.usuario.cargo || "MEDICO"),
            };
            cachedAuthUser = nextUser;
            if (mounted) {
              setAuthUser((prev) => {
                if (
                  prev &&
                  prev.nome === nextUser.nome &&
                  prev.cargo === nextUser.cargo
                ) {
                  return prev;
                }
                return nextUser;
              });
            }
          } else {
            cachedAuthUser = null;
            if (mounted) setAuthUser(null);
          }
        }
      } catch {
        // Mantém estado atual em erro transitório de rede
      }
    }
    loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  const explicitUserProp = user && user !== mockUserSession ? user : null;
  const perfilAtivo = (
    authUser?.cargo ||
    explicitUserProp?.cargo ||
    explicitUserProp?.role ||
    ""
  )
    .trim()
    .toUpperCase();

  // RBAC estrito no Menu:
  // Apenas perfis administrativos (DONO_CLINICA, ADMINISTRADOR, ADMIN, CLINIC_ADMIN) visualizam "Configurações".
  // Médicos padrão (MEDICO/DOCTOR) e Secretárias nunca recebem o item no DOM.
  const hasAdminPrivileges =
    podeGerenciarEquipe(perfilAtivo) ||
    perfilAtivo === "ADMIN" ||
    perfilAtivo === "CLINIC_ADMIN";

  const navLinks = useMemo(
    () =>
      ALL_NAV_LINKS.filter(
        (item) => !item.somenteAdmin || hasAdminPrivileges
      ),
    [hasAdminPrivileges]
  );

  const nomeExibicao =
    authUser?.nome || explicitUserProp?.nome || "Equipe Clínica FAAZ";
  const inicialUsuario = (nomeExibicao || "F")
    .trim()
    .charAt(0)
    .toUpperCase();

  const cargoExibicao = perfilAtivo || "MEDICO";
  const cargoLegivel =
    cargoExibicao === "MEDICO" || cargoExibicao === "DONO_CLINICA"
      ? "Endocrinologia & Nutrologia"
      : cargoExibicao === "SECRETARIA"
      ? "Recepção & Atendimento"
      : cargoExibicao === "ADMINISTRADOR" || cargoExibicao === "ADMIN"
      ? "Gestão & Administração"
      : cargoExibicao;

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12 sm:h-14 gap-3">
          {/* ESQUERDA: Logotipo Oficial da Clínica FAAZ */}
          <div className="flex items-center shrink-0">
            <Link href="/dashboard" className="flex items-center group shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-8 max-h-8 sm:h-9 sm:max-h-9 flex items-center shrink-0 overflow-hidden">
                  <Image
                    src="/logo.png"
                    alt="Logotipo Fênix Clínica FAAZ"
                    width={848}
                    height={1024}
                    className="h-8 sm:h-9 w-auto object-contain shrink-0"
                    priority
                  />
                </div>
                <span className="text-lg font-bold tracking-wider text-slate-700 group-hover:text-slate-900 transition-colors">
                  CLÍNICA FAAZ
                </span>
              </div>
            </Link>
          </div>

          {/* CENTRO: Links de Navegação Principal */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive =
                activePath === link.href ||
                (link.href === "/dashboard" && activePath === "/inicio") ||
                (link.href === "/dashboard/pacientes" && activePath === "/pacientes");
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? "text-emerald-700 bg-emerald-50/80 font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* DIREITA: Notificações e Perfil do Usuário */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Sino de Notificações com Badge - Ocultado para minimalismo (Safe Hide) */}
            {/*
            <button
              type="button"
              className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5 stroke-[2]" />
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 border-2 border-white"></span>
              </span>
            </button>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            */}

            {/* Avatar e Perfil do Usuário */}
            <div className="flex items-center gap-2.5 pl-1">
              <div className="relative">
                {/* Fallback Profissional (Iniciais com Tailwind) */}
                <div
                  className="h-8 w-8 rounded-full bg-emerald-700 ring-2 ring-emerald-500/20 flex items-center justify-center text-white text-xs font-bold uppercase select-none shadow-2xs"
                  title={nomeExibicao}
                >
                  {inicialUsuario}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white" />
              </div>

              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  {nomeExibicao}
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 leading-none">
                  {cargoLegivel}
                </span>
              </div>

              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
            </div>

            {/* Botão Sair / Trocar Usuário */}
            <button
              type="button"
              onClick={async () => {
                cachedAuthUser = null;
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              title="Sair do painel e trocar de perfil"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>

            {/* Botão Menu Sanduíche (Mobile) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors ml-1"
              aria-label="Abrir Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* MENU SANDUÍCHE NO MOBILE */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 py-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Barra de busca mobile - Ocultada temporariamente */}
            {/*
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsCommandPaletteOpen(true);
              }}
              className="relative w-full flex items-center pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 text-left cursor-pointer"
            >
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <span>Buscar paciente, prontuário...</span>
            </button>
            */}

            {/* Links mobile */}
            <div className="flex flex-col gap-1 pt-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  activePath === link.href ||
                  (link.href === "/dashboard" && activePath === "/inicio") ||
                  (link.href === "/dashboard/pacientes" && activePath === "/pacientes");
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold ${
                      isActive
                        ? "bg-emerald-50 text-emerald-800 font-bold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-slate-500" />
                      <span>{link.label}</span>
                    </div>
                    {link.badge && (
                      <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal Command Palette (Busca Global Dinâmica) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        currentUserCargo={cargoExibicao}
      />
    </header>
  );
}

export default TopMenu;
