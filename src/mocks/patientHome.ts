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
  id: "bristol" | "sono" | "humor" | string;
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
    agua: { atual: 1.5, meta: 3.0, unidade: "L" },
    calorias: { atual: 1200, meta: 1800, unidade: "kcal" },
    treinoFeito: false,
  },
  checkinsPendentes: [
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
    {
      id: "humor",
      titulo: "Bem-estar",
      subtitulo: "Nível de estresse",
      icone: "Smile",
      cor: "bg-rose-100 text-rose-600",
    },
  ],
};
