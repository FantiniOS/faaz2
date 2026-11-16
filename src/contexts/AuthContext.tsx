"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Cargo } from "@/lib/auth-rbac";

export interface UsuarioLogado {
  userId: string;
  nome: string;
  cargo: Cargo;
  email: string;
  organizationId?: string;
  title?: string | null;
  fullName?: string | null;
  councilType?: string | null;
  councilNumber?: string | null;
  specialty?: string | null;
  clinicaNome?: string | null;
}

interface AuthContextType {
  usuario: UsuarioLogado | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<{ sucesso: boolean; erro?: string }>;
  logout: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.autenticado && data.usuario) {
          setUsuario(data.usuario);
        } else {
          setUsuario(null);
          if (typeof document !== "undefined") {
            document.cookie =
              "endoc_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
          }
        }
      } else {
        setUsuario(null);
        if (typeof document !== "undefined") {
          document.cookie =
            "endoc_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
        }
      }
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const login = async (email: string, senha: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });

      const data = await res.json();

      if (res.ok && data.sucesso) {
        await recarregar();
        return { sucesso: true };
      }

      return { sucesso: false, erro: data.error || "Erro ao fazer login." };
    } catch {
      return { sucesso: false, erro: "Erro de conexão com o servidor." };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUsuario(null);
    }
  };

  return (
    <AuthContext.Provider value={{ usuario, carregando, login, logout, recarregar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}

export default AuthContext;
