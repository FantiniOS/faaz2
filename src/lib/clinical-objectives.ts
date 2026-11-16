export const CLINICAL_OBJECTIVES = [
  "Otimização Metabólica & Saúde Integrativa",
  "Emagrecimento Saudável e Sustentável",
  "Hipertrofia e Ganho de Massa Muscular",
  "Reeducação Alimentar e Manutenção",
  "Controle Glicêmico e Metabólico",
  "Performance Esportiva",
] as const;

export type ClinicalObjective = (typeof CLINICAL_OBJECTIVES)[number];

export const DEFAULT_CLINICAL_OBJECTIVE = "Otimização Metabólica & Saúde Integrativa";
