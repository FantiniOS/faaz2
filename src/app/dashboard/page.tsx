"use client";

import React, { useState, useEffect } from "react";
import { DashboardOperacional } from "@/components/DashboardOperacional";
import { DashboardClinico } from "@/components/DashboardClinico";
import { mockUserSession } from "@/mocks/dashboard";

export interface DashboardUserSession {
  userId?: string;
  nome?: string;
  cargo?: string;
  role?: string;
  email?: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<DashboardUserSession | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);

  // Isolamento estrito no ciclo de vida do cliente (Client-Side Only via useEffect)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.autenticado && json.usuario) {
            setUser({
              userId: json.usuario.userId,
              nome: json.usuario.nome,
              cargo: json.usuario.cargo,
              role: json.usuario.role || json.usuario.cargo,
              email: json.usuario.email,
            });
            return;
          }
        }
      } catch (error) {
        console.error("[DashboardPage] Erro ao carregar usuário autenticado:", error);
      } finally {
        if (isMounted) {
          setIsLoadingUser(false);
        }
      }
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const perfilAtivo = (user?.cargo || user?.role || mockUserSession.cargo || "").toUpperCase();

  const isSecretaria =
    perfilAtivo === "SECRETARIA" ||
    perfilAtivo === "RECEPTIONIST" ||
    perfilAtivo === "RECEPCAO" ||
    perfilAtivo === "ATENDIMENTO";

  // Se for Secretária, renderiza o painel operacional da recepção (100% focado na Agenda, sem dados clínicos)
  if (isSecretaria) {
    return <DashboardOperacional user={user || { nome: "Patrícia Santos", cargo: "SECRETARIA" }} />;
  }

  // Se for Médico, Dono da Clínica ou Administrador, renderiza o painel clínico com dados em tempo real
  return <DashboardClinico user={user} />;
}
