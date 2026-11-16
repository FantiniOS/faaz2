import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, setAuthToken, setAuthPatientId } from "../services/api";
import { secureStorage, USER_TOKEN_KEY, USER_DATA_KEY } from "../services/storage";

export interface PacienteLogado {
  id: string;
  nome: string;
  socialName?: string | null;
  cpf: string;
  metaDiariaMl: number;
  recordCode?: string;
  medicoResponsavel?: string;
  especialidadeMedico?: string;
  focoClinico?: string;
  treatmentObjective?: string;
  avatarUrl?: string | null;
}

interface PatientAuthContextData {
  paciente: PacienteLogado | null;
  isLoading: boolean;
  isInitializing: boolean;
  loginComCpf: (cpf: string, manterConectado?: boolean) => Promise<{ sucesso: boolean; error?: string }>;
  logout: () => Promise<void>;
  selecionarPaciente: (paciente: PacienteLogado, manterConectado?: boolean) => Promise<void>;
  atualizarAvatarUrl: (novaUrl: string) => void;
}

const PatientAuthContext = createContext<PatientAuthContextData>(
  {} as PatientAuthContextData
);

export function PatientAuthProvider({ children }: { children: ReactNode }) {
  const [paciente, setPaciente] = useState<PacienteLogado | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Auto-login via SecureStore na inicialização do aplicativo
  useEffect(() => {
    let isMounted = true;

    async function restaurarSessaoPersistente() {
      try {
        const savedToken = await secureStorage.getItem(USER_TOKEN_KEY);

        if (savedToken) {
          const savedUserData = await secureStorage.getItem(USER_DATA_KEY);
          let pacienteRecuperado: PacienteLogado | null = null;

          if (savedUserData) {
            try {
              pacienteRecuperado = JSON.parse(savedUserData);
            } catch {
              pacienteRecuperado = null;
            }
          }

          if (pacienteRecuperado && isMounted) {
            setPaciente(pacienteRecuperado);
            setAuthPatientId(pacienteRecuperado.id);
            setAuthToken(savedToken);
          } else {
            // Tenta validar e buscar os dados atualizados do paciente no backend
            try {
              const res = await api.get(`/pacientes/${encodeURIComponent(savedToken)}`);
              if (res?.paciente && isMounted) {
                const fresh: PacienteLogado = {
                  id: res.paciente.id,
                  nome: res.paciente.fullName || res.paciente.nome,
                  cpf: res.paciente.cpf,
                  metaDiariaMl: res.paciente.metaDiariaMl || 2500,
                  recordCode: res.paciente.recordCode,
                  medicoResponsavel: res.paciente.primaryDoctor?.fullName || "Dr. Carlos Fantini",
                  especialidadeMedico: res.paciente.primaryDoctor?.specialty || "Endocrinologia & Nutrologia",
                  focoClinico: res.paciente.treatmentObjective || res.paciente.clinicalFocus,
                  treatmentObjective: res.paciente.treatmentObjective || res.paciente.clinicalFocus,
                  avatarUrl: res.paciente.avatarUrl || null,
                };
                setPaciente(fresh);
                setAuthPatientId(fresh.id);
                setAuthToken(savedToken);
                await secureStorage.setItem(USER_DATA_KEY, JSON.stringify(fresh));
              }
            } catch (err) {
              console.log("[PatientAuthContext] Token persistente não validado no backend:", err);
            }
          }
        }
      } catch (err) {
        console.error("[PatientAuthContext] Erro ao recuperar sessão segura:", err);
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    }

    restaurarSessaoPersistente();

    return () => {
      isMounted = false;
    };
  }, []);

  async function loginComCpf(
    cpf: string,
    manterConectado: boolean = true
  ): Promise<{ sucesso: boolean; error?: string }> {
    const cleanCpf = cpf.replace(/\D/g, "");

    if (!cleanCpf || cleanCpf.length < 11) {
      return {
        sucesso: false,
        error: "Informe um CPF válido com 11 dígitos numéricos.",
      };
    }

    setIsLoading(true);

    try {
      const data = await api.auth.loginComCpf(cleanCpf);

      if (data.sucesso && data.paciente) {
        setPaciente(data.paciente);
        setAuthPatientId(data.paciente.id);

        const token = data.token || data.paciente.id;
        if (token) {
          setAuthToken(token);
        }

        // Armazenamento Seguro Criptografado (Persistent Login)
        if (manterConectado) {
          await secureStorage.setItem(USER_TOKEN_KEY, token);
          await secureStorage.setItem(USER_DATA_KEY, JSON.stringify(data.paciente));
        } else {
          await secureStorage.deleteItem(USER_TOKEN_KEY);
          await secureStorage.deleteItem(USER_DATA_KEY);
        }

        setIsLoading(false);
        return { sucesso: true };
      }

      setIsLoading(false);
      return {
        sucesso: false,
        error: data.error || "Não foi possível autenticar o paciente.",
      };
    } catch (err: any) {
      setIsLoading(false);
      return {
        sucesso: false,
        error:
          err.message ||
          "Não foi possível conectar ao servidor da Clínica FAAZ. Verifique se o backend está ativo.",
      };
    }
  }

  async function logout() {
    try {
      await secureStorage.deleteItem(USER_TOKEN_KEY);
      await secureStorage.deleteItem(USER_DATA_KEY);
    } catch (err) {
      console.warn("[PatientAuthContext] Erro ao limpar SecureStore:", err);
    } finally {
      setPaciente(null);
      setAuthToken(null);
      setAuthPatientId(null);
    }
  }

  async function selecionarPaciente(
    novoPaciente: PacienteLogado,
    manterConectado: boolean = true
  ) {
    setPaciente(novoPaciente);
    setAuthPatientId(novoPaciente.id);
    if (manterConectado) {
      await secureStorage.setItem(USER_TOKEN_KEY, novoPaciente.id);
      await secureStorage.setItem(USER_DATA_KEY, JSON.stringify(novoPaciente));
    }
  }

  function atualizarAvatarUrl(novaUrl: string) {
    setPaciente((prev) => (prev ? { ...prev, avatarUrl: novaUrl } : null));
  }

  return (
    <PatientAuthContext.Provider
      value={{
        paciente,
        isLoading,
        isInitializing,
        loginComCpf,
        logout,
        selecionarPaciente,
        atualizarAvatarUrl,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
}

export function usePatientAuth(): PatientAuthContextData {
  const context = useContext(PatientAuthContext);
  if (!context || !context.loginComCpf) {
    return {
      paciente: null,
      isLoading: false,
      isInitializing: false,
      loginComCpf: async () => ({ sucesso: false, error: "Contexto de autenticação inicializando..." }),
      logout: async () => {},
      selecionarPaciente: async () => {},
      atualizarAvatarUrl: () => {},
    };
  }
  return context;
}
