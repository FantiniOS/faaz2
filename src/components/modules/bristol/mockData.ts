export interface BristolRecord {
  id: number;
  dia: string;
  hora: string;
  tipo: number;
  descricao: string;
  status: "ideal" | "alerta" | string;
}

export interface BristolHistory {
  pacienteId: string;
  nome: string;
  modulo: string;
  registros: BristolRecord[];
}

export const mockBristolHistory: BristolHistory = {
  pacienteId: "123",
  nome: "Malu Fantini",
  modulo: "Bristol",
  registros: [
    { id: 1, dia: "Hoje", hora: "08:35", tipo: 4, descricao: "Formato de salsicha ou cobra, lisa e macia (Ideal)", status: "ideal" },
    { id: 2, dia: "Ontem", hora: "09:15", tipo: 3, descricao: "Formato de salsicha, com rachaduras na superfície", status: "ideal" },
    { id: 3, dia: "Segunda", hora: "10:50", tipo: 1, descricao: "Bolinhas duras e separadas (difícil de sair)", status: "alerta" }
  ]
};
