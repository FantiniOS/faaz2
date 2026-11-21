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
 * URL oficial de produção na Vercel (conectada ao Oracle Autonomous Database).
 */
export const PRODUCTION_API_URL = "https://faaz2.vercel.app/api";
export const FIXED_API_URL = PRODUCTION_API_URL;

/**
 * Obtém a URL base da API do Next.js de acordo com o ambiente e plataforma
 */
export function getBaseApiUrl(): string {
  // 1. Variável de ambiente Expo (se definida no .env ou build)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, "");
  }

  // 2. Fallback direto para o backend de produção na Vercel
  return FIXED_API_URL;
}

/**
 * URL raiz do servidor web/estáticos (remove o sufixo /api da base da API).
 * Pode ser sobrescrita por EXPO_PUBLIC_ASSETS_URL caso os estáticos fiquem em outro host.
 */
export function getServerBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_ASSETS_URL || getBaseApiUrl();
  return raw.replace(/\/+$/, "").replace(/\/api$/, "");
}

/**
 * Converte caminhos relativos salvos no Oracle (ex.: /food-thumbnails/abc.webp)
 * em URL absoluta usando a variável de ambiente configurada no app mobile.
 */
export function resolveAssetUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|file:)/i.test(trimmed)) return trimmed;
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${getServerBaseUrl()}${cleanPath}`;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  params?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  body?: any;
}

export interface GlicemiaHistoricoItem {
  id: string;
  valor: number;
  momento: string;
  momentoClinico?: MomentoClinicoGlicemia | null;
  momentoLegivel?: string;
  contextoTags?: string[];
  dataRegistro: string;
  isCritico: boolean;
  tipoAlerta?: "HIPOGLICEMIA" | "HIPERGLICEMIA" | "NORMAL";
}

export type SlotMapaGlicemico =
  | "JEJUM"
  | "POS_CAFE"
  | "PRE_ALMOCO"
  | "POS_ALMOCO"
  | "PRE_JANTAR"
  | "POS_JANTAR"
  | "AO_DEITAR";

export type MomentoClinicoGlicemia = SlotMapaGlicemico | "AVULSO";

export type StatusCelulaGlicemia = "HIPO" | "ALVO" | "ATENCAO" | "HIPER";

export type ModoProtocoloGlicemico =
  | "LIVRE"
  | "JEJUM"
  | "PAREADO"
  | "MAPA_COMPLETO"
  | "PERSONALIZADO";

export interface ProtocoloGlicemicoItem {
  pacienteId: string;
  ativo: boolean;
  usaInsulina: boolean;
  modo: ModoProtocoloGlicemico;
  slotsAtivos: SlotMapaGlicemico[];
  alvoJejumMin: number;
  alvoJejumMax: number;
  alvoPosMax: number;
  insulinaBasalNome: string | null;
  insulinaBasalDoseRef: number | null;
  insulinaBasalHorario: string | null;
  insulinaRapidaNome: string | null;
  orientacaoHipo: string | null;
  orientacaoHiper: string | null;
  updatedAt: string | null;
}

export interface CelulaMapaGlicemicoItem {
  id: string;
  valor: number;
  status: StatusCelulaGlicemia;
  hora: string;
  dataRegistro: string;
  momentoClinico: MomentoClinicoGlicemia;
  insulinaUI?: number | null;
  insulinaNome?: string | null;
  contextoTags: string[];
}

export interface DoseBasalDiaItem {
  id: string;
  unidades: number;
  nome: string | null;
  hora: string;
  aplicadoEm: string;
  observacao: string | null;
}

export interface LinhaMapaGlicemicoItem {
  dataDia: string;
  dataLabel: string;
  diaSemanaCurto: string;
  celulas: Partial<Record<SlotMapaGlicemico, CelulaMapaGlicemicoItem>>;
  avulsos: CelulaMapaGlicemicoItem[];
  basalDoses: DoseBasalDiaItem[];
}

export interface ResumoMapaGlicemicoItem {
  mediaGeral: number | null;
  mediaJejum: number | null;
  mediaPosPrandial: number | null;
  percentualNoAlvo: number | null;
  episodiosHipo: number;
  episodiosHiper: number;
  totalMedicoes: number;
  totalAplicacoesInsulina: number;
  mediaDiariaBasalUI: number | null;
  mediaDiariaRapidaUI: number | null;
}

export interface MapaGlicemicoResponse {
  success: boolean;
  dias: number;
  hojeDataDia: string;
  protocolo: ProtocoloGlicemicoItem;
  resumo: ResumoMapaGlicemicoItem;
  linhas: LinhaMapaGlicemicoItem[];
  mediasPorColuna: Record<SlotMapaGlicemico, number | null>;
}

export interface ProtocoloGlicemicoResponse {
  success: boolean;
  protocolo: ProtocoloGlicemicoItem;
}

export interface RegistrarGlicemiaPayload {
  pacienteId: string;
  valor: number;
  momento?: string;
  momentoClinico?: MomentoClinicoGlicemia;
  contextoTags?: string[];
  insulina?: {
    tipo?: "RAPIDA" | "BASAL";
    unidades: number;
    nome?: string | null;
    observacao?: string | null;
  } | null;
}

export interface RegistrarInsulinaPayload {
  pacienteId: string;
  tipo?: "BASAL" | "RAPIDA";
  unidades: number;
  nome?: string | null;
  momentoClinico?: MomentoClinicoGlicemia | null;
  observacao?: string | null;
}

export interface GlicemiaResumoPeriodo {
  media: number | null;
  totalMedicoes: number;
  dentroDaMeta: number;
  alertas: number;
}

export interface GlicemiaHistoricoResponse {
  success: boolean;
  dias?: number;
  totalAlertasHoje?: number;
  totalRegistrosHoje?: number;
  alertasHoje?: GlicemiaHistoricoItem[];
  registrosHoje?: GlicemiaHistoricoItem[];
  historico?: GlicemiaHistoricoItem[];
  resumo?: GlicemiaResumoPeriodo;
}

export interface IntestinoCheckinItem {
  id: string;
  pacienteId: string;
  tipoBristol: number;
  categoria: "constipacao" | "ideal" | "diarreia" | string;
  sintomas: string[];
  data: string;
  pacienteNome?: string;
}

export interface IntestinoHistoricoResponse {
  success: boolean;
  dataReferencia?: string;
  temRegistroHoje?: boolean;
  count?: number;
  countHoje?: number;
  ultimoRegistroHoje?: IntestinoCheckinItem | null;
  countIdealHoje?: number;
  countConstipacaoHoje?: number;
  countDiarreiaHoje?: number;
  data?: IntestinoCheckinItem[];
  registrosHoje?: IntestinoCheckinItem[];
  historico?: IntestinoCheckinItem[];
}

export interface MeasurementItem {
  id: string;
  measuredAt: string;
  bodyFatPercentage: number | null;
  waist: number | null;
  abdomen: number | null;
  hips: number | null;
  rightArm: number | null;
  leftArm: number | null;
  rightThigh: number | null;
  leftThigh: number | null;
  notes: string | null;
  createdBy: string | null;
}

export interface BiometricMeasurementItem {
  id: string;
  measuredAt: string;
  weightKg: number;
  bmi: number;
  waistCircumferenceCm?: number | null;
  bodyFatPercentage?: number | null;
  skeletalMuscleKg?: number | null;
  sourceType?: string;
  isValidatedByStaff?: boolean;
  createdAt?: string;
}

export interface PacienteMedidasResponse {
  sucesso: boolean;
  total: number;
  medicoes: BiometricMeasurementItem[];
  measurements: MeasurementItem[];
}

export interface RegistrarMedidaPayload {
  measuredAt?: string;
  bodyFatPercentage?: number | string | null;
  waist?: number | string | null;
  abdomen?: number | string | null;
  hips?: number | string | null;
  rightArm?: number | string | null;
  leftArm?: number | string | null;
  rightThigh?: number | string | null;
  leftThigh?: number | string | null;
  notes?: string | null;
}

export interface RegistrarMedidaResponse {
  sucesso: boolean;
  success?: boolean;
  mensagem?: string;
  measurement: MeasurementItem;
}

export interface PacienteTreinosResponse {
  sucesso: boolean;
  paciente?: {
    id: string;
    nome: string;
  };
  diretrizes: {
    workoutType: string;
    workoutFrequency: number;
    workoutDuration: number;
    workoutRestrictions: string;
  };
  adesao: {
    diasAtivosUltimos30Dias: number;
    metaEsperada30Dias: number;
    porcentagemAdesao: number;
    frequenciaSemanal: number;
    totalLogs: number;
    historicoCheckins: Array<{
      id: string;
      data: string;
    }>;
  };
}

export type UnidadeMedidaDieta = "g" | "ml" | "un";
export type CheckinRefeicaoStatus = "SEGUI" | "FIZ_TROCA" | "NAO_FIZ";

export interface SubstituicaoPrescritaItem {
  id: string;
  itemRefeicaoId: string;
  alimentoId: string | null;
  nomeExibicao: string;
  quantidade: number;
  unidade: UnidadeMedidaDieta;
  medidaCaseira: string | null;
  ordem: number;
  thumbnailUrl: string | null;
  categoria?: string | null;
  caloriasPorcao?: number | null;
  proteinasPorcao?: number | null;
  carboidratosPorcao?: number | null;
  gordurasPorcao?: number | null;
}

export interface ItemRefeicaoApi {
  id: string;
  alimentoId?: string;
  quantidadeGramas: number;
  unidade?: UnidadeMedidaDieta;
  medidaCaseira?: string | null;
  observacao?: string | null;
  alimento?: {
    id?: string;
    nome?: string;
    categoria?: string | null;
    thumbnailUrl?: string | null;
    calorias?: number;
    proteinas?: number;
    carboidratos?: number;
    gorduras?: number;
    fibras?: number;
    caloriasPorcao?: number;
    proteinasPorcao?: number;
    carboidratosPorcao?: number;
    gordurasPorcao?: number;
    fibrasPorcao?: number;
  };
  substituicoes?: SubstituicaoPrescritaItem[];
  substituicao?: {
    id: string;
    prescribedDietItemId: string;
    substituteFoodId?: string | null;
    substituteFoodName: string;
    substituteThumbnailUrl?: string | null;
    quantityGrams: number;
    calories: number;
    proteins?: number | null;
    carbohydrates?: number | null;
    fats?: number | null;
    createdAt?: string | Date;
  } | null;
}

export interface RefeicaoApi {
  id: string;
  nome: string;
  horario?: string | null;
  ordem: number;
  opcional?: boolean;
  observacoes?: string | null;
  calorias?: number;
  totais?: {
    calorias?: number;
    proteinas?: number;
    carboidratos?: number;
    gorduras?: number;
    fibras?: number;
  };
  itens?: ItemRefeicaoApi[];
}

export interface VariacaoDietaApi {
  id: string;
  nome: string;
  descricao?: string | null;
  ordem: number;
  calorias?: number;
  totais?: {
    calorias?: number;
    proteinas?: number;
    carboidratos?: number;
    gorduras?: number;
    fibras?: number;
  };
  refeicoes?: RefeicaoApi[];
}

export interface PlanoAlimentarApi {
  id: string;
  nome?: string;
  titulo: string;
  objetivo?: string | null;
  caloriasAlvo?: number | null;
  variacoes: VariacaoDietaApi[];
}

export interface MedicoResponsavelInfo {
  id?: string;
  nome: string;
  especialidade?: string | null;
  crm?: string | null;
}

export interface PacienteDietaResponse {
  sucesso: boolean;
  temPlano?: boolean;
  mensagem?: string;
  error?: string;
  paciente?: {
    id: string;
    nome: string;
    medico?: string | null;
    especialidade?: string | null;
    crm?: string | null;
    medicoResponsavel?: MedicoResponsavelInfo | null;
    focoClinico?: string | null;
  };
  plano?: PlanoAlimentarApi | null;
}

export interface CheckinRefeicaoItem {
  id: string;
  pacienteId: string;
  refeicaoId: string;
  refeicaoNome?: string | null;
  dataDia: string;
  status: CheckinRefeicaoStatus;
  opcaoEscolhida?: string | null;
  trocas?: unknown[] | Record<string, unknown> | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CheckinRefeicaoResumo {
  totalCheckins: number;
  seguiu: number;
  fezTroca: number;
  naoFez: number;
  percentualAdesao: number;
  diasRegistrados: number;
}

export interface CheckinsRefeicoesResponse {
  success: boolean;
  dataReferencia: string;
  totalDia: number;
  checkins: CheckinRefeicaoItem[];
  dias?: number;
  historico?: CheckinRefeicaoItem[];
  resumo?: CheckinRefeicaoResumo;
}

export interface RegistrarCheckinRefeicaoPayload {
  pacienteId: string;
  refeicaoId: string;
  dataDia?: string;
  status: CheckinRefeicaoStatus;
  opcaoEscolhida?: string | null;
  trocas?: unknown[] | Record<string, unknown> | null;
}

export interface RegistrarCheckinRefeicaoResponse {
  success: boolean;
  checkin: CheckinRefeicaoItem;
}

export interface ProximaConsultaItem {
  id: string;
  pacienteId?: string;
  medicoId?: string;
  status: string;
  statusLegivel?: string;
  dataHora: string;
  dataLocalIso?: string;
  dataFormatada?: string;
  horario?: string;
  duracaoMinutos?: number;
  encaixe?: boolean;
  tipo: string;
  tipoLegivel?: string;
  medicoNome: string;
  especialidade: string;
  medicoEspecialidade?: string;
  medicoCorHex?: string;
  observacao?: string;
  medico?: {
    nome?: string | null;
    especialidade?: string | null;
  } | null;
}

export interface ProximaConsultaResponse {
  success: boolean;
  temProximaConsulta: boolean;
  proximaConsulta: ProximaConsultaItem | null;
}

export interface ResponderConsultaPayload {
  agendamentoId: string;
  acao: "CONFIRMAR" | "CANCELAR";
  motivo?: string;
}

export interface ResponderConsultaResponse {
  success: boolean;
  agendamentoId?: string;
  status?: "CONFIRMADO" | "CANCELADO";
  statusLegivel?: string;
  dataHora?: string;
  observacao?: string;
  message?: string;
  error?: string;
}

export interface PlanoResumoConsultaItem {
  numero: number;
  dataConsulta: string;
  horaConsulta: string | null;
  tipo: "PRESENCIAL" | "ONLINE" | "RETORNO" | "AVALIACAO" | string;
  status: "REALIZADA" | "FALTA_COBRADA" | "BONIFICADA" | string;
}

export interface PlanoResumoPacoteItem {
  nomePlano: string;
  status: "ATIVO" | "CONCLUIDO";
  qtdTotalConsultas: number;
  consultasRealizadas: number;
  consultasRestantes: number;
  percentualUso: number;
  dataInicio: string;
  dataValidade: string | null;
  alertaRenovacao: boolean;
  consultas: PlanoResumoConsultaItem[];
}

export interface PlanoResumoResponse {
  success: boolean;
  possuiPacote: boolean;
  planoLabel: string;
  pacote: PlanoResumoPacoteItem | null;
  medicoResponsavel?: MedicoResponsavelInfo | null;
}

export interface AtualizarContatoPayload {
  telefone?: string;
  email?: string | null;
}

export interface AtualizarContatoResponse {
  success: boolean;
  telefone: string;
  email: string | null;
  error?: string;
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

  const timeoutMs = options.timeoutMs || 15000;
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
        `Não foi possível alcançar ${fullUrl}. Verifique a conexão com a internet do dispositivo.`
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

  patch<T = any>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return httpRequest<T>(endpoint, "PATCH", { ...options, body: data });
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
    getProtocoloGlicemico(
      pacienteId: string
    ): Promise<ProtocoloGlicemicoResponse> {
      return api.get<ProtocoloGlicemicoResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/protocolo-glicemico`
      );
    },
    getMapaGlicemico(
      pacienteId: string,
      dias: number = 7
    ): Promise<MapaGlicemicoResponse> {
      return api.get<MapaGlicemicoResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/mapa-glicemico`,
        { params: { dias } }
      );
    },
    getProximaConsulta(pacienteId: string): Promise<ProximaConsultaResponse> {
      return api.get<ProximaConsultaResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/proxima-consulta`
      );
    },
    getPlanoResumo(pacienteId: string): Promise<PlanoResumoResponse> {
      return api
        .get<PlanoResumoResponse>(
          `/pacientes/${encodeURIComponent(pacienteId)}/plano-resumo`
        )
        .catch(() => ({
          success: false,
          possuiPacote: false,
          planoLabel: "",
          pacote: null,
          medicoResponsavel: null,
        }));
    },
    responderConsulta(
      pacienteId: string,
      payload: ResponderConsultaPayload
    ): Promise<ResponderConsultaResponse> {
      return api.patch<ResponderConsultaResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/proxima-consulta`,
        payload
      );
    },
    getDieta<T = any>(pacienteId?: string): Promise<T> {
      const endpoint = pacienteId
        ? `/pacientes/${encodeURIComponent(pacienteId)}/dieta`
        : "/paciente/dieta";
      return api.get<T>(endpoint);
    },
    getDietaEstruturada(pacienteId?: string): Promise<PacienteDietaResponse> {
      const endpoint = pacienteId
        ? `/pacientes/${encodeURIComponent(pacienteId)}/dieta`
        : "/paciente/dieta";
      return api.get<PacienteDietaResponse>(endpoint);
    },
    registrarPesagem(pacienteId: string, peso: number) {
      return api.post(`/pacientes/${encodeURIComponent(pacienteId)}/pesagens`, {
        peso,
      });
    },
    getPesagens(pacienteId: string) {
      return api.get(`/pacientes/${encodeURIComponent(pacienteId)}/pesagens`);
    },
    getMedidas(pacienteId: string) {
      return api.get<PacienteMedidasResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/medicoes`
      );
    },
    registrarMedida(pacienteId: string, payload: RegistrarMedidaPayload) {
      return api.post<RegistrarMedidaResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/medicoes`,
        payload
      );
    },
    getTreinos(pacienteId: string) {
      return api.get<PacienteTreinosResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/treinos`
      );
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
    atualizarContato(
      pacienteId: string,
      payload: AtualizarContatoPayload
    ): Promise<AtualizarContatoResponse> {
      return api.patch<AtualizarContatoResponse>(
        `/pacientes/${encodeURIComponent(pacienteId)}/contato`,
        payload
      );
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
    registrarGlicemia(payload: RegistrarGlicemiaPayload) {
      return api.post("/checkins/glicemia", payload);
    },
    registrarInsulina(payload: RegistrarInsulinaPayload) {
      return api.post("/checkins/insulina", payload);
    },
    getInsulinaHoje(pacienteId: string, dias: number = 7) {
      return api.get("/checkins/insulina", {
        params: { pacienteId, dias },
      });
    },
    getHistoricoGlicemia(pacienteId: string, dias: number = 30) {
      return api.get<GlicemiaHistoricoResponse>("/checkins/glicemia", {
        params: {
          pacienteId,
          historico: true,
          dias,
        },
      });
    },
    registrarIntestino(payload: {
      pacienteId: string;
      tipoBristol: number;
      categoria?: string;
      sintomas?: string[];
    }) {
      return api.post("/checkins/intestino", payload);
    },
    getHistoricoIntestino(pacienteId: string, limit: number = 50) {
      return api.get<IntestinoHistoricoResponse>("/checkins/intestino", {
        params: {
          pacienteId,
          historico: true,
          limit,
        },
      });
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
    getRefeicoes(
      pacienteId: string,
      data?: string,
      options?: { historico?: boolean; dias?: number }
    ) {
      return api.get<CheckinsRefeicoesResponse>("/checkins/refeicoes", {
        params: {
          pacienteId,
          ...(data ? { data } : {}),
          ...(options?.historico ? { historico: true } : {}),
          ...(options?.dias ? { dias: options.dias } : {}),
        },
      });
    },
    registrarRefeicao(payload: RegistrarCheckinRefeicaoPayload) {
      return api.post<RegistrarCheckinRefeicaoResponse>(
        "/checkins/refeicoes",
        payload
      );
    },
  },
};

export default api;
