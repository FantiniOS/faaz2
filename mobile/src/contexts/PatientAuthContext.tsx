import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  api,
  setAuthToken,
  setAuthPatientId,
  type MedicoResponsavelInfo,
} from "../services/api";
import { secureStorage, USER_TOKEN_KEY, USER_DATA_KEY } from "../services/storage";

export interface PacienteLogado {
  id: string;
  nome: string;
  socialName?: string | null;
  cpf: string;
  metaDiariaMl: number;
  recordCode?: string;
  medicoResponsavel?: string | null;
  especialidadeMedico?: string | null;
  crmMedico?: string | null;
  medicoResponsavelDetalhes?: MedicoResponsavelInfo | null;
  focoClinico?: string;
  treatmentObjective?: string;
  medicacoes?: string | null;
  convenio?: string | null;
  telefoneWhatsapp?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

function extrairMedicoResponsavelApi(p: any): MedicoResponsavelInfo | null {
  if (
    p?.medicoResponsavel &&
    typeof p.medicoResponsavel === "object" &&
    typeof p.medicoResponsavel.nome === "string" &&
    p.medicoResponsavel.nome.trim()
  ) {
    return {
      id: p.medicoResponsavel.id,
      nome: p.medicoResponsavel.nome.trim(),
      especialidade: p.medicoResponsavel.especialidade?.trim() || null,
      crm: p.medicoResponsavel.crm?.trim() || null,
    };
  }
  if (
    p?.medicoResponsavelDetalhes &&
    typeof p.medicoResponsavelDetalhes.nome === "string" &&
    p.medicoResponsavelDetalhes.nome.trim()
  ) {
    return {
      id: p.medicoResponsavelDetalhes.id,
      nome: p.medicoResponsavelDetalhes.nome.trim(),
      especialidade: p.medicoResponsavelDetalhes.especialidade?.trim() || null,
      crm: p.medicoResponsavelDetalhes.crm?.trim() || null,
    };
  }
  if (p?.primaryDoctor?.fullName?.trim()) {
    return {
      id: p.primaryDoctor.id,
      nome: p.primaryDoctor.fullName.trim(),
      especialidade: p.primaryDoctor.specialty?.trim() || null,
      crm: null,
    };
  }
  if (
    typeof p?.medicoResponsavel === "string" &&
    p.medicoResponsavel.trim() &&
    p.medicoResponsavel.trim() !== "Equipe Clínica FAAZ"
  ) {
    return {
      nome: p.medicoResponsavel.trim(),
      especialidade: p.especialidadeMedico?.trim() || null,
      crm: p.crmMedico?.trim() || null,
    };
  }
  return null;
}

interface PatientAuthContextData {
  paciente: PacienteLogado | null;
  isLoading: boolean;
  isInitializing: boolean;
  loginComCpf: (cpf: string, manterConectado?: boolean) => Promise<{ sucesso: boolean; error?: string }>;
  logout: () => Promise<void>;
  selecionarPaciente: (paciente: PacienteLogado, manterConectado?: boolean) => Promise<void>;
  atualizarAvatarUrl: (novaUrl: string) => void;
  atualizarPacienteLocal: (parcial: Partial<PacienteLogado>) => Promise<void>;
  recarregarPerfilPaciente: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextData>(
  {} as PatientAuthContextData
);

export function PatientAuthProvider({ children }: { children: ReactNode }) {
  const [paciente, setPaciente] = useState<PacienteLogado | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  const sincronizarPerfilRemoto = React.useCallback(async (pacienteId: string) => {
    try {
      const res = await api.get(`/pacientes/${encodeURIComponent(pacienteId)}`);
      if (!res?.paciente) return;
      const p = res.paciente;
      const medicoApi = extrairMedicoResponsavelApi(p);
      setPaciente((prev) => {
        const prevNomeValido =
          prev?.medicoResponsavel &&
          prev.medicoResponsavel.trim() !== "Equipe Clínica FAAZ"
            ? prev.medicoResponsavel.trim()
            : null;
        const medicoResolvido =
          medicoApi ??
          prev?.medicoResponsavelDetalhes ??
          (prevNomeValido
            ? {
                nome: prevNomeValido,
                especialidade: prev?.especialidadeMedico ?? null,
                crm: prev?.crmMedico ?? null,
              }
            : null);

        const merged: PacienteLogado = {
          id: p.id || prev?.id || pacienteId,
          nome: p.fullName || p.nome || prev?.nome || "Paciente",
          socialName: p.socialName ?? prev?.socialName ?? null,
          cpf: p.cpf || prev?.cpf || "",
          metaDiariaMl: p.metaDiariaMl || prev?.metaDiariaMl || 2500,
          recordCode: p.recordCode || prev?.recordCode,
          medicoResponsavel: medicoResolvido?.nome ?? null,
          especialidadeMedico: medicoResolvido?.especialidade ?? null,
          crmMedico: medicoResolvido?.crm ?? null,
          medicoResponsavelDetalhes: medicoResolvido,
          focoClinico:
            p.treatmentObjective || p.clinicalFocus || prev?.focoClinico || "",
          treatmentObjective:
            p.treatmentObjective ||
            p.clinicalFocus ||
            prev?.treatmentObjective ||
            "",
          medicacoes: p.medicacoes !== undefined ? p.medicacoes : (prev?.medicacoes ?? null),
          convenio: p.convenio ?? prev?.convenio ?? null,
          telefoneWhatsapp: p.phoneWhatsapp ?? prev?.telefoneWhatsapp ?? null,
          email: p.email ?? prev?.email ?? null,
          avatarUrl: p.avatarUrl ?? p.photoUrl ?? prev?.avatarUrl ?? null,
        };
        secureStorage.setItem(USER_DATA_KEY, JSON.stringify(merged)).catch(() => {});
        return merged;
      });
    } catch {
      // Fallback silencioso mantendo cache local
    }
  }, []);

  const recarregarPerfilPaciente = React.useCallback(async () => {
    if (!paciente?.id) return;
    await sincronizarPerfilRemoto(paciente.id);
  }, [paciente?.id, sincronizarPerfilRemoto]);

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
            // Atualiza silenciosamente em segundo plano para trazer medicacoes/objetivo recentes
            sincronizarPerfilRemoto(pacienteRecuperado.id);
          } else {
            // Tenta validar e buscar os dados atualizados do paciente no backend
            try {
              const res = await api.get(`/pacientes/${encodeURIComponent(savedToken)}`);
              if (res?.paciente && isMounted) {
                const medicoFresh = extrairMedicoResponsavelApi(res.paciente);
                const fresh: PacienteLogado = {
                  id: res.paciente.id,
                  nome: res.paciente.fullName || res.paciente.nome,
                  socialName: res.paciente.socialName ?? null,
                  cpf: res.paciente.cpf,
                  metaDiariaMl: res.paciente.metaDiariaMl || 2500,
                  recordCode: res.paciente.recordCode,
                  medicoResponsavel: medicoFresh?.nome ?? null,
                  especialidadeMedico: medicoFresh?.especialidade ?? null,
                  crmMedico: medicoFresh?.crm ?? null,
                  medicoResponsavelDetalhes: medicoFresh,
                  focoClinico: res.paciente.treatmentObjective || res.paciente.clinicalFocus,
                  treatmentObjective: res.paciente.treatmentObjective || res.paciente.clinicalFocus,
                  medicacoes: res.paciente.medicacoes ?? null,
                  convenio: res.paciente.convenio ?? null,
                  telefoneWhatsapp: res.paciente.phoneWhatsapp ?? null,
                  email: res.paciente.email ?? null,
                  avatarUrl: res.paciente.avatarUrl || res.paciente.photoUrl || null,
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
  }, [sincronizarPerfilRemoto]);

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
        const medicoLogin = extrairMedicoResponsavelApi(data.paciente);
        const pacienteNormalizado: PacienteLogado = {
          ...data.paciente,
          medicoResponsavel: medicoLogin?.nome ?? null,
          especialidadeMedico: medicoLogin?.especialidade ?? null,
          crmMedico: medicoLogin?.crm ?? null,
          medicoResponsavelDetalhes: medicoLogin,
        };
        setPaciente(pacienteNormalizado);
        setAuthPatientId(pacienteNormalizado.id);

        const token = data.token || pacienteNormalizado.id;
        if (token) {
          setAuthToken(token);
        }

        // Armazenamento Seguro Criptografado (Persistent Login)
        if (manterConectado) {
          await secureStorage.setItem(USER_TOKEN_KEY, token);
          await secureStorage.setItem(
            USER_DATA_KEY,
            JSON.stringify(pacienteNormalizado)
          );
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

  const atualizarPacienteLocal = React.useCallback(
    async (parcial: Partial<PacienteLogado>) => {
      setPaciente((prev) => {
        if (!prev) return prev;
        const atualizado: PacienteLogado = { ...prev, ...parcial };
        secureStorage
          .setItem(USER_DATA_KEY, JSON.stringify(atualizado))
          .catch(() => {});
        return atualizado;
      });
    },
    []
  );

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
        atualizarPacienteLocal,
        recarregarPerfilPaciente,
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
      atualizarPacienteLocal: async () => {},
      recarregarPerfilPaciente: async () => {},
    };
  }
  return context;
}
