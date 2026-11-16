// ============================================================================
// RBAC (ROLE-BASED ACCESS CONTROL) — CLÍNICA FAAZ
// Versão 2.0: Sistema completo de Login, Gestão e Controle de Acesso
// ============================================================================

/**
 * DONO_CLINICA    → Médico Titular/Proprietário: poder administrativo TOTAL + acesso irrestrito a TODOS os prontuários
 * MEDICO          → Médico: acesso clínico aos prontuários e prescrições dos pacientes atendidos
 * SECRETARIA      → Secretária: acesso operacional à Agenda, Recepção e Cadastro; BLOQUEADO para prontuários
 * ADMINISTRADOR   → Administrador: acesso gerencial e financeiro; BLOQUEADO para prontuários e diagnósticos
 */
export type Cargo = "DONO_CLINICA" | "MEDICO" | "SECRETARIA" | "ADMINISTRADOR";

export interface UserSessionPayload {
  userId: string;
  nome: string;
  cargo: Cargo;
  email: string;
  organizationId?: string;
}

// ============================================================================
// MATRIZES DE PERMISSÃO
// ============================================================================

/** Cargos com acesso irrestrito a prontuários clínicos, dietas e diagnósticos */
export const CARGOS_AUTORIZADOS_PRONTUARIO: Cargo[] = [
  "DONO_CLINICA",
  "MEDICO",
];

/** Cargos estritamente BLOQUEADOS de visualizar prontuários e dados clínicos sensíveis */
export const CARGOS_RESTRITOS_CLINICA: Cargo[] = [
  "SECRETARIA",
  "ADMINISTRADOR",
];

/** Cargos que podem gerenciar (CRUD) a equipe da clínica (médicos, secretárias, admins) */
export const CARGOS_GESTAO_EQUIPE: Cargo[] = [
  "DONO_CLINICA",
  "ADMINISTRADOR",
];

/** Cargos que podem cadastrar e alterar pacientes */
export const CARGOS_CADASTRO_PACIENTES: Cargo[] = [
  "DONO_CLINICA",
  "MEDICO",
  "SECRETARIA",
  "ADMINISTRADOR",
];

/** Cargos autorizados a apagar/excluir pacientes (Somente Dono da Clínica e Administrador) */
export const CARGOS_EXCLUSAO_PACIENTES: Cargo[] = [
  "DONO_CLINICA",
  "ADMINISTRADOR",
];

/** Cargos que podem acessar o painel administrativo (gestão, financeiro, equipe) */
export const CARGOS_PAINEL_ADMIN: Cargo[] = [
  "DONO_CLINICA",
  "ADMINISTRADOR",
];

// ============================================================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================================================

/** Valida se um cargo possui credencial para acesso a prontuários e dados clínicos */
export function podeAcessarDadosClinicos(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return CARGOS_AUTORIZADOS_PRONTUARIO.includes(cargo as Cargo);
}

/** Valida se o cargo pode gerenciar equipe (CRUD de funcionários) */
export function podeGerenciarEquipe(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return CARGOS_GESTAO_EQUIPE.includes(cargo as Cargo);
}

/** Valida se o cargo pode cadastrar ou alterar pacientes */
export function podeCadastrarPacientes(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return CARGOS_CADASTRO_PACIENTES.includes(cargo as Cargo);
}

/** Valida se o cargo pode excluir/apagar pacientes (Apenas DONO_CLINICA e ADMINISTRADOR) */
export function podeExcluirPacientes(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return CARGOS_EXCLUSAO_PACIENTES.includes(cargo as Cargo);
}

/** Valida se o cargo pode acessar o painel administrativo */
export function podeAcessarPainelAdmin(cargo: string | null | undefined): boolean {
  if (!cargo) return false;
  return CARGOS_PAINEL_ADMIN.includes(cargo as Cargo);
}

/** Valida se o cargo é o proprietário da clínica (poder total) */
export function isDonoClinica(cargo: string | null | undefined): boolean {
  return cargo === "DONO_CLINICA";
}

/**
 * Validação programática para rotas de API / Server Actions — lança Error com status 403
 */
export function assertPermissaoClinica(cargo: string | null | undefined) {
  if (!podeAcessarDadosClinicos(cargo)) {
    const error: any = new Error(
      `Acesso Negado (RBAC): O cargo '${cargo || "DESCONHECIDO"}' não possui autorização para acessar dados de saúde dos pacientes.`
    );
    error.status = 403;
    throw error;
  }
}

/**
 * Retorna label amigável do cargo para exibição na UI
 */
export function labelCargo(cargo: Cargo): string {
  const labels: Record<Cargo, string> = {
    DONO_CLINICA: "Dono da Clínica (Médico Titular)",
    MEDICO: "Médico",
    SECRETARIA: "Secretária",
    ADMINISTRADOR: "Administrador",
  };
  return labels[cargo] || cargo;
}

/**
 * Retorna a cor associada ao cargo (Tailwind class)
 */
export function corCargo(cargo: Cargo): string {
  const cores: Record<Cargo, string> = {
    DONO_CLINICA: "bg-emerald-100 text-emerald-800",
    MEDICO: "bg-blue-100 text-blue-800",
    SECRETARIA: "bg-amber-100 text-amber-800",
    ADMINISTRADOR: "bg-purple-100 text-purple-800",
  };
  return cores[cargo] || "bg-gray-100 text-gray-800";
}
