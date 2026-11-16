import { Platform } from "react-native";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * api.ts - Serviço Centralizado de Comunicação Mobile (PWA) ➔ Backend Next.js
 *
 * Características:
 * - Resolução inteligente da Base URL com suporte à variável EXPO_PUBLIC_API_URL.
 * - Injeção automática do Token de Autorização (Bearer Token) e paciente-id nos Headers.
 * - Suporte universal a PWA (Web / Chrome / Safari), iOS e Android.
 * - Timeout configurável e tratamento resiliente de erros.
 */

// Estado em memória do Token de autenticação e Paciente ID
let currentAuthToken: string | null = null;
let currentPatientId: string | null = null;

/**
 * Define o Bearer Token de autenticação do paciente para todas as chamadas subsequentes
 */
export function setAuthToken(token: string | null) {
  currentAuthToken = token;
}

export function getAuthToken(): string | null {
  return currentAuthToken;
}

/**
 * Define o ID do paciente logado para ser propagado nos cabeçalhos clínicos
 */
export function setAuthPatientId(id: string | null) {
  currentPatientId = id;
}

export function getAuthPatientId(): string | null {
  return currentPatientId;
}

/**
 * IP e Porta fixos do servidor de desenvolvimento Next.js na rede local.
 * Garante que qualquer celular/dispositivo conectado via Wi-Fi no Expo (porta 8081)
 * alcance diretamente o backend na porta 3000 da máquina.
 */
export const SERVER_HOST_IP = "192.168.100.57";
export const SERVER_PORT = "3000";
export const FIXED_API_URL = `http://${SERVER_HOST_IP}:${SERVER_PORT}/api`;

/**
 * Obtém a URL base da API do Next.js de acordo com o ambiente e plataforma
 */
export function getBaseApiUrl(): string {
  // 1. Variável de ambiente Expo (se definida no .env ou build)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, "");
  }

  // 2. Apontamento estrito: IP do Diretor na rede local (Next.js porta 3000)
  return FIXED_API_URL;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  params?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  body?: any;
}

/**
 * Executa requisição HTTP tipada com headers, auth token e CORS
 */
async function httpRequest<T = any>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  options: RequestOptions = {}
): Promise<T> {
  const baseUrl = getBaseApiUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  let fullUrl = `${baseUrl}${cleanEndpoint}`;

  // Anexa Query Params caso fornecidos
  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      fullUrl += fullUrl.includes("?") ? `&${qs}` : `?${qs}`;
    }
  }

  // Montagem dos Cabeçalhos Padrão da Clínica FAAZ
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Injeção do Bearer Token de autorização
  if (currentAuthToken) {
    headers["Authorization"] = `Bearer ${currentAuthToken}`;
  }

  // Injeção do identificador do paciente
  if (currentPatientId) {
    headers["paciente-id"] = currentPatientId;
  }

  // Mescla headers customizados passados na chamada
  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const timeoutMs = options.timeoutMs || 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (options.body !== undefined && method !== "GET") {
      fetchOptions.body =
        typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
    }

    const response = await fetch(fullUrl, fetchOptions);
    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type");
    let responseData: any = null;

    if (contentType && contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = text;
      }
    }

    if (!response.ok) {
      const errorMsg =
        responseData?.error ||
        responseData?.message ||
        `Erro na chamada HTTP ${response.status} (${response.statusText})`;
      const errorObj = new Error(errorMsg);
      (errorObj as any).status = response.status;
      (errorObj as any).data = responseData;
      throw errorObj;
    }

    return responseData as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const timeoutError = new Error(
        `Tempo limite esgotado (${timeoutMs}ms) ao conectar com ${fullUrl}. Verifique se o servidor está ativo.`
      );
      (timeoutError as any).status = 408;
      throw timeoutError;
    }
    if (err.message === "Failed to fetch" || err.message?.includes("Network request failed")) {
      const netError = new Error(
        `Não foi possível alcançar ${fullUrl}. Verifique se o celular está na mesma rede Wi-Fi e se a porta 3000 está acessível.`
      );
      throw netError;
    }
    throw err;
  }
}

/**
 * Cliente HTTP unificado da aplicação
 */
