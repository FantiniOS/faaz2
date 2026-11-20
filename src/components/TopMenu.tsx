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
    null
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
      await Promise.resolve();
      if (!mounted) return;
      if (cachedAuthUser) {
        setAuthUser(cachedAuthUser);
      }
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
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
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
                <span className="text-base sm:text-lg font-extrabold tracking-wider text-slate-800 group-hover:text-slate-950 transition-colors">
                  CLÍNICA FAAZ
                </span>
              </div>
            </Link>
          </div>

          {/* CENTRO: Links de Navegação Principal */}
          <nav className="hidden md:flex items-center gap-1.5">
            {navLinks.map((link) => {
              const isActive =
                activePath === link.href ||
                (link.href === "/dashboard" && activePath === "/inicio") ||
                (link.href === "/dashboard/pacientes" && activePath === "/pacientes") ||
                (link.href === "/dashboard/equipe" && activePath === "/configuracoes/equipe");
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`relative px-3.5 py-1.5 rounded-xl text-xs transition-all flex items-center gap-1.5 border ${
                    isActive
                      ? "text-emerald-800 bg-emerald-50 border-emerald-200/80 font-bold shadow-2xs"
                      : "text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/70 font-semibold"
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

          {/* DIREITA: Perfil do Usuário e Ação Sair */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Avatar e Perfil do Usuário */}
            <div className="flex items-center gap-2.5 pl-1 pr-1.5 py-1 rounded-xl">
              <div className="relative">
                <div
                  className="h-8 w-8 rounded-full bg-emerald-600 ring-2 ring-emerald-500/20 flex items-center justify-center text-white text-xs font-bold uppercase select-none shadow-2xs"
                  title={nomeExibicao}
                >
                  {inicialUsuario}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white" />
              </div>

              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-900 leading-tight">
                  {nomeExibicao}
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 leading-none mt-0.5">
                  {cargoLegivel}
                </span>
              </div>

              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
            </div>

            <div className="hidden sm:block h-5 w-px bg-slate-200/80" />

            {/* Botão Sair / Trocar Usuário */}
            <button
              type="button"
              onClick={async () => {
                cachedAuthUser = null;
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              title="Sair do painel e trocar de perfil"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>

            {/* Botão Menu Sanduíche (Mobile) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors ml-1 cursor-pointer"
              aria-label="Abrir Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* MENU SANDUÍCHE NO MOBILE */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200/80 py-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Links mobile */}
            <div className="flex flex-col gap-1 pt-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive =
                  activePath === link.href ||
                  (link.href === "/dashboard" && activePath === "/inicio") ||
                  (link.href === "/dashboard/pacientes" && activePath === "/pacientes") ||
                  (link.href === "/dashboard/equipe" && activePath === "/configuracoes/equipe");
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs border transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200/80 font-bold"
                        : "text-slate-600 border-transparent hover:bg-slate-50 font-semibold"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? "text-emerald-600" : "text-slate-500"}`} />
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
