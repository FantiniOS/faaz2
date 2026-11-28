// ============================================================================
// TIPOS E CONTRATOS — IMPORTADOR OFICIAL PADRÃO ICLINIC — CLÍNICA FAAZ
// Módulo puro (client/server-safe), sem dependências de Node.js ou TypeORM.
// ============================================================================

export type TipoArquivoIClinic =
  | "patient"
  | "event_record"
  | "event_scheduling"
  | "event_attachment";

export type ModoDuplicadosImportacao = "ignorar" | "atualizar_vazios";

export interface ArquivoIClinicDetectado {
  tipo: TipoArquivoIClinic;
  nomeOriginal: string;
  linhasLidas: number;
  separador: "," | ";";
  encoding: string;
}

export interface PhysicianIClinicResumo {
  physicianId: string;
  qtdProntuarios: number;
  qtdAgendamentos: number;
  qtdAnexos: number;
  qtdTotal: number;
}

export interface ProfissionalClinicaOption {
  id: string;
  nome: string;
  especialidade: string | null;
  crm: string | null;
}

export interface PreviewPacienteIClinic {
  nome: string;
  dataNascimento: string | null;
  cpf: string | null;
  telefone: string | null;
  convenio: string;
  cidadeUf: string | null;
  statusMatch: "NOVO" | "EXISTENTE";
}

export interface PreviewProntuarioIClinic {
  pacienteNome: string;
  dataAtendimento: string;
  physicianId: string;
  qtdBlocos: number;
  qtdAnexos: number;
  resumoTexto: string;
  pacienteVinculado: boolean;
}

export interface PreviewAgendamentoIClinic {
  pacienteNome: string;
  dataHora: string;
  physicianId: string;
  statusOriginal: string;
  statusMapeado: string;
  convenio: string | null;
  pacienteVinculado: boolean;
}

export interface PreviewAnexoIClinic {
  pacienteNome: string;
  data: string;
  physicianId: string;
  titulo: string;
  arquivo: string;
  pacienteVinculado: boolean;
}

export interface PreviewImportacaoIClinicResponse {
  sucesso: true;
  clinicaNome: string;
  arquivosDetectados: ArquivoIClinicDetectado[];
  physiciansEncontrados: PhysicianIClinicResumo[];
  profissionaisClinica: ProfissionalClinicaOption[];
  contagens: {
    pacientesNovos: number;
    pacientesExistentes: number;
    pacientesTotalCsv: number;
    consultasAgrupadas: number;
    linhasProntuarioBrutas: number;
    agendamentosValidos: number;
    bloqueiosIgnorados: number;
    referenciasAnexos: number;
    avisosTotal: number;
  };
  previas: {
    pacientes: PreviewPacienteIClinic[];
    prontuarios: PreviewProntuarioIClinic[];
    agendamentos: PreviewAgendamentoIClinic[];
    anexos: PreviewAnexoIClinic[];
  };
  avisos: string[];
}

export interface ResultadoImportacaoIClinicResponse {
  sucesso: true;
  clinicaNome: string;
  modoDuplicados: ModoDuplicadosImportacao;
  arquivosProcessados: string[];
  totais: {
    pacientesCriados: number;
    pacientesReaproveitados: number;
    pacientesAtualizadosVazios: number;
    consultasCriadas: number;
    consultasIgnoradasDuplicadas: number;
    agendamentosCriados: number;
    agendamentosIgnoradosDuplicados: number;
    bloqueiosIgnorados: number;
    anexosReferenciados: number;
    registrosSemPacienteVinculado: number;
  };
  avisos: string[];
  concluidoEm: string;
}

export const LIMITE_UPLOAD_ICLINIC_MB = 25;
export const LIMITE_UPLOAD_ICLINIC_BYTES =
  LIMITE_UPLOAD_ICLINIC_MB * 1024 * 1024;
