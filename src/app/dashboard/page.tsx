"use client";

import React, { useState, useEffect } from "react";
import { DashboardOperacional } from "@/components/DashboardOperacional";
import { DashboardClinico } from "@/components/DashboardClinico";

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
        console.error(
          "[DashboardPage] Erro ao carregar usuário autenticado:",
          error
        );
      } finally {
        if (isMounted) {
          setIsLoadingUser(false);
        }
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const perfilAtivo = (user?.cargo || user?.role || "").toUpperCase();

  const isSecretaria =
    perfilAtivo === "SECRETARIA" ||
    perfilAtivo === "RECEPTIONIST" ||
    perfilAtivo === "RECEPCAO" ||
    perfilAtivo === "ATENDIMENTO";

  if (!isLoadingUser && isSecretaria) {
    return (
      <DashboardOperacional
        user={user || { nome: "Recepção FAAZ", cargo: "SECRETARIA" }}
      />
    );
  }

  return <DashboardClinico user={user} isLoadingUser={isLoadingUser} />;
}
