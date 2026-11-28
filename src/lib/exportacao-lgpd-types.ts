// ============================================================================
// TIPOS E METADADOS — EXPORTAÇÃO DE DADOS & PORTABILIDADE (LGPD) — CLÍNICA FAAZ
// Módulo puro (client/server-safe), sem dependências de banco ou Node.js.
// ============================================================================

export const CATEGORIAS_EXPORTACAO = [
  "pacientes",
  "agendamentos",
  "prontuarios",
  "exames",
  "dietas",
  "glicemia",
  "avaliacoes",
  "termometro",
  "pacotes",
] as const;

export type CategoriaExportacao = (typeof CATEGORIAS_EXPORTACAO)[number];

export interface CategoriaExportacaoMeta {
  id: CategoriaExportacao;
  titulo: string;
  descricao: string;
  arquivoCsv: string;
  unidadeContagem: string;
}

export const CATEGORIAS_EXPORTACAO_META: readonly CategoriaExportacaoMeta[] = [
  {
    id: "pacientes",
    titulo: "Pacientes",
    descricao:
      "Cadastro demográfico, contatos, convênio, Plano FAAZ, endereço e objetivos clínicos.",
    arquivoCsv: "pacientes.csv",
    unidadeContagem: "pacientes",
  },
  {
    id: "agendamentos",
    titulo: "Agendamentos",
    descricao:
      "Histórico da agenda, especialidades, médicos, status e observações.",
    arquivoCsv: "agendamentos.csv",
    unidadeContagem: "agendamentos",
  },
  {
    id: "prontuarios",
    titulo: "Prontuários & Evoluções",
    descricao:
      "Fichas clínicas (comorbidades, alergias, medicações) e evoluções médicas.",
    arquivoCsv: "prontuarios.csv",
    unidadeContagem: "registros clínicos",
  },
  {
    id: "exames",
    titulo: "Exames Laboratoriais",
    descricao:
      "Resultados laboratoriais achatados, índices calculados e laudos de imagem.",
    arquivoCsv: "exames_laboratoriais.csv",
    unidadeContagem: "lotes de exames",
  },
  {
    id: "dietas",
    titulo: "Planos Alimentares",
    descricao:
      "Prescrições dietéticas, variações, refeições, alimentos e substituições.",
    arquivoCsv: "dietas.csv",
    unidadeContagem: "planos alimentares",
  },
  {
    id: "glicemia",
    titulo: "Glicemia & Insulina",
    descricao:
      "Monitoramento de glicemia capilar e aplicações de insulina registradas.",
    arquivoCsv: "glicemia.csv",
    unidadeContagem: "registros glicêmicos",
  },
  {
    id: "avaliacoes",
    titulo: "Avaliações & Antropometria",
    descricao:
      "Medidas corporais, circunferências, % de gordura e bioimpedância.",
    arquivoCsv: "avaliacoes_antropometria.csv",
    unidadeContagem: "avaliações",
  },
  {
    id: "termometro",
    titulo: "Termômetro & Hábitos",
    descricao:
      "Check-ins de hidratação, sono, intestino (Bristol), refeições e treinos.",
    arquivoCsv: "termometro_habitos.csv",
    unidadeContagem: "check-ins",
  },
  {
    id: "pacotes",
    titulo: "Programas & Pacotes",
    descricao:
      "Pacotes de acompanhamento (Plano FAAZ) e extrato de consultas realizadas.",
    arquivoCsv: "pacotes_acompanhamento.csv",
    unidadeContagem: "pacotes",
  },
] as const;

export type ResumoExportacaoContagens = Record<CategoriaExportacao, number>;

export interface ResumoExportacaoResponse {
  sucesso: boolean;
  clinicaNome: string;
  contagens: ResumoExportacaoContagens;
  totalRegistros: number;
  atualizadoEm: string;
}

export const CATEGORIAS_EXPORTACAO_SET = new Set<string>(CATEGORIAS_EXPORTACAO);
