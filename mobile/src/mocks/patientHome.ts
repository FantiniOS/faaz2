export interface PacienteProfile {
  nome: string;
  faseProtocolo: string;
  proximaConsulta: string;
}

export interface MetaAgua {
  atual: number;
  meta: number;
  unidade: string;
}

export interface MetaCalorias {
  atual: number;
  meta: number;
  unidade: string;
}

export interface MetasHoje {
  agua: MetaAgua;
  calorias: MetaCalorias;
  treinoFeito: boolean;
}

export interface CheckinPendente {
  id: "glicemia" | "bristol" | "sono" | string;
  titulo: string;
  subtitulo: string;
  icone: string;
  cor: string;
}

export interface PatientHomeData {
  paciente: PacienteProfile;
  metasHoje: MetasHoje;
  checkinsPendentes: CheckinPendente[];
}

export const mockPatientHome: PatientHomeData = {
  paciente: {
    nome: "Carlos",
    faseProtocolo: "Queima Acelerada",
    proximaConsulta: "15 de Novembro (em 13 dias)",
  },
  metasHoje: {
    agua: { atual: 0, meta: 0, unidade: "L" },
    calorias: { atual: 0, meta: 0, unidade: "kcal" },
    treinoFeito: false,
  },
  checkinsPendentes: [
    {
      id: "glicemia",
      titulo: "Glicemia Capilar",
      subtitulo: "Registrar medição agora (mg/dL)",
      icone: "HeartPulse",
      cor: "bg-rose-100 text-rose-600",
    },
    {
      id: "bristol",
      titulo: "Intestino",
      subtitulo: "Como foi hoje?",
      icone: "Activity",
      cor: "bg-amber-100 text-amber-600",
    },
    {
      id: "sono",
      titulo: "Sono",
      subtitulo: "Acordou descansado?",
      icone: "Moon",
      cor: "bg-indigo-100 text-indigo-600",
    },
  ],
};