export const api = {
  getBaseUrl: getBaseApiUrl,
  setAuthToken,
  getAuthToken,
  setAuthPatientId,
  getAuthPatientId,

  get<T = any>(endpoint: string, options?: RequestOptions): Promise<T> {
    return httpRequest<T>(endpoint, "GET", options);
  },

  post<T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return httpRequest<T>(endpoint, "POST", { ...options, body: data });
  },

  put<T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return httpRequest<T>(endpoint, "PUT", { ...options, body: data });
  },

  delete<T = any>(endpoint: string, options?: RequestOptions): Promise<T> {
    return httpRequest<T>(endpoint, "DELETE", options);
  },

  // ========================================================
  // ENDPOINTS ESPECÍFICOS DO PRONTUÁRIO E CLÍNICA FAAZ
  // ========================================================
  auth: {
    loginComCpf(cpf: string) {
      return api.post<{ sucesso: boolean; paciente?: any; token?: string; error?: string }>(
        "/auth/paciente",
        { cpf: cpf.replace(/\D/g, "") }
      );
    },
  },

  pacientes: {
    getMetas(pacienteId: string) {
      return api.get(`/pacientes/${encodeURIComponent(pacienteId)}/metas`);
    },
    getProximaConsulta(pacienteId: string) {
      return api.get(`/pacientes/${encodeURIComponent(pacienteId)}/proxima-consulta`);
    },
    getDieta(pacienteId?: string) {
      const endpoint = pacienteId
        ? `/pacientes/${encodeURIComponent(pacienteId)}/dieta`
        : "/paciente/dieta";
      return api.get(endpoint);
    },
    registrarPesagem(pacienteId: string, peso: number) {
      return api.post(`/pacientes/${encodeURIComponent(pacienteId)}/pesagens`, {
        peso,
      });
    },
    getPesagens(pacienteId: string) {
      return api.get(`/pacientes/${encodeURIComponent(pacienteId)}/pesagens`);
    },
    uploadAvatar(pacienteId: string, imageBase64: string, mimeType: string = "image/jpeg") {
      return api.post(`/pacientes/${encodeURIComponent(pacienteId)}/avatar`, {
        imageBase64,
        mimeType,
      });
    },
    getAvatar(pacienteId: string) {
      return api.get(`/pacientes/${encodeURIComponent(pacienteId)}/avatar`);
    },
    substituirAlimento(
      pacienteId: string,
      payload: {
        prescribedDietItemId: string;
        substituteFoodId?: string;
        substituteFoodName: string;
        quantityGrams: number;
        calories: number;
        proteins?: number;
        carbohydrates?: number;
        fats?: number;
      }
    ) {
      return api.post(
        `/pacientes/${encodeURIComponent(pacienteId)}/dieta/substituicao`,
        payload
      );
    },
    removerSubstituicao(pacienteId: string, substitutionId: string) {
      return api.delete(
        `/pacientes/${encodeURIComponent(pacienteId)}/dieta/substituicao?substitutionId=${encodeURIComponent(substitutionId)}`
      );
    },
  },

  alimentos: {
    buscar(termo?: string) {
      const q = (termo || "").trim();
      const endpoint = q ? `/alimentos?q=${encodeURIComponent(q)}` : "/alimentos";
      return api.get(endpoint);
    },
  },

  checkins: {
    registrarSono(payload: {
      pacienteId: string;
      horas: number;
      qualidade: string;
      observacao?: string;
    }) {
      return api.post("/checkin/sono", payload);
    },
    registrarHidratacao(payload: {
      pacienteId: string;
      volumeMl: number;
      metaDiariaMl?: number;
    }) {
      return api.post("/checkins/hidratacao", payload);
    },
    getHidratacaoHoje(pacienteId?: string) {
      return api.get<{
        success?: boolean;
        totalHojeMl?: number;
        paciente?: { totalHojeMl?: number };
      }>("/checkins/hidratacao", {
        params: pacienteId ? { pacienteId } : undefined,
      });
    },
    registrarGlicemia(payload: {
      pacienteId: string;
      valor: number;
      momento: string;
    }) {
      return api.post("/checkins/glicemia", payload);
    },
    registrarIntestino(payload: {
      pacienteId: string;
      tipoBristol: number;
      categoria?: string;
      sintomas?: string[];
    }) {
      return api.post("/checkins/intestino", payload);
    },
    getTreinoHoje(pacienteId?: string) {
      return api.get<{
        sucesso: boolean;
        treinouHoje: boolean;
        checkinHoje?: any;
        totalCheckins30Dias?: number;
      }>("/checkins/treino", {
        params: pacienteId ? { pacienteId } : undefined,
      });
    },
    registrarTreino(pacienteId?: string) {
      return api.post<{
        sucesso: boolean;
        mensagem: string;
        checkin?: any;
        treinouHoje: boolean;
      }>("/checkins/treino", {
        pacienteId,
      });
    },
    desfazerTreino(pacienteId?: string) {
      return api.delete<{
        sucesso: boolean;
        mensagem: string;
      }>("/checkins/treino", {
        params: pacienteId ? { pacienteId } : undefined,
      });
    },
  },
};

export default api;
