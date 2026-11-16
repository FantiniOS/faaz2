import { Cargo } from "@/lib/auth-rbac";

export interface UserSession {
  id: string;
  nome: string;
  role: "MEDICO" | "ADMIN" | "RECEPTIONIST" | "PACIENTE";
  cargo: Cargo;
  avatar: string;
}

export interface ChartDataItem {
  nome: string;
  valor: number;
}

export interface AlertItem {
  paciente: string;
  valor: string;
  tempo: string;
}

export interface DashboardWidgetConfig {
  id: string;
  titulo: string;
  tipo: "gauge" | "bar" | "trend" | "line" | "area" | "alert-list" | "tags" | "alert-number";
  valor?: number | string;
  tendencia?: string;
  subtexto?: string;
  dados?: (ChartDataItem | AlertItem | string)[];
}

export const mockUserSession: UserSession = {
  id: "doc-01",
  nome: "Dr. Carlos Fantini",
  role: "MEDICO",
  cargo: "DONO_CLINICA",
  avatar: "https://ui-avatars.com/api/?name=Carlos+Fantini&background=0D8ABC&color=fff",
};

export const mockDashboardConfig: DashboardWidgetConfig[] = [
  {
    id: "alertas-glicemicos",
    titulo: "Alertas Glicêmicos",
    tipo: "alert-list",
    dados: [
      { paciente: "Maria Luiza", valor: "65 mg/dL", tempo: "1h atrás" },
      { paciente: "João Pedro", valor: "185 mg/dL", tempo: "3h atrás" },
    ],
  },
  {
    id: "aderencia-hidrica",
    titulo: "Aderência Hídrica",
    tipo: "gauge",
    valor: 85,
    tendencia: "+5%",
  },
  {
    id: "escala-bristol",
    titulo: "Saúde Intestinal (Bristol)",
    tipo: "bar",
    dados: [
      { nome: "Ideal", valor: 60 },
      { nome: "Constipação", valor: 25 },
      { nome: "Diarreia", valor: 15 },
    ],
  },
  {
    id: "qualidade-sono",
    titulo: "Qualidade do Sono",
    tipo: "line",
    valor: "6.5h",
  },
  {
    id: "evolucao-peso",
    titulo: "Evolução de Peso (Média)",
    tipo: "area",
    valor: "-2.4kg",
  },
  {
    id: "sintomas-frequentes",
    titulo: "Sintomas Frequentes",
    tipo: "tags",
    dados: ["Fadiga", "Estufamento", "Cravings (Doce)", "Ansiedade"],
  },
  {
    id: "risco-evasao",
    titulo: "Risco de Evasão",
    tipo: "alert-number",
    valor: 4,
    subtexto: "Sem abrir app > 7 dias",
  },
  {
    id: "engajamento-app",
    titulo: "Engajamento no App",
    tipo: "trend",
    valor: "78%",
    tendencia: "+12%",
  },
];
