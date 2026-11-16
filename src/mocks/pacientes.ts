export type StatusApp = "ATIVO" | "EM_RISCO" | "ALTA";

export interface Paciente {
  id: string;
  nome: string;
  avatar: string;
  idade: number;
  telefone: string;
  email: string;
  statusApp: StatusApp;
  tagsClinicas: string[];
  ultimaConsulta: string;
  medicoVinculado: string;
  adesaoMetabolica?: number; // porcentagem 0-100
}

export const mockPacientes: Paciente[] = [
  {
    id: "pt-001",
    nome: "Carlos Henrique Fantini",
    avatar: "https://ui-avatars.com/api/?name=Carlos+Henrique+Fantini&background=0D8ABC&color=fff",
    idade: 50,
    telefone: "(31) 99999-9999",
    email: "carlos.henrique@gmail.com",
    statusApp: "ATIVO",
    tagsClinicas: ["Diabetes", "Resistência à Insulina", "Hipertrofia"],
    ultimaConsulta: "2026-10-15",
    medicoVinculado: "Dr. Carlos Fantini",
    adesaoMetabolica: 92,
  },
  {
    id: "pt-002",
    nome: "Maria Luiza Fantini",
    avatar: "https://ui-avatars.com/api/?name=Maria+Luiza&background=E11D48&color=fff",
    idade: 22,
    telefone: "(31) 98888-8888",
    email: "malu.fantini@gmail.com",
    statusApp: "EM_RISCO",
    tagsClinicas: ["Emagrecimento", "Saúde Intestinal"],
    ultimaConsulta: "2026-09-20",
    medicoVinculado: "Dr. Carlos Fantini",
    adesaoMetabolica: 45,
  },
  {
    id: "pt-003",
    nome: "Eduardo Silveira Ramos",
    avatar: "https://ui-avatars.com/api/?name=Eduardo+Silveira&background=10B981&color=fff",
    idade: 41,
    telefone: "(31) 97777-7777",
    email: "eduardo.ramos@outlook.com",
    statusApp: "ATIVO",
    tagsClinicas: ["Diabetes", "Controle Glicêmico", "Bioimpedância"],
    ultimaConsulta: "2026-10-28",
    medicoVinculado: "Dr. Carlos Fantini",
    adesaoMetabolica: 88,
  },
  {
    id: "pt-004",
    nome: "Beatriz Nogueira Mendes",
    avatar: "https://ui-avatars.com/api/?name=Beatriz+Nogueira&background=8B5CF6&color=fff",
    idade: 34,
    telefone: "(31) 96666-6666",
    email: "beatriz.mendes@uol.com.br",
    statusApp: "ALTA",
    tagsClinicas: ["Emagrecimento", "Hipotireoidismo", "Remissão"],
    ultimaConsulta: "2026-08-11",
    medicoVinculado: "Dra. Camila Vasconcelos",
    adesaoMetabolica: 98,
  },
  {
    id: "pt-005",
    nome: "Lucas Ferreira Alcantara",
    avatar: "https://ui-avatars.com/api/?name=Lucas+Alcantara&background=F59E0B&color=fff",
    idade: 29,
    telefone: "(31) 95555-5555",
    email: "lucas.alcantara@gmail.com",
    statusApp: "EM_RISCO",
    tagsClinicas: ["TRT", "Reposição Hormonal", "Esteatose Hepática"],
    ultimaConsulta: "2026-09-02",
    medicoVinculado: "Dra. Camila Vasconcelos",
    adesaoMetabolica: 38,
  },
  {
    id: "pt-006",
    nome: "Juliana Peixoto de Castro",
    avatar: "https://ui-avatars.com/api/?name=Juliana+Peixoto&background=06B6D4&color=fff",
    idade: 47,
    telefone: "(31) 94444-4444",
    email: "juliana.castro@terra.com.br",
    statusApp: "ATIVO",
    tagsClinicas: ["TRT", "Menopausa", "Modulação Metabólica"],
    ultimaConsulta: "2026-10-30",
    medicoVinculado: "Dr. Carlos Fantini",
    adesaoMetabolica: 84,
  },
];
