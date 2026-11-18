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
    dados: [],
  },
  {
    id: "aderencia-hidrica",
    titulo: "Aderência Hídrica",
    tipo: "gauge",
    valor: 0,
  },
  {
    id: "escala-bristol",
    titulo: "Saúde Intestinal (Bristol)",
    tipo: "bar",
    dados: [],
  },
  {
    id: "evolucao-peso",
    titulo: "Evolução de Peso (Média)",
    tipo: "area",
    valor: "0.0kg",
  },
  {
    id: "risco-evasao",
    titulo: "Risco de Evasão",
    tipo: "alert-number",
    valor: 0,
    subtexto: "Sem check-in ou acesso > 7 dias",
  },
  {
    id: "engajamento-app",
    titulo: "Engajamento no App",
    tipo: "trend",
    valor: "0%",
  },
];
