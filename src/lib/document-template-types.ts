import type { TipoDocumentoMedico } from "@/components/PrescriptionPDF";

export type DocumentTemplateCategory = "RECEITA" | "EXAME" | "ATESTADO";

export interface DocumentTemplateDTO {
  id: string;
  title: string;
  content: string;
  category: DocumentTemplateCategory;
  documentTitle: string | null;
  createdAt: string;
}

export interface StarterDocumentTemplate {
  title: string;
  documentTitle: string;
  category: DocumentTemplateCategory;
  content: string;
}

export const STARTER_DOCUMENT_TEMPLATES: readonly StarterDocumentTemplate[] = [
  {
    category: "RECEITA",
    title: "Suplementação Metabólica Base",
    documentTitle: "Prescrição Médica — Protocolo Metabólico",
    content: [
      "USO ORAL",
      "",
      "1. Vitamina D3 (Colecalciferol) 2.000 UI ------------------ 1 caixa",
      "   Tomar 01 (uma) cápsula ao dia, após o café da manhã ou almoço.",
      "",
      "2. Creatina Monohidratada 100% Pura ---------------------- 1 frasco",
      "   Diluir 5g em 200 mL de água ou bebida de preferência, 01 vez ao dia, uso contínuo.",
      "",
      "Orientação Clínica: Manter hidratação mínima conforme meta estabelecida em prontuário e acompanhar registros pelo aplicativo Clínica FAAZ.",
    ].join("\n"),
  },
  {
    category: "RECEITA",
    title: "Receituário em Branco",
    documentTitle: "Prescrição Médica Individualizada",
    content: "USO ORAL\n\n1. \n   Posologia: ",
  },
  {
    category: "EXAME",
    title: "Painel Metabólico & Tireoide",
    documentTitle: "Solicitação de Exames — Check-up Metabólico e Endócrino",
    content: [
      "Solicito a realização dos seguintes exames laboratoriais (coleta em jejum de 8 a 12 horas):",
      "",
      "- Hemograma Completo",
      "- Glicemia de Jejum e Insulina Basal (Cálculo HOMA-IR)",
      "- Hemoglobina Glicada (HbA1c)",
      "- Lipidograma Completo (Colesterol Total, HDL, LDL e Triglicerídeos)",
      "- TSH Ultrassensível e T4 Livre",
      "- TGO (AST), TGP (ALT) e Gama-GT",
      "- Ureia, Creatinina e Ácido Úrico",
      "- 25-OH-Vitamina D e Vitamina B12",
      "- Ferritina Sérica e Ferro Sérico",
      "",
      "Indicação Clínica: Avaliação metabólica, hormonal e acompanhamento clínico longitudinal.",
    ].join("\n"),
  },
  {
    category: "EXAME",
    title: "Solicitação Personalizada",
    documentTitle: "Solicitação de Exames Complementares",
    content:
      "Solicito ao paciente a realização dos seguintes exames:\n\n- \n\nIndicação Clínica: Avaliação clínica.",
  },
  {
    category: "ATESTADO",
    title: "Atestado de Comparecimento",
    documentTitle: "Atestado de Comparecimento",
    content: [
      "Atesto, para os devidos fins, que o(a) paciente identificado(a) acima compareceu a este consultório médico na presente data para atendimento clínico ambulatorial na Clínica FAAZ.",
      "",
      "Atendimento realizado no período da consulta médica, necessitando ausentar-se de suas atividades laborais/acadêmicas durante o turno correspondente.",
    ].join("\n"),
  },
  {
    category: "ATESTADO",
    title: "Atestado de Repouso (Dias)",
    documentTitle: "Atestado Médico de Afastamento",
    content: [
      "Atesto, para os devidos fins, que o(a) paciente identificado(a) acima foi submetido(a) a atendimento médico na Clínica FAAZ nesta data e necessita de afastamento de suas atividades habituais pelo período de ____ (________) dia(s), a contar desta data, por motivo de saúde.",
      "",
      "CID-10 (mediante autorização expressa do paciente): __________.",
    ].join("\n"),
  },
];

export function toTemplateCategory(
  raw: TipoDocumentoMedico | DocumentTemplateCategory | string
): DocumentTemplateCategory {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "RECEITUARIO" || normalized === "RECEITA") {
    return "RECEITA";
  }
  if (normalized === "EXAMES" || normalized === "EXAME") {
    return "EXAME";
  }
  if (normalized === "ATESTADO") {
    return "ATESTADO";
  }
  throw new Error(`Categoria de modelo desconhecida: ${raw}`);
}

export function getCategoryQueryAliases(
  category: DocumentTemplateCategory
): string[] {
  if (category === "RECEITA") return ["RECEITA", "RECEITUARIO"];
  if (category === "EXAME") return ["EXAME", "EXAMES"];
  return ["ATESTADO"];
}
