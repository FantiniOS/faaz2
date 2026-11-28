// ============================================================================
// MOTOR SEGURO DE EXPORTAÇÃO DE DADOS & PORTABILIDADE (LGPD) — CLÍNICA FAAZ
// Dialeto: Oracle Autonomous Database (TypeORM + node-oracledb Thin Mode)
// ============================================================================
// • RBAC estrito (Diretoria Clínica para exportação geral; Corpo Clínico para LGPD individual)
// • Isolamento rigoroso por ORGANIZATION_ID (anti-IDOR)
// • Zero credenciais/senhas/hashes/tokens em CSV e JSON
// • Proteção contra CSV / Formula Injection (=, +, -, @, \t, \r)
// • UTF-8 BOM (\uFEFF) + separador ponto e vírgula (;) compatível com Excel PT-BR
// • Concorrência controlada (poolMax = 2 no Oracle ADB Always Free)
// • Trilha de auditoria em AUDIT_LOGS + log estruturado no servidor
// ============================================================================

import crypto from "crypto";
import JSZip from "jszip";
import type { DataSource } from "typeorm";
import {
  getDataSource,
  runWithConcurrency,
  withOracleRetry,
} from "@/lib/db/data-source";
import {
  extractOracleErrorInfo,
  safeClobString,
  safeJsonParse,
} from "@/lib/db/oracle-utils";
import type { UserSessionPayload } from "@/lib/auth-rbac";
import {
  formatarDataBR,
  formatarDataHoraBR,
  getHojeBR,
  getHoraBR,
} from "@/lib/date-br";
import {
  EXAM_BY_KEY,
  EXAM_CATEGORY_MAP,
  LAUDO_BY_KEY,
  computeCalculatedExams,
  formatExamNumber,
  parseNumericExamValue,
} from "@/lib/exames-catalog";
import {
  CATEGORIAS_EXPORTACAO,
  CATEGORIAS_EXPORTACAO_META,
  CATEGORIAS_EXPORTACAO_SET,
  type CategoriaExportacao,
  type ResumoExportacaoContagens,
} from "@/lib/exportacao-lgpd-types";

const DEFAULT_FAAZ_NAME = "Clínica FAAZ";

// ============================================================================
// 1. RBAC ESTRITO DE EXPORTAÇÃO E EXTRAÇÃO DE IP
// ============================================================================

const DIRETORIA_ALLOWED_ROLES = new Set(["DONO_CLINICA", "CLINIC_ADMIN"]);
const DIRETORIA_BLOCKED_ROLES = new Set([
  "MEDICO",
  "DOCTOR",
  "SECRETARIA",
  "RECEPTIONIST",
  "ADMINISTRADOR",
  "ADMIN",
  "PACIENTE",
  "PATIENT",
  "NUTRITIONIST",
  "STAFF",
]);

const CLINICO_ALLOWED_ROLES = new Set([
  "DONO_CLINICA",
  "CLINIC_ADMIN",
  "MEDICO",
  "DOCTOR",
]);
const CLINICO_BLOCKED_ROLES = new Set([
  "SECRETARIA",
  "RECEPTIONIST",
  "ADMINISTRADOR",
  "ADMIN",
  "PACIENTE",
  "PATIENT",
  "STAFF",
]);

type SessionWithOptionalRole = UserSessionPayload & { role?: string };

/**
 * Valida acesso estrito à Exportação Completa da Clínica:
 * SOMENTE DONO_CLINICA / CLINIC_ADMIN (Diretoria Clínica).
 */
export function isDiretoriaExportacaoAutorizada(
  sessao: SessionWithOptionalRole | null,
): boolean {
  if (!sessao) return false;
  const cargo = (sessao.cargo || "").trim().toUpperCase();
  const role = (sessao.role || "").trim().toUpperCase();
  if (DIRETORIA_BLOCKED_ROLES.has(cargo) || DIRETORIA_BLOCKED_ROLES.has(role)) {
    return false;
  }
  return DIRETORIA_ALLOWED_ROLES.has(cargo) || DIRETORIA_ALLOWED_ROLES.has(role);
}

/**
 * Valida acesso estrito à Portabilidade Individual do Paciente (LGPD):
 * SOMENTE corpo clínico (DONO_CLINICA, CLINIC_ADMIN, MEDICO, DOCTOR).
 */
export function isCorpoClinicoExportacaoAutorizado(
  sessao: SessionWithOptionalRole | null,
): boolean {
  if (!sessao) return false;
  const cargo = (sessao.cargo || "").trim().toUpperCase();
  const role = (sessao.role || "").trim().toUpperCase();
  if (CLINICO_BLOCKED_ROLES.has(cargo) || CLINICO_BLOCKED_ROLES.has(role)) {
    return false;
  }
  return CLINICO_ALLOWED_ROLES.has(cargo) || CLINICO_ALLOWED_ROLES.has(role);
}

/** Extrai IP do cliente a partir dos headers padrão (Vercel / proxy reverso). */
export function extrairClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || null;
}

// ============================================================================
// 2. HELPERS ORACLE (NORMALIZAÇÃO DE CHAVES E TRATAMENTO ORA-00942)
// ============================================================================

function isOracleUndefinedTableError(error: unknown): boolean {
  const info = extractOracleErrorInfo(error);
  return info.errorNum === 942; // ORA-00942: table or view does not exist
}

function normalizeOracleRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

export async function safeOracleQuery<T>(
  ds: DataSource,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  try {
    const rows = (await ds.query(sql, params)) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => normalizeOracleRow(row)) as unknown as T[];
  } catch (err) {
    if (isOracleUndefinedTableError(err)) {
      return [];
    }
    throw err;
  }
}

async function safeOracleCount(
  ds: DataSource,
  sql: string,
  params: unknown[],
): Promise<number> {
  const rows = await safeOracleQuery<{ total?: string | number }>(ds, sql, params);
  const val = Number(rows[0]?.total ?? 0);
  return Number.isFinite(val) ? val : 0;
}

function toBoolOracle(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const norm = v.trim().toLowerCase();
    return norm === "1" || norm === "true" || norm === "s" || norm === "sim";
  }
  return Boolean(v);
}

// ============================================================================
// 3. RESOLUÇÃO DE ORGANIZAÇÃO E DADOS DA CLÍNICA
// ============================================================================

export interface ContextoOrganizacaoExportacao {
  organizationId: string;
  clinicaNome: string;
  razaoSocial: string | null;
  cnpj: string | null;
}

export async function resolverContextoOrganizacao(
  sessao: UserSessionPayload,
): Promise<ContextoOrganizacaoExportacao | null> {
  return withOracleRetry(
    async () => {
      const ds = await getDataSource();
      let orgId = (sessao.organizationId || "").trim();

      if (!orgId && sessao.userId) {
        const userRows = await safeOracleQuery<{ organization_id?: string }>(
          ds,
          `SELECT ORGANIZATION_ID
             FROM USERS
            WHERE ID = :1 AND DELETED_AT IS NULL
            FETCH FIRST 1 ROWS ONLY`,
          [sessao.userId],
        );
        orgId = (userRows[0]?.organization_id || "").trim();
      }

      if (!orgId) return null;

      const orgRows = await safeOracleQuery<{
        id: string;
        trade_name?: string | null;
        legal_name?: string | null;
        tax_id?: string | null;
      }>(
        ds,
        `SELECT ID, TRADE_NAME, LEGAL_NAME, TAX_ID
           FROM ORGANIZATIONS
          WHERE ID = :1
          FETCH FIRST 1 ROWS ONLY`,
        [orgId],
      );

      const org = orgRows[0];
      return {
        organizationId: orgId,
        clinicaNome:
          (org?.trade_name || "").trim() ||
          (org?.legal_name || "").trim() ||
          DEFAULT_FAAZ_NAME,
        razaoSocial: (org?.legal_name || "").trim() || null,
        cnpj: (org?.tax_id || "").trim() || null,
      };
    },
    { label: "exportacao:resolver-org" },
  );
}

// ============================================================================
// 4. SANITIZAÇÃO ANTI-CSV / FORMULA INJECTION E FORMATADOR EXCEL PT-BR
// ============================================================================

const UTF8_BOM = "\uFEFF";
const CSV_SEPARATOR = ";";
const CSV_EOL = "\r\n";

/** Qualquer texto que comece com =, +, -, @, \t ou \r (mesmo precedido por espaço) */
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const LEADING_SPACE_FORMULA_RE = /^[ ]+[=+\-@\t\r]/;

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "senha",
  "token",
  "refresh_token",
  "refreshtoken",
  "secret",
  "mfa_secret",
  "mfasecret",
  "hash",
  "salt",
  "private_key",
  "privatekey",
  "api_key",
  "apikey",
];

function isSensitiveKey(key: string): boolean {
  const norm = key.trim().toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pat) => norm.includes(pat));
}

/**
 * Remove recursivamente qualquer chave sensível de objetos/arrays antes de serializar JSON.
 */
export function stripSensitiveKeys<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (input instanceof Date) return input;
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveKeys(item)) as unknown as T;
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isSensitiveKey(k)) continue;
      out[k] = stripSensitiveKeys(v);
    }
    return out as T;
  }
  return input;
}

function formatDateTimeFullBR(value: Date | string | null | undefined): string {
  if (!value) return "";
  const formatted = formatarDataHoraBR(value, true);
  return formatted === "--" ? "" : formatted.replace(", ", " ");
}

function formatDateOnlyBR(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const formatted = formatarDataBR(value);
  return formatted === "--" ? "" : formatted;
}

/**
 * Sanitiza e escapa uma célula CSV para Excel PT-BR com proteção estrita contra Formula Injection.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let isPureFiniteNumber = false;
  let str: string;

  if (value instanceof Date) {
    str = Number.isNaN(value.getTime()) ? "" : formatDateTimeFullBR(value);
  } else if (typeof value === "boolean") {
    str = value ? "SIM" : "NÃO";
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    isPureFiniteNumber = true;
    str = String(value).replace(".", ",");
  } else if (typeof value === "object") {
    try {
      str = JSON.stringify(stripSensitiveKeys(value));
    } catch {
      str = "";
    }
  } else {
    str = String(value);
  }

  str = str.replace(/\0/g, "");

  if (!isPureFiniteNumber) {
    if (FORMULA_PREFIX_RE.test(str) || LEADING_SPACE_FORMULA_RE.test(str)) {
      str = `'${str}`;
    }
  } else if (str.startsWith("-") && !/^-\d+(,\d+)?$/.test(str)) {
    str = `'${str}`;
  }

  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => unknown;
}

/**
 * Gera string CSV em UTF-8 com BOM (\uFEFF), separador `;` e proteção contra CSV Injection.
 */
export function buildCsv<Row>(
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[],
): string {
  const headerLine = columns
    .map((col) => sanitizeCsvCell(col.header))
    .join(CSV_SEPARATOR);
  const dataLines = rows.map((row) =>
    columns.map((col) => sanitizeCsvCell(col.value(row))).join(CSV_SEPARATOR),
  );
  return UTF8_BOM + [headerLine, ...dataLines].join(CSV_EOL) + CSV_EOL;
}

// ============================================================================
// 5. VALIDAÇÃO DE PARÂMETROS DE FILTRO E NOME DE ARQUIVO
// ============================================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PeriodoFiltroExportacao {
  dataInicio: string | null;
  dataFim: string | null;
  inicioUtc: Date | null;
  fimUtc: Date | null;
}

export function validarPeriodoExportacao(
  rawInicio: unknown,
  rawFim: unknown,
): { ok: true; periodo: PeriodoFiltroExportacao } | { ok: false; error: string } {
  const dataInicio =
    typeof rawInicio === "string" && rawInicio.trim() ? rawInicio.trim() : null;
  const dataFim =
    typeof rawFim === "string" && rawFim.trim() ? rawFim.trim() : null;

  if (dataInicio && !ISO_DATE_RE.test(dataInicio)) {
    return {
      ok: false,
      error: "Data inicial inválida. Utilize o formato YYYY-MM-DD.",
    };
  }
  if (dataFim && !ISO_DATE_RE.test(dataFim)) {
    return {
      ok: false,
      error: "Data final inválida. Utilize o formato YYYY-MM-DD.",
    };
  }
  if (dataInicio && dataFim && dataInicio > dataFim) {
    return {
      ok: false,
      error: "A data inicial não pode ser posterior à data final.",
    };
  }

  return {
    ok: true,
    periodo: {
      dataInicio,
      dataFim,
      inicioUtc: dataInicio ? new Date(`${dataInicio}T00:00:00.000-03:00`) : null,
      fimUtc: dataFim ? new Date(`${dataFim}T23:59:59.999-03:00`) : null,
    },
  };
}

export function validarCategoriasExportacao(
  rawCategorias: unknown,
): { ok: true; categorias: CategoriaExportacao[] } | { ok: false; error: string } {
  if (rawCategorias === undefined || rawCategorias === null) {
    return { ok: true, categorias: [...CATEGORIAS_EXPORTACAO] };
  }
  if (!Array.isArray(rawCategorias)) {
    return { ok: false, error: "O campo 'categorias' deve ser uma lista." };
  }
  const selecionadas: CategoriaExportacao[] = [];
  const vistas = new Set<string>();
  for (const item of rawCategorias) {
    if (typeof item !== "string") continue;
    const norm = item.trim().toLowerCase();
    if (CATEGORIAS_EXPORTACAO_SET.has(norm) && !vistas.has(norm)) {
      vistas.add(norm);
      selecionadas.push(norm as CategoriaExportacao);
    }
  }
  if (selecionadas.length === 0) {
    return {
      ok: false,
      error: "Selecione ao menos uma categoria válida para exportação.",
    };
  }
  return { ok: true, categorias: selecionadas };
}

export function sanitizarNomeArquivoPaciente(nome: string): string {
  const limpo = (nome || "PACIENTE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return limpo || "PACIENTE";
}

// ============================================================================
// 6. RESUMO DE CONTAGENS (CONCORRÊNCIA LIMITADA A 2 PARA ORACLE ADB)
// ============================================================================

export async function obterResumoExportacaoClinica(
  organizationId: string,
): Promise<ResumoExportacaoContagens> {
  return withOracleRetry(
    async () => {
      const ds = await getDataSource();

      const results = await runWithConcurrency<number>(
        [
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL FROM PATIENTS WHERE ORGANIZATION_ID = :1 AND DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM AGENDAMENTOS A
                 INNER JOIN PATIENTS P ON P.ID = A.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM PRONTUARIOS_PACIENTES PR
                 INNER JOIN PATIENTS P ON P.ID = PR.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM EVOLUCOES_CLINICAS EV
                 INNER JOIN PATIENTS P ON P.ID = EV.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM EXAMES_LABORATORIAIS E
                 INNER JOIN PATIENTS P ON P.ID = E.PACIENTE_ID
                WHERE E.ORGANIZACAO_ID = :1 AND P.ORGANIZATION_ID = :2 AND P.DELETED_AT IS NULL`,
              [organizationId, organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM PLANOS_ALIMENTARES PA
                 INNER JOIN PATIENTS P ON P.ID = PA.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM REGISTROS_GLICEMIA G
                 INNER JOIN PATIENTS P ON P.ID = G.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM REGISTROS_INSULINA INS
                 INNER JOIN PATIENTS P ON P.ID = INS.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM MEASUREMENTS M
                 INNER JOIN PATIENTS P ON P.ID = M.PATIENT_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM BIOMETRIC_MEASUREMENTS B
                 INNER JOIN PATIENTS P ON P.ID = B.PATIENT_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL AND B.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM CHECKINS_HIDRATACAO H
                 INNER JOIN PATIENTS P ON P.ID = H.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM CHECKINS_SONO S
                 INNER JOIN PATIENTS P ON P.ID = S.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM CHECKINS_INTESTINAIS I
                 INNER JOIN PATIENTS P ON P.ID = I.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM CHECKINS_REFEICOES CR
                 INNER JOIN PATIENTS P ON P.ID = CR.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM WORKOUT_LOGS W
                 INNER JOIN PATIENTS P ON P.ID = W.PATIENT_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM GOAL_CHECKINS GC
                 INNER JOIN PATIENTS P ON P.ID = GC.PATIENT_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL AND GC.DELETED_AT IS NULL`,
              [organizationId],
            ),
          () =>
            safeOracleCount(
              ds,
              `SELECT COUNT(*) AS TOTAL
                 FROM PACOTES_ACOMPANHAMENTO PK
                 INNER JOIN PATIENTS P ON P.ID = PK.PACIENTE_ID
                WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL`,
              [organizationId],
            ),
        ],
        2,
      );

      const [
        pacientes,
        agendamentos,
        prontuariosFichas,
        evolucoes,
        exames,
        dietas,
        glicemia,
        insulina,
        measurements,
        biometrics,
        hidratacao,
        sono,
        intestinais,
        refeicoesCheckin,
        treinos,
        goalCheckins,
        pacotes,
      ] = results;

      return {
        pacientes,
        agendamentos,
        prontuarios: prontuariosFichas + evolucoes,
        exames,
        dietas,
        glicemia: glicemia + insulina,
        avaliacoes: measurements + biometrics,
        termometro:
          hidratacao +
          sono +
          intestinais +
          refeicoesCheckin +
          treinos +
          goalCheckins,
        pacotes,
      };
    },
    { label: "exportacao:resumo" },
  );
}

// ---------- Helpers de filtro SQL Oracle (:1, :2, ...) ----------

function buildTsRangeClause(
  column: string,
  periodo: PeriodoFiltroExportacao,
  params: unknown[],
): string {
  const clauses: string[] = [];
  if (periodo.inicioUtc) {
    params.push(periodo.inicioUtc);
    clauses.push(`${column} >= :${params.length}`);
  }
  if (periodo.fimUtc) {
    params.push(periodo.fimUtc);
    clauses.push(`${column} <= :${params.length}`);
  }
  return clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
}

function buildOracleDateRangeClause(
  column: string,
  periodo: PeriodoFiltroExportacao,
  params: unknown[],
): string {
  const clauses: string[] = [];
  if (periodo.dataInicio) {
    params.push(periodo.dataInicio);
    clauses.push(`${column} >= TO_DATE(:${params.length}, 'YYYY-MM-DD')`);
  }
  if (periodo.dataFim) {
    params.push(periodo.dataFim);
    clauses.push(`${column} <= TO_DATE(:${params.length}, 'YYYY-MM-DD')`);
  }
  return clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
}

function buildDateStrRangeClause(
  column: string,
  periodo: PeriodoFiltroExportacao,
  params: unknown[],
): string {
  const clauses: string[] = [];
  if (periodo.dataInicio) {
    params.push(periodo.dataInicio);
    clauses.push(`${column} >= :${params.length}`);
  }
  if (periodo.dataFim) {
    params.push(periodo.dataFim);
    clauses.push(`${column} <= :${params.length}`);
  }
  return clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
}

function buildPatientFilterClause(
  patientIdColumn: string,
  pacienteId: string | undefined,
  params: unknown[],
): string {
  if (!pacienteId) return "";
  params.push(pacienteId);
  return ` AND ${patientIdColumn} = :${params.length}`;
}

// ============================================================================
// 7. EXTRAÇÃO E CONSTRUÇÃO DE CADA CATEGORIA (DIALETO ORACLE)
// ============================================================================

interface PatientExportRow {
  id: string;
  record_code: string;
  full_name: string;
  social_name: string | null;
  cpf: string | null;
  rg: string | null;
  birth_date: string | Date | null;
  biological_sex: string | null;
  estado_civil: string | null;
  profissao: string | null;
  convenio: string | null;
  plano_faaz: number | boolean;
  height_cm: number | string | null;
  phone_whatsapp: string | null;
  telefone_secundario: string | null;
  email: string | null;
  contato_emergencia_nome: string | null;
  contato_emergencia_telefone: string | null;
  clinical_focus: string | null;
  treatment_objective: string | null;
  workout_type: string | null;
  workout_frequency: number | null;
  workout_duration: number | null;
  workout_restrictions: string | null;
  zip_code: string | null;
  street: string | null;
  address_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  medico_responsavel_nome: string | null;
  meta_diaria_ml: number | null;
  patient_status: string | null;
  termos_versao_aceita: string | null;
  termos_aceito_em: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

async function fetchPacientes(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<PatientExportRow[]> {
  const params: unknown[] = [orgId];
  const patClause = buildPatientFilterClause("P.ID", pacienteId, params);
  const dateClause = pacienteId
    ? ""
    : buildTsRangeClause("P.CREATED_AT", periodo, params);

  return safeOracleQuery<PatientExportRow>(
    ds,
    `SELECT
       P.ID, P.RECORD_CODE, P.FULL_NAME, P.SOCIAL_NAME, P.CPF, P.RG,
       P.BIRTH_DATE, P.BIOLOGICAL_SEX, P.ESTADO_CIVIL, P.PROFISSAO,
       P.CONVENIO, P.PLANO_FAAZ, P.HEIGHT_CM,
       P.PHONE_WHATSAPP, P.TELEFONE_SECUNDARIO, P.EMAIL,
       P.CONTATO_EMERGENCIA_NOME, P.CONTATO_EMERGENCIA_TELEFONE,
       P.CLINICAL_FOCUS, P.TREATMENT_OBJECTIVE,
       P.WORKOUT_TYPE, P.WORKOUT_FREQUENCY, P.WORKOUT_DURATION, P.WORKOUT_RESTRICTIONS,
       P.ZIP_CODE, P.STREET, P.ADDRESS_NUMBER, P.COMPLEMENT, P.NEIGHBORHOOD, P.CITY, P.STATE,
       U.FULL_NAME AS MEDICO_RESPONSAVEL_NOME,
       P.META_DIARIA_ML, P.PATIENT_STATUS,
       P.TERMOS_VERSAO_ACEITA, P.TERMOS_ACEITO_EM,
       P.CREATED_AT, P.UPDATED_AT
     FROM PATIENTS P
     LEFT JOIN USERS U ON U.ID = P.PRIMARY_DOCTOR_ID AND U.ORGANIZATION_ID = P.ORGANIZATION_ID
     WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patClause}${dateClause}
     ORDER BY P.FULL_NAME ASC`,
    params,
  );
}

function buildPacientesCsv(rows: PatientExportRow[]): string {
  const cols: CsvColumn<PatientExportRow>[] = [
    { header: "ID_PACIENTE", value: (r) => r.id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.record_code },
    { header: "NOME_COMPLETO", value: (r) => r.full_name },
    { header: "NOME_SOCIAL", value: (r) => r.social_name },
    { header: "CPF", value: (r) => r.cpf },
    { header: "RG", value: (r) => r.rg },
    { header: "DATA_NASCIMENTO", value: (r) => formatDateOnlyBR(r.birth_date) },
    { header: "SEXO_BIOLOGICO", value: (r) => r.biological_sex },
    { header: "ESTADO_CIVIL", value: (r) => r.estado_civil },
    { header: "PROFISSAO", value: (r) => r.profissao },
    { header: "CONVENIO", value: (r) => r.convenio },
    { header: "PLANO_FAAZ", value: (r) => toBoolOracle(r.plano_faaz) },
    {
      header: "ALTURA_CM",
      value: (r) => (r.height_cm != null ? Number(r.height_cm) : ""),
    },
    { header: "WHATSAPP", value: (r) => r.phone_whatsapp },
    { header: "TELEFONE_SECUNDARIO", value: (r) => r.telefone_secundario },
    { header: "EMAIL", value: (r) => r.email },
    { header: "CONTATO_EMERGENCIA_NOME", value: (r) => r.contato_emergencia_nome },
    {
      header: "CONTATO_EMERGENCIA_TELEFONE",
      value: (r) => r.contato_emergencia_telefone,
    },
    { header: "MEDICO_RESPONSAVEL", value: (r) => r.medico_responsavel_nome },
    { header: "FOCO_CLINICO", value: (r) => r.clinical_focus },
    { header: "OBJETIVO_TRATAMENTO", value: (r) => r.treatment_objective },
    { header: "TREINO_TIPO", value: (r) => r.workout_type },
    { header: "TREINO_FREQUENCIA_SEMANAL", value: (r) => r.workout_frequency },
    { header: "TREINO_DURACAO_MIN", value: (r) => r.workout_duration },
    {
      header: "TREINO_RESTRICOES",
      value: (r) => safeClobString(r.workout_restrictions),
    },
    { header: "META_HIDRATACAO_ML", value: (r) => r.meta_diaria_ml },
    { header: "CEP", value: (r) => r.zip_code },
    { header: "LOGRADOURO", value: (r) => r.street },
    { header: "NUMERO", value: (r) => r.address_number },
    { header: "COMPLEMENTO", value: (r) => r.complement },
    { header: "BAIRRO", value: (r) => r.neighborhood },
    { header: "CIDADE", value: (r) => r.city },
    { header: "UF", value: (r) => r.state },
    { header: "STATUS", value: (r) => r.patient_status },
    { header: "TERMOS_VERSAO_ACEITA", value: (r) => r.termos_versao_aceita },
    {
      header: "TERMOS_ACEITO_EM",
      value: (r) => formatDateTimeFullBR(r.termos_aceito_em),
    },
    { header: "CADASTRADO_EM", value: (r) => formatDateTimeFullBR(r.created_at) },
    { header: "ATUALIZADO_EM", value: (r) => formatDateTimeFullBR(r.updated_at) },
  ];
  return buildCsv(cols, rows);
}

// ---------- Agendamentos ----------

interface AgendamentoExportRow {
  id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  medico_nome: string | null;
  especialidade: string | null;
  data_hora: Date | string;
  duracao_minutos: number | null;
  encaixe: number | boolean;
  tipo: string | null;
  status: string | null;
  observacao: string | null;
  created_at: Date | string;
}

async function fetchAgendamentos(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<AgendamentoExportRow[]> {
  const params: unknown[] = [orgId];
  const patClause = buildPatientFilterClause("A.PACIENTE_ID", pacienteId, params);
  const dateClause = buildTsRangeClause("A.DATA_HORA", periodo, params);

  return safeOracleQuery<AgendamentoExportRow>(
    ds,
    `SELECT
       A.ID,
       P.RECORD_CODE AS PACIENTE_CODIGO,
       P.FULL_NAME AS PACIENTE_NOME,
       P.CPF AS PACIENTE_CPF,
       COALESCE(M.NOME, U.FULL_NAME) AS MEDICO_NOME,
       A.ESPECIALIDADE,
       A.DATA_HORA,
       A.DURACAO_MINUTOS,
       A.ENCAIXE,
       A.TIPO,
       A.STATUS,
       A.OBSERVACAO,
       A.CREATED_AT
     FROM AGENDAMENTOS A
     INNER JOIN PATIENTS P ON P.ID = A.PACIENTE_ID
     LEFT JOIN MEDICOS M ON M.ID = A.MEDICO_ID
     LEFT JOIN USERS U ON U.ID = A.MEDICO_ID AND U.ORGANIZATION_ID = P.ORGANIZATION_ID
     WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patClause}${dateClause}
     ORDER BY A.DATA_HORA DESC`,
    params,
  );
}

function buildAgendamentosCsv(rows: AgendamentoExportRow[]): string {
  const cols: CsvColumn<AgendamentoExportRow>[] = [
    { header: "ID_AGENDAMENTO", value: (r) => r.id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    { header: "DATA_HORA", value: (r) => formatDateTimeFullBR(r.data_hora) },
    { header: "DURACAO_MINUTOS", value: (r) => r.duracao_minutos },
    { header: "MEDICO", value: (r) => r.medico_nome },
    { header: "ESPECIALIDADE", value: (r) => r.especialidade },
    { header: "TIPO", value: (r) => r.tipo },
    { header: "STATUS", value: (r) => r.status },
    { header: "ENCAIXE", value: (r) => toBoolOracle(r.encaixe) },
    { header: "OBSERVACAO", value: (r) => safeClobString(r.observacao) },
    { header: "CRIADO_EM", value: (r) => formatDateTimeFullBR(r.created_at) },
  ];
  return buildCsv(cols, rows);
}

// ---------- Prontuários & Evoluções ----------

interface ProntuarioUnifiedRow {
  tipo_registro: "FICHA_CLINICA" | "EVOLUCAO_CLINICA";
  id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  data_atendimento: Date | string;
  medico_responsavel: string | null;
  peso_kg: number | null;
  altura_cm: number | null;
  imc: number | null;
  objetivo: string | null;
  comorbidades: string | null;
  alergias: string | null;
  medicacoes: string | null;
  queixa_principal: string | null;
  conduta_evolucao: string | null;
  created_at: Date | string;
}

async function fetchProntuarios(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<ProntuarioUnifiedRow[]> {
  const paramsFicha: unknown[] = [orgId];
  const patFicha = buildPatientFilterClause("PR.PACIENTE_ID", pacienteId, paramsFicha);
  const dateFicha = buildTsRangeClause("PR.UPDATED_AT", periodo, paramsFicha);

  const paramsEvo: unknown[] = [orgId];
  const patEvo = buildPatientFilterClause("EV.PACIENTE_ID", pacienteId, paramsEvo);
  const dateEvo = buildTsRangeClause("EV.DATA_ATENDIMENTO", periodo, paramsEvo);

  const [fichas, evolucoes] = await Promise.all([
    safeOracleQuery<{
      id: string;
      paciente_codigo: string;
      paciente_nome: string;
      paciente_cpf: string | null;
      peso_atual_kg: number | string | null;
      altura_cm: number | string | null;
      imc: number | string | null;
      objetivo: string | null;
      comorbidades: string | null;
      alergias: string | null;
      medicacoes: string | null;
      evolucao: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      ds,
      `SELECT
         PR.ID,
         P.RECORD_CODE AS PACIENTE_CODIGO,
         P.FULL_NAME AS PACIENTE_NOME,
         P.CPF AS PACIENTE_CPF,
         PR.PESO_ATUAL_KG, PR.ALTURA_CM, PR.IMC,
         PR.OBJETIVO, PR.COMORBIDADES, PR.ALERGIAS, PR.MEDICACOES, PR.EVOLUCAO,
         PR.CREATED_AT, PR.UPDATED_AT
       FROM PRONTUARIOS_PACIENTES PR
       INNER JOIN PATIENTS P ON P.ID = PR.PACIENTE_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patFicha}${dateFicha}
       ORDER BY P.FULL_NAME ASC`,
      paramsFicha,
    ),
    safeOracleQuery<{
      id: string;
      paciente_codigo: string;
      paciente_nome: string;
      paciente_cpf: string | null;
      data_atendimento: Date | string;
      peso_atual: number | string | null;
      altura_cm: number | string | null;
      imc: number | string | null;
      queixa_principal: string | null;
      conduta_evolucao: string | null;
      medico_responsavel: string | null;
      created_at: Date | string;
    }>(
      ds,
      `SELECT
         EV.ID,
         P.RECORD_CODE AS PACIENTE_CODIGO,
         P.FULL_NAME AS PACIENTE_NOME,
         P.CPF AS PACIENTE_CPF,
         EV.DATA_ATENDIMENTO, EV.PESO_ATUAL, EV.ALTURA_CM, EV.IMC,
         EV.QUEIXA_PRINCIPAL, EV.CONDUTA_EVOLUCAO, EV.MEDICO_RESPONSAVEL,
         EV.CREATED_AT
       FROM EVOLUCOES_CLINICAS EV
       INNER JOIN PATIENTS P ON P.ID = EV.PACIENTE_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patEvo}${dateEvo}
       ORDER BY EV.DATA_ATENDIMENTO DESC`,
      paramsEvo,
    ),
  ]);

  return [
    ...fichas.map((f) => ({
      tipo_registro: "FICHA_CLINICA" as const,
      id: f.id,
      paciente_codigo: f.paciente_codigo,
      paciente_nome: f.paciente_nome,
      paciente_cpf: f.paciente_cpf,
      data_atendimento: f.updated_at || f.created_at,
      medico_responsavel: null,
      peso_kg: f.peso_atual_kg != null ? Number(f.peso_atual_kg) : null,
      altura_cm: f.altura_cm != null ? Number(f.altura_cm) : null,
      imc: f.imc != null ? Number(f.imc) : null,
      objetivo: f.objetivo ? safeClobString(f.objetivo) : null,
      comorbidades: f.comorbidades ? safeClobString(f.comorbidades) : null,
      alergias: f.alergias ? safeClobString(f.alergias) : null,
      medicacoes: f.medicacoes ? safeClobString(f.medicacoes) : null,
      queixa_principal: null,
      conduta_evolucao: f.evolucao ? safeClobString(f.evolucao) : null,
      created_at: f.created_at,
    })),
    ...evolucoes.map((e) => ({
      tipo_registro: "EVOLUCAO_CLINICA" as const,
      id: e.id,
      paciente_codigo: e.paciente_codigo,
      paciente_nome: e.paciente_nome,
      paciente_cpf: e.paciente_cpf,
      data_atendimento: e.data_atendimento,
      medico_responsavel: e.medico_responsavel,
      peso_kg: e.peso_atual != null ? Number(e.peso_atual) : null,
      altura_cm: e.altura_cm != null ? Number(e.altura_cm) : null,
      imc: e.imc != null ? Number(e.imc) : null,
      objetivo: null,
      comorbidades: null,
      alergias: null,
      medicacoes: null,
      queixa_principal: e.queixa_principal
        ? safeClobString(e.queixa_principal)
        : null,
      conduta_evolucao: e.conduta_evolucao
        ? safeClobString(e.conduta_evolucao)
        : null,
      created_at: e.created_at,
    })),
  ];
}

function buildProntuariosCsv(rows: ProntuarioUnifiedRow[]): string {
  const cols: CsvColumn<ProntuarioUnifiedRow>[] = [
    { header: "TIPO_REGISTRO", value: (r) => r.tipo_registro },
    { header: "ID_REGISTRO", value: (r) => r.id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    {
      header: "DATA_ATENDIMENTO",
      value: (r) => formatDateTimeFullBR(r.data_atendimento),
    },
    { header: "MEDICO_RESPONSAVEL", value: (r) => r.medico_responsavel },
    { header: "PESO_KG", value: (r) => r.peso_kg },
    { header: "ALTURA_CM", value: (r) => r.altura_cm },
    { header: "IMC", value: (r) => r.imc },
    { header: "OBJETIVO", value: (r) => r.objetivo },
    { header: "COMORBIDADES", value: (r) => r.comorbidades },
    { header: "ALERGIAS", value: (r) => r.alergias },
    { header: "MEDICACOES", value: (r) => r.medicacoes },
    { header: "QUEIXA_PRINCIPAL", value: (r) => r.queixa_principal },
    { header: "CONDUTA_EVOLUCAO", value: (r) => r.conduta_evolucao },
    { header: "CRIADO_EM", value: (r) => formatDateTimeFullBR(r.created_at) },
  ];
  return buildCsv(cols, rows);
}

// ---------- Exames Laboratoriais (Achatado Legível) ----------

interface ExameRawRow {
  id: string;
  paciente_id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  data_coleta: string | Date;
  laboratorio: string | null;
  valores: unknown;
  exames_personalizados: unknown;
  laudos_imagem: unknown;
  observacoes: string | null;
  created_at: Date | string;
}

export interface ExameFlattenedRow {
  lote_id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  data_coleta: string;
  laboratorio: string | null;
  categoria: string;
  tipo_item:
    | "LABORATORIAL"
    | "CALCULADO"
    | "PERSONALIZADO"
    | "LAUDO_IMAGEM"
    | "OBSERVACAO_LOTE";
  exame_codigo: string;
  exame_nome: string;
  valor: string | number;
  unidade: string;
  referencia: string;
  observacoes_lote: string | null;
}

async function fetchExames(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<{ lotes: ExameRawRow[]; linhas: ExameFlattenedRow[] }> {
  const params: unknown[] = [orgId, orgId];
  const patClause = buildPatientFilterClause("E.PACIENTE_ID", pacienteId, params);
  const dateClause = buildOracleDateRangeClause("E.DATA_COLETA", periodo, params);

  const lotes = await safeOracleQuery<ExameRawRow>(
    ds,
    `SELECT
       E.ID,
       E.PACIENTE_ID,
       P.RECORD_CODE AS PACIENTE_CODIGO,
       P.FULL_NAME AS PACIENTE_NOME,
       P.CPF AS PACIENTE_CPF,
       E.DATA_COLETA,
       E.LABORATORIO,
       E.VALORES,
       E.EXAMES_PERSONALIZADOS,
       E.LAUDOS_IMAGEM,
       E.OBSERVACOES,
       E.CREATED_AT
     FROM EXAMES_LABORATORIAIS E
     INNER JOIN PATIENTS P ON P.ID = E.PACIENTE_ID
     WHERE E.ORGANIZACAO_ID = :1 AND P.ORGANIZATION_ID = :2 AND P.DELETED_AT IS NULL${patClause}${dateClause}
     ORDER BY P.FULL_NAME ASC, E.DATA_COLETA DESC, E.CREATED_AT DESC`,
    params,
  );

  const linhas: ExameFlattenedRow[] = [];

  for (const lote of lotes) {
    const dataColetaBR = formatDateOnlyBR(lote.data_coleta);
    const obsLote = lote.observacoes ? safeClobString(lote.observacoes) : null;
    const valores = safeJsonParse<Record<string, number | string>>(
      lote.valores,
      {},
    );
    const personalizados = safeJsonParse<
      Array<{
        nome?: string;
        valor?: string | number;
        unidade?: string;
        referencia?: string;
      }>
    >(lote.exames_personalizados, []);
    const laudos = safeJsonParse<Record<string, string>>(lote.laudos_imagem, {});

    let countForLote = 0;

    if (valores && typeof valores === "object" && !Array.isArray(valores)) {
      for (const [key, rawVal] of Object.entries(valores)) {
        if (
          rawVal === null ||
          rawVal === undefined ||
          String(rawVal).trim() === ""
        ) {
          continue;
        }
        const def = EXAM_BY_KEY[key];
        const categoriaLabel = def
          ? EXAM_CATEGORY_MAP[def.category]?.label || def.category
          : "Laboratorial";
        let valorExibicao: string | number = rawVal;
        if (def?.type === "number") {
          const parsed = parseNumericExamValue(rawVal);
          if (parsed !== null) {
            valorExibicao = formatExamNumber(parsed, def.decimals);
          }
        }
        linhas.push({
          lote_id: lote.id,
          paciente_codigo: lote.paciente_codigo,
          paciente_nome: lote.paciente_nome,
          paciente_cpf: lote.paciente_cpf,
          data_coleta: dataColetaBR,
          laboratorio: lote.laboratorio,
          categoria: categoriaLabel,
          tipo_item: "LABORATORIAL",
          exame_codigo: key,
          exame_nome: def?.label || key,
          valor: valorExibicao,
          unidade: def?.unit || "",
          referencia: def?.refLabel || "",
          observacoes_lote: obsLote,
        });
        countForLote += 1;
      }

      const calcMap = computeCalculatedExams(valores);
      for (const [calcKey, calcVal] of Object.entries(calcMap)) {
        const def = EXAM_BY_KEY[calcKey];
        if (!def) continue;
        linhas.push({
          lote_id: lote.id,
          paciente_codigo: lote.paciente_codigo,
          paciente_nome: lote.paciente_nome,
          paciente_cpf: lote.paciente_cpf,
          data_coleta: dataColetaBR,
          laboratorio: lote.laboratorio,
          categoria: EXAM_CATEGORY_MAP[def.category]?.label || def.category,
          tipo_item: "CALCULADO",
          exame_codigo: calcKey,
          exame_nome: def.label,
          valor: formatExamNumber(calcVal, def.decimals),
          unidade: def.unit || "",
          referencia: def.refLabel || "",
          observacoes_lote: obsLote,
        });
        countForLote += 1;
      }
    }

    if (Array.isArray(personalizados)) {
      for (const item of personalizados) {
        if (
          !item ||
          !item.nome ||
          item.valor === undefined ||
          item.valor === null
        ) {
          continue;
        }
        linhas.push({
          lote_id: lote.id,
          paciente_codigo: lote.paciente_codigo,
          paciente_nome: lote.paciente_nome,
          paciente_cpf: lote.paciente_cpf,
          data_coleta: dataColetaBR,
          laboratorio: lote.laboratorio,
          categoria: "Exame Personalizado",
          tipo_item: "PERSONALIZADO",
          exame_codigo: "personalizado",
          exame_nome: safeClobString(item.nome),
          valor: item.valor,
          unidade: safeClobString(item.unidade),
          referencia: safeClobString(item.referencia),
          observacoes_lote: obsLote,
        });
        countForLote += 1;
      }
    }

    if (laudos && typeof laudos === "object" && !Array.isArray(laudos)) {
      for (const [key, texto] of Object.entries(laudos)) {
        const clean = safeClobString(texto).trim();
        if (!clean) continue;
        const laudoDef = LAUDO_BY_KEY[key];
        linhas.push({
          lote_id: lote.id,
          paciente_codigo: lote.paciente_codigo,
          paciente_nome: lote.paciente_nome,
          paciente_cpf: lote.paciente_cpf,
          data_coleta: dataColetaBR,
          laboratorio: lote.laboratorio,
          categoria: "Imagem & Laudos Complementares",
          tipo_item: "LAUDO_IMAGEM",
          exame_codigo: key,
          exame_nome: laudoDef?.label || key,
          valor: clean,
          unidade: "",
          referencia: "",
          observacoes_lote: obsLote,
        });
        countForLote += 1;
      }
    }

    if (countForLote === 0 && obsLote) {
      linhas.push({
        lote_id: lote.id,
        paciente_codigo: lote.paciente_codigo,
        paciente_nome: lote.paciente_nome,
        paciente_cpf: lote.paciente_cpf,
        data_coleta: dataColetaBR,
        laboratorio: lote.laboratorio,
        categoria: "Observações",
        tipo_item: "OBSERVACAO_LOTE",
        exame_codigo: "observacoes",
        exame_nome: "Observações do Lote",
        valor: obsLote,
        unidade: "",
        referencia: "",
        observacoes_lote: obsLote,
      });
    }
  }

  return { lotes, linhas };
}

function buildExamesCsv(rows: ExameFlattenedRow[]): string {
  const cols: CsvColumn<ExameFlattenedRow>[] = [
    { header: "LOTE_ID", value: (r) => r.lote_id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    { header: "DATA_COLETA", value: (r) => r.data_coleta },
    { header: "LABORATORIO", value: (r) => r.laboratorio },
    { header: "CATEGORIA", value: (r) => r.categoria },
    { header: "TIPO_ITEM", value: (r) => r.tipo_item },
    { header: "EXAME", value: (r) => r.exame_nome },
    { header: "RESULTADO_VALOR", value: (r) => r.valor },
    { header: "UNIDADE", value: (r) => r.unidade },
    { header: "VALOR_REFERENCIA", value: (r) => r.referencia },
    { header: "OBSERVACOES_LOTE", value: (r) => r.observacoes_lote },
  ];
  return buildCsv(cols, rows);
}

// ---------- Dietas / Planos Alimentares (sem string_agg — 100% Oracle-safe) ----------

interface DietaExportRow {
  plano_id: string;
  item_refeicao_id?: string | null;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  plano_titulo: string;
  plano_objetivo: string | null;
  plano_ativo: number | boolean;
  variacao_nome: string | null;
  refeicao_nome: string | null;
  refeicao_horario: string | null;
  refeicao_opcional: number | boolean | null;
  alimento_nome: string | null;
  quantidade: number | string | null;
  unidade: string | null;
  medida_caseira: string | null;
  observacao_item: string | null;
  substituicoes_prescritas: string | null;
  observacoes_refeicao: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

async function fetchDietas(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<DietaExportRow[]> {
  const params: unknown[] = [orgId];
  const patClause = buildPatientFilterClause("PA.PACIENTE_ID", pacienteId, params);
  const dateClause = buildTsRangeClause("PA.UPDATED_AT", periodo, params);

  const subParams: unknown[] = [orgId];
  const subPatClause = buildPatientFilterClause(
    "PA.PACIENTE_ID",
    pacienteId,
    subParams,
  );
  const subDateClause = buildTsRangeClause("PA.UPDATED_AT", periodo, subParams);

  const [rows, subRows] = await Promise.all([
    safeOracleQuery<DietaExportRow>(
      ds,
      `SELECT
         PA.ID AS PLANO_ID,
         IR.ID AS ITEM_REFEICAO_ID,
         P.RECORD_CODE AS PACIENTE_CODIGO,
         P.FULL_NAME AS PACIENTE_NOME,
         P.CPF AS PACIENTE_CPF,
         PA.TITULO AS PLANO_TITULO,
         PA.OBJETIVO AS PLANO_OBJETIVO,
         PA.ATIVO AS PLANO_ATIVO,
         VD.NOME AS VARIACAO_NOME,
         RF.NOME AS REFEICAO_NOME,
         RF.HORARIO AS REFEICAO_HORARIO,
         RF.OPCIONAL AS REFEICAO_OPCIONAL,
         AL.NOME AS ALIMENTO_NOME,
         IR.QUANTIDADE_GRAMAS AS QUANTIDADE,
         IR.UNIDADE AS UNIDADE,
         IR.MEDIDA_CASEIRA AS MEDIDA_CASEIRA,
         IR.OBSERVACAO AS OBSERVACAO_ITEM,
         RF.OBSERVACOES AS OBSERVACOES_REFEICAO,
         PA.CREATED_AT,
         PA.UPDATED_AT
       FROM PLANOS_ALIMENTARES PA
       INNER JOIN PATIENTS P ON P.ID = PA.PACIENTE_ID
       LEFT JOIN VARIACOES_DIETA VD ON VD.PLANO_ALIMENTAR_ID = PA.ID
       LEFT JOIN REFEICOES RF ON RF.VARIACAO_DIETA_ID = VD.ID
       LEFT JOIN ITENS_REFEICOES IR ON IR.REFEICAO_ID = RF.ID
       LEFT JOIN ALIMENTOS AL ON AL.ID = IR.ALIMENTO_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patClause}${dateClause}
       ORDER BY P.FULL_NAME ASC, PA.CREATED_AT DESC, VD.ORDEM ASC, RF.ORDEM ASC`,
      params,
    ),
    safeOracleQuery<{
      item_refeicao_id: string;
      nome_exibicao: string;
      quantidade: number | string;
      unidade: string;
      medida_caseira: string | null;
      ordem: number;
    }>(
      ds,
      `SELECT
         SUB.ITEM_REFEICAO_ID,
         SUB.NOME_EXIBICAO,
         SUB.QUANTIDADE,
         SUB.UNIDADE,
         SUB.MEDIDA_CASEIRA,
         SUB.ORDEM
       FROM SUBSTITUICOES_ITENS_REFEICAO SUB
       INNER JOIN ITENS_REFEICOES IR ON IR.ID = SUB.ITEM_REFEICAO_ID
       INNER JOIN REFEICOES RF ON RF.ID = IR.REFEICAO_ID
       INNER JOIN VARIACOES_DIETA VD ON VD.ID = RF.VARIACAO_DIETA_ID
       INNER JOIN PLANOS_ALIMENTARES PA ON PA.ID = VD.PLANO_ALIMENTAR_ID
       INNER JOIN PATIENTS P ON P.ID = PA.PACIENTE_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${subPatClause}${subDateClause}
       ORDER BY SUB.ITEM_REFEICAO_ID ASC, SUB.ORDEM ASC`,
      subParams,
    ),
  ]);

  const subsByItem = new Map<string, string[]>();
  for (const s of subRows) {
    const qtd = s.quantidade != null ? String(s.quantidade) : "";
    const medida = s.medida_caseira?.trim() ? ` - ${s.medida_caseira.trim()}` : "";
    const label = `${s.nome_exibicao} (${qtd} ${s.unidade}${medida})`;
    const list = subsByItem.get(s.item_refeicao_id);
    if (list) list.push(label);
    else subsByItem.set(s.item_refeicao_id, [label]);
  }

  return rows.map((r) => {
    const subs = r.item_refeicao_id ? subsByItem.get(r.item_refeicao_id) : undefined;
    return {
      ...r,
      observacoes_refeicao: r.observacoes_refeicao
        ? safeClobString(r.observacoes_refeicao)
        : null,
      substituicoes_prescritas: subs && subs.length > 0 ? subs.join(" | ") : null,
    };
  });
}

function buildDietasCsv(rows: DietaExportRow[]): string {
  const cols: CsvColumn<DietaExportRow>[] = [
    { header: "PLANO_ID", value: (r) => r.plano_id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    { header: "PLANO_TITULO", value: (r) => r.plano_titulo },
    { header: "OBJETIVO", value: (r) => r.plano_objetivo },
    { header: "PLANO_ATIVO", value: (r) => toBoolOracle(r.plano_ativo) },
    { header: "VARIACAO", value: (r) => r.variacao_nome },
    { header: "REFEICAO", value: (r) => r.refeicao_nome },
    { header: "HORARIO", value: (r) => r.refeicao_horario },
    {
      header: "REFEICAO_OPCIONAL",
      value: (r) =>
        r.refeicao_opcional === null || r.refeicao_opcional === undefined
          ? ""
          : toBoolOracle(r.refeicao_opcional),
    },
    { header: "ALIMENTO", value: (r) => r.alimento_nome },
    {
      header: "QUANTIDADE",
      value: (r) => (r.quantidade != null ? Number(r.quantidade) : ""),
    },
    { header: "UNIDADE", value: (r) => r.unidade },
    { header: "MEDIDA_CASEIRA", value: (r) => r.medida_caseira },
    { header: "OBSERVACAO_ITEM", value: (r) => r.observacao_item },
    {
      header: "SUBSTITUICOES_PRESCRITAS",
      value: (r) => r.substituicoes_prescritas,
    },
    { header: "OBSERVACOES_REFEICAO", value: (r) => r.observacoes_refeicao },
    { header: "CRIADO_EM", value: (r) => formatDateTimeFullBR(r.created_at) },
    { header: "ATUALIZADO_EM", value: (r) => formatDateTimeFullBR(r.updated_at) },
  ];
  return buildCsv(cols, rows);
}

// ---------- Glicemia & Insulina ----------

interface GlicemiaExportRow {
  tipo_registro: "GLICEMIA" | "INSULINA";
  id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  data_hora: Date | string;
  valor_mg_dl: number | null;
  momento: string | null;
  momento_clinico: string | null;
  contexto_tags: string | null;
  insulina_tipo: string | null;
  insulina_nome: string | null;
  insulina_unidades: number | null;
  observacao: string | null;
}

async function fetchGlicemia(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<GlicemiaExportRow[]> {
  const paramsGlic: unknown[] = [orgId];
  const patGlic = buildPatientFilterClause("G.PACIENTE_ID", pacienteId, paramsGlic);
  const dateGlic = buildTsRangeClause("G.DATA_REGISTRO", periodo, paramsGlic);

  const paramsIns: unknown[] = [orgId];
  const patIns = buildPatientFilterClause("INS.PACIENTE_ID", pacienteId, paramsIns);
  const dateIns = buildTsRangeClause("INS.APLICADO_EM", periodo, paramsIns);

  const [glicRows, insRows] = await Promise.all([
    safeOracleQuery<{
      id: string;
      paciente_codigo: string;
      paciente_nome: string;
      paciente_cpf: string | null;
      data_registro: Date | string;
      valor: number | string;
      momento: string | null;
      momento_clinico: string | null;
      contexto_tags: string | null;
    }>(
      ds,
      `SELECT
         G.ID,
         P.RECORD_CODE AS PACIENTE_CODIGO,
         P.FULL_NAME AS PACIENTE_NOME,
         P.CPF AS PACIENTE_CPF,
         G.DATA_REGISTRO, G.VALOR, G.MOMENTO, G.MOMENTO_CLINICO, G.CONTEXTO_TAGS
       FROM REGISTROS_GLICEMIA G
       INNER JOIN PATIENTS P ON P.ID = G.PACIENTE_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patGlic}${dateGlic}
       ORDER BY G.DATA_REGISTRO DESC`,
      paramsGlic,
    ),
    safeOracleQuery<{
      id: string;
      paciente_codigo: string;
      paciente_nome: string;
      paciente_cpf: string | null;
      aplicado_em: Date | string;
      tipo: string | null;
      nome_insulina: string | null;
      unidades: number | string;
      momento_clinico: string | null;
      observacao: string | null;
    }>(
      ds,
      `SELECT
         INS.ID,
         P.RECORD_CODE AS PACIENTE_CODIGO,
         P.FULL_NAME AS PACIENTE_NOME,
         P.CPF AS PACIENTE_CPF,
         INS.APLICADO_EM, INS.TIPO, INS.NOME_INSULINA, INS.UNIDADES,
         INS.MOMENTO_CLINICO, INS.OBSERVACAO
       FROM REGISTROS_INSULINA INS
       INNER JOIN PATIENTS P ON P.ID = INS.PACIENTE_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patIns}${dateIns}
       ORDER BY INS.APLICADO_EM DESC`,
      paramsIns,
    ),
  ]);

  const combined: GlicemiaExportRow[] = [
    ...glicRows.map((g) => ({
      tipo_registro: "GLICEMIA" as const,
      id: g.id,
      paciente_codigo: g.paciente_codigo,
      paciente_nome: g.paciente_nome,
      paciente_cpf: g.paciente_cpf,
      data_hora: g.data_registro,
      valor_mg_dl: g.valor != null ? Number(g.valor) : null,
      momento: g.momento,
      momento_clinico: g.momento_clinico,
      contexto_tags: g.contexto_tags,
      insulina_tipo: null,
      insulina_nome: null,
      insulina_unidades: null,
      observacao: null,
    })),
    ...insRows.map((i) => ({
      tipo_registro: "INSULINA" as const,
      id: i.id,
      paciente_codigo: i.paciente_codigo,
      paciente_nome: i.paciente_nome,
      paciente_cpf: i.paciente_cpf,
      data_hora: i.aplicado_em,
      valor_mg_dl: null,
      momento: null,
      momento_clinico: i.momento_clinico,
      contexto_tags: null,
      insulina_tipo: i.tipo,
      insulina_nome: i.nome_insulina,
      insulina_unidades: i.unidades != null ? Number(i.unidades) : null,
      observacao: i.observacao,
    })),
  ];

  combined.sort(
    (a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime(),
  );
  return combined;
}

function buildGlicemiaCsv(rows: GlicemiaExportRow[]): string {
  const cols: CsvColumn<GlicemiaExportRow>[] = [
    { header: "TIPO_REGISTRO", value: (r) => r.tipo_registro },
    { header: "ID_REGISTRO", value: (r) => r.id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    { header: "DATA_HORA", value: (r) => formatDateTimeFullBR(r.data_hora) },
    { header: "GLICEMIA_MG_DL", value: (r) => r.valor_mg_dl },
    { header: "MOMENTO", value: (r) => r.momento },
    { header: "MOMENTO_CLINICO", value: (r) => r.momento_clinico },
    { header: "TAGS_CONTEXTO", value: (r) => r.contexto_tags },
    { header: "INSULINA_TIPO", value: (r) => r.insulina_tipo },
    { header: "INSULINA_NOME", value: (r) => r.insulina_nome },
    { header: "INSULINA_UNIDADES", value: (r) => r.insulina_unidades },
    { header: "OBSERVACAO", value: (r) => r.observacao },
  ];
  return buildCsv(cols, rows);
}

// ---------- Avaliações & Antropometria ----------

interface AvaliacaoExportRow {
  origem_tabela: "ANTROPOMETRIA" | "BIOIMPEDANCIA";
  id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  data_afericao: Date | string;
  peso_kg: number | null;
  imc: number | null;
  percentual_gordura: number | null;
  massa_muscular_kg: number | null;
  cintura_cm: number | null;
  abdomen_cm: number | null;
  quadril_cm: number | null;
  braco_direito_cm: number | null;
  braco_esquerdo_cm: number | null;
  coxa_direita_cm: number | null;
  coxa_esquerda_cm: number | null;
  fonte: string | null;
  observacoes: string | null;
}

async function fetchAvaliacoes(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<AvaliacaoExportRow[]> {
  const paramsMeas: unknown[] = [orgId];
  const patMeas = buildPatientFilterClause("M.PATIENT_ID", pacienteId, paramsMeas);
  const dateMeas = buildTsRangeClause("M.MEASURED_AT", periodo, paramsMeas);

  const paramsBio: unknown[] = [orgId];
  const patBio = buildPatientFilterClause("B.PATIENT_ID", pacienteId, paramsBio);
  const dateBio = buildTsRangeClause("B.MEASURED_AT", periodo, paramsBio);

  const [measRows, bioRows] = await Promise.all([
    safeOracleQuery<{
      id: string;
      paciente_codigo: string;
      paciente_nome: string;
      paciente_cpf: string | null;
      measured_at: Date | string;
      body_fat_percentage: number | string | null;
      waist: number | string | null;
      abdomen: number | string | null;
      hips: number | string | null;
      right_arm: number | string | null;
      left_arm: number | string | null;
      right_thigh: number | string | null;
      left_thigh: number | string | null;
      notes: string | null;
      created_by: string | null;
    }>(
      ds,
      `SELECT
         M.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
         M.MEASURED_AT, M.BODY_FAT_PERCENTAGE, M.WAIST, M.ABDOMEN, M.HIPS,
         M.RIGHT_ARM, M.LEFT_ARM, M.RIGHT_THIGH, M.LEFT_THIGH, M.NOTES, M.CREATED_BY
       FROM MEASUREMENTS M
       INNER JOIN PATIENTS P ON P.ID = M.PATIENT_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patMeas}${dateMeas}
       ORDER BY M.MEASURED_AT DESC`,
      paramsMeas,
    ),
    safeOracleQuery<{
      id: string;
      paciente_codigo: string;
      paciente_nome: string;
      paciente_cpf: string | null;
      measured_at: Date | string;
      weight_kg: number | string | null;
      bmi: number | string | null;
      waist_circumference_cm: number | string | null;
      body_fat_percentage: number | string | null;
      skeletal_muscle_kg: number | string | null;
      source_type: string | null;
    }>(
      ds,
      `SELECT
         B.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
         B.MEASURED_AT, B.WEIGHT_KG, B.BMI, B.WAIST_CIRCUMFERENCE_CM,
         B.BODY_FAT_PERCENTAGE, B.SKELETAL_MUSCLE_KG, B.SOURCE_TYPE
       FROM BIOMETRIC_MEASUREMENTS B
       INNER JOIN PATIENTS P ON P.ID = B.PATIENT_ID
       WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL AND B.DELETED_AT IS NULL${patBio}${dateBio}
       ORDER BY B.MEASURED_AT DESC`,
      paramsBio,
    ),
  ]);

  const toNum = (v: number | string | null) => (v != null ? Number(v) : null);

  const combined: AvaliacaoExportRow[] = [
    ...measRows.map((m) => ({
      origem_tabela: "ANTROPOMETRIA" as const,
      id: m.id,
      paciente_codigo: m.paciente_codigo,
      paciente_nome: m.paciente_nome,
      paciente_cpf: m.paciente_cpf,
      data_afericao: m.measured_at,
      peso_kg: null,
      imc: null,
      percentual_gordura: toNum(m.body_fat_percentage),
      massa_muscular_kg: null,
      cintura_cm: toNum(m.waist),
      abdomen_cm: toNum(m.abdomen),
      quadril_cm: toNum(m.hips),
      braco_direito_cm: toNum(m.right_arm),
      braco_esquerdo_cm: toNum(m.left_arm),
      coxa_direita_cm: toNum(m.right_thigh),
      coxa_esquerda_cm: toNum(m.left_thigh),
      fonte: m.created_by || "CLINICAL_WEB_PANEL",
      observacoes: m.notes,
    })),
    ...bioRows.map((b) => ({
      origem_tabela: "BIOIMPEDANCIA" as const,
      id: b.id,
      paciente_codigo: b.paciente_codigo,
      paciente_nome: b.paciente_nome,
      paciente_cpf: b.paciente_cpf,
      data_afericao: b.measured_at,
      peso_kg: toNum(b.weight_kg),
      imc: toNum(b.bmi),
      percentual_gordura: toNum(b.body_fat_percentage),
      massa_muscular_kg: toNum(b.skeletal_muscle_kg),
      cintura_cm: toNum(b.waist_circumference_cm),
      abdomen_cm: null,
      quadril_cm: null,
      braco_direito_cm: null,
      braco_esquerdo_cm: null,
      coxa_direita_cm: null,
      coxa_esquerda_cm: null,
      fonte: b.source_type,
      observacoes: null,
    })),
  ];

  combined.sort(
    (a, b) =>
      new Date(b.data_afericao).getTime() - new Date(a.data_afericao).getTime(),
  );
  return combined;
}

function buildAvaliacoesCsv(rows: AvaliacaoExportRow[]): string {
  const cols: CsvColumn<AvaliacaoExportRow>[] = [
    { header: "TIPO_AVALIACAO", value: (r) => r.origem_tabela },
    { header: "ID_AVALIACAO", value: (r) => r.id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    {
      header: "DATA_AFERICAO",
      value: (r) => formatDateTimeFullBR(r.data_afericao),
    },
    { header: "PESO_KG", value: (r) => r.peso_kg },
    { header: "IMC", value: (r) => r.imc },
    { header: "PERCENTUAL_GORDURA", value: (r) => r.percentual_gordura },
    { header: "MASSA_MUSCULAR_KG", value: (r) => r.massa_muscular_kg },
    { header: "CINTURA_CM", value: (r) => r.cintura_cm },
    { header: "ABDOMEN_CM", value: (r) => r.abdomen_cm },
    { header: "QUADRIL_CM", value: (r) => r.quadril_cm },
    { header: "BRACO_DIREITO_CM", value: (r) => r.braco_direito_cm },
    { header: "BRACO_ESQUERDO_CM", value: (r) => r.braco_esquerdo_cm },
    { header: "COXA_DIREITA_CM", value: (r) => r.coxa_direita_cm },
    { header: "COXA_ESQUERDA_CM", value: (r) => r.coxa_esquerda_cm },
    { header: "ORIGEM", value: (r) => r.fonte },
    { header: "OBSERVACOES", value: (r) => r.observacoes },
  ];
  return buildCsv(cols, rows);
}

// ---------- Termômetro & Hábitos ----------

interface TermometroExportRow {
  modulo:
    | "HIDRATACAO"
    | "SONO"
    | "INTESTINO_BRISTOL"
    | "REFEICAO"
    | "TREINO"
    | "META";
  id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  data_hora: Date | string;
  indicador_valor: string | number | null;
  unidade_ou_status: string | null;
  detalhes: string | null;
}

async function fetchTermometro(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<TermometroExportRow[]> {
  const pHid: unknown[] = [orgId];
  const patHid = buildPatientFilterClause("H.PACIENTE_ID", pacienteId, pHid);
  const dateHid = buildTsRangeClause("H.DATA", periodo, pHid);

  const pSono: unknown[] = [orgId];
  const patSono = buildPatientFilterClause("S.PACIENTE_ID", pacienteId, pSono);
  const dateSono = buildTsRangeClause("S.DATA", periodo, pSono);

  const pInt: unknown[] = [orgId];
  const patInt = buildPatientFilterClause("I.PACIENTE_ID", pacienteId, pInt);
  const dateInt = buildTsRangeClause("I.DATA", periodo, pInt);

  const pRef: unknown[] = [orgId];
  const patRef = buildPatientFilterClause("CR.PACIENTE_ID", pacienteId, pRef);
  const dateRef = buildDateStrRangeClause("CR.DATA_DIA", periodo, pRef);

  const pTrn: unknown[] = [orgId];
  const patTrn = buildPatientFilterClause("W.PATIENT_ID", pacienteId, pTrn);
  const dateTrn = buildTsRangeClause("W.LOG_DATE", periodo, pTrn);

  const pGoal: unknown[] = [orgId];
  const patGoal = buildPatientFilterClause("GC.PATIENT_ID", pacienteId, pGoal);
  const dateGoal = buildOracleDateRangeClause("GC.REFERENCE_DATE", periodo, pGoal);

  let hidRows: Array<{
    id: string;
    paciente_codigo: string;
    paciente_nome: string;
    paciente_cpf: string | null;
    data: Date | string;
    volume_ml: number;
    meta_diaria_ml: number;
  }> = [];
  let sonoRows: Array<{
    id: string;
    paciente_codigo: string;
    paciente_nome: string;
    paciente_cpf: string | null;
    data: Date | string;
    horas: number;
    qualidade: string;
    observacao: string | null;
  }> = [];
  let intRows: Array<{
    id: string;
    paciente_codigo: string;
    paciente_nome: string;
    paciente_cpf: string | null;
    data: Date | string;
    tipo_bristol: number;
    categoria: string;
    sintomas: unknown;
  }> = [];
  let refRows: Array<{
    id: string;
    paciente_codigo: string;
    paciente_nome: string;
    paciente_cpf: string | null;
    data_dia: string;
    status: string;
    opcao_escolhida: string | null;
    refeicao_nome: string | null;
    criado_em: Date | string;
  }> = [];
  let trnRows: Array<{
    id: string;
    paciente_codigo: string;
    paciente_nome: string;
    paciente_cpf: string | null;
    log_date: Date | string;
  }> = [];
  let goalRows: Array<{
    id: string;
    paciente_codigo: string;
    paciente_nome: string;
    paciente_cpf: string | null;
    reference_date: string | Date;
    recorded_value: number | string;
    goal_title: string | null;
    goal_unit: string | null;
    origin: string | null;
  }> = [];

  await runWithConcurrency(
    [
      async () => {
        hidRows = await safeOracleQuery(
          ds,
          `SELECT H.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
                  H.DATA, H.VOLUME_ML, H.META_DIARIA_ML
             FROM CHECKINS_HIDRATACAO H
             INNER JOIN PATIENTS P ON P.ID = H.PACIENTE_ID
            WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patHid}${dateHid}
            ORDER BY H.DATA DESC`,
          pHid,
        );
      },
      async () => {
        sonoRows = await safeOracleQuery(
          ds,
          `SELECT S.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
                  S.DATA, S.HORAS, S.QUALIDADE, S.OBSERVACAO
             FROM CHECKINS_SONO S
             INNER JOIN PATIENTS P ON P.ID = S.PACIENTE_ID
            WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patSono}${dateSono}
            ORDER BY S.DATA DESC`,
          pSono,
        );
      },
      async () => {
        intRows = await safeOracleQuery(
          ds,
          `SELECT I.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
                  I.DATA, I.TIPO_BRISTOL, I.CATEGORIA, I.SINTOMAS
             FROM CHECKINS_INTESTINAIS I
             INNER JOIN PATIENTS P ON P.ID = I.PACIENTE_ID
            WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patInt}${dateInt}
            ORDER BY I.DATA DESC`,
          pInt,
        );
      },
      async () => {
        refRows = await safeOracleQuery(
          ds,
          `SELECT CR.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
                  CR.DATA_DIA, CR.STATUS, CR.OPCAO_ESCOLHIDA, RF.NOME AS REFEICAO_NOME, CR.CRIADO_EM
             FROM CHECKINS_REFEICOES CR
             INNER JOIN PATIENTS P ON P.ID = CR.PACIENTE_ID
             LEFT JOIN REFEICOES RF ON RF.ID = CR.REFEICAO_ID
            WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patRef}${dateRef}
            ORDER BY CR.DATA_DIA DESC, CR.CRIADO_EM DESC`,
          pRef,
        );
      },
      async () => {
        trnRows = await safeOracleQuery(
          ds,
          `SELECT W.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
                  W.LOG_DATE
             FROM WORKOUT_LOGS W
             INNER JOIN PATIENTS P ON P.ID = W.PATIENT_ID
            WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patTrn}${dateTrn}
            ORDER BY W.LOG_DATE DESC`,
          pTrn,
        );
      },
      async () => {
        goalRows = await safeOracleQuery(
          ds,
          `SELECT GC.ID, P.RECORD_CODE AS PACIENTE_CODIGO, P.FULL_NAME AS PACIENTE_NOME, P.CPF AS PACIENTE_CPF,
                  GC.REFERENCE_DATE, GC.RECORDED_VALUE, PG.TITLE AS GOAL_TITLE, PG.UNIT AS GOAL_UNIT, GC.ORIGIN
             FROM GOAL_CHECKINS GC
             INNER JOIN PATIENTS P ON P.ID = GC.PATIENT_ID
             LEFT JOIN PATIENT_GOALS PG ON PG.ID = GC.PATIENT_GOAL_ID
            WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL AND GC.DELETED_AT IS NULL${patGoal}${dateGoal}
            ORDER BY GC.REFERENCE_DATE DESC`,
          pGoal,
        );
      },
    ],
    2,
  );

  const rows: TermometroExportRow[] = [
    ...hidRows.map((h) => ({
      modulo: "HIDRATACAO" as const,
      id: h.id,
      paciente_codigo: h.paciente_codigo,
      paciente_nome: h.paciente_nome,
      paciente_cpf: h.paciente_cpf,
      data_hora: h.data,
      indicador_valor: Number(h.volume_ml),
      unidade_ou_status: "mL",
      detalhes: `Meta diária: ${h.meta_diaria_ml} mL`,
    })),
    ...sonoRows.map((s) => ({
      modulo: "SONO" as const,
      id: s.id,
      paciente_codigo: s.paciente_codigo,
      paciente_nome: s.paciente_nome,
      paciente_cpf: s.paciente_cpf,
      data_hora: s.data,
      indicador_valor: Number(s.horas),
      unidade_ou_status: `horas (${s.qualidade})`,
      detalhes: s.observacao ? safeClobString(s.observacao) : null,
    })),
    ...intRows.map((i) => {
      const sintomasArr = safeJsonParse<string[]>(i.sintomas, []);
      return {
        modulo: "INTESTINO_BRISTOL" as const,
        id: i.id,
        paciente_codigo: i.paciente_codigo,
        paciente_nome: i.paciente_nome,
        paciente_cpf: i.paciente_cpf,
        data_hora: i.data,
        indicador_valor: `Tipo ${i.tipo_bristol}`,
        unidade_ou_status: i.categoria,
        detalhes:
          Array.isArray(sintomasArr) && sintomasArr.length > 0
            ? sintomasArr.join(", ")
            : null,
      };
    }),
    ...refRows.map((r) => ({
      modulo: "REFEICAO" as const,
      id: r.id,
      paciente_codigo: r.paciente_codigo,
      paciente_nome: r.paciente_nome,
      paciente_cpf: r.paciente_cpf,
      data_hora: r.criado_em || r.data_dia,
      indicador_valor: r.status,
      unidade_ou_status: r.refeicao_nome || "Refeição",
      detalhes: r.opcao_escolhida ? `Opção: ${r.opcao_escolhida}` : null,
    })),
    ...trnRows.map((w) => ({
      modulo: "TREINO" as const,
      id: w.id,
      paciente_codigo: w.paciente_codigo,
      paciente_nome: w.paciente_nome,
      paciente_cpf: w.paciente_cpf,
      data_hora: w.log_date,
      indicador_valor: "TREINO CONCLUÍDO",
      unidade_ou_status: "Habit Tracker",
      detalhes: null,
    })),
    ...goalRows.map((g) => ({
      modulo: "META" as const,
      id: g.id,
      paciente_codigo: g.paciente_codigo,
      paciente_nome: g.paciente_nome,
      paciente_cpf: g.paciente_cpf,
      data_hora: g.reference_date,
      indicador_valor: Number(g.recorded_value),
      unidade_ou_status: g.goal_unit || "",
      detalhes: [g.goal_title, g.origin].filter(Boolean).join(" | ") || null,
    })),
  ];

  rows.sort(
    (a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime(),
  );
  return rows;
}

function buildTermometroCsv(rows: TermometroExportRow[]): string {
  const cols: CsvColumn<TermometroExportRow>[] = [
    { header: "MODULO", value: (r) => r.modulo },
    { header: "ID_REGISTRO", value: (r) => r.id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    { header: "DATA_HORA", value: (r) => formatDateTimeFullBR(r.data_hora) },
    { header: "VALOR_INDICADOR", value: (r) => r.indicador_valor },
    { header: "UNIDADE_STATUS", value: (r) => r.unidade_ou_status },
    { header: "DETALHES", value: (r) => r.detalhes },
  ];
  return buildCsv(cols, rows);
}

// ---------- Programas & Pacotes (Plano FAAZ) ----------

interface PacoteExportRow {
  pacote_id: string;
  paciente_codigo: string;
  paciente_nome: string;
  paciente_cpf: string | null;
  nome_plano: string;
  qtd_total_consultas: number;
  data_inicio: string;
  data_validade: string | null;
  status_pacote: string;
  observacoes_pacote: string | null;
  consulta_data: string | null;
  consulta_hora: string | null;
  consulta_tipo: string | null;
  consulta_status: string | null;
  profissional_nome: string | null;
  consulta_observacao: string | null;
}

async function fetchPacotes(
  ds: DataSource,
  orgId: string,
  periodo: PeriodoFiltroExportacao,
  pacienteId?: string,
): Promise<PacoteExportRow[]> {
  const params: unknown[] = [orgId];
  const patClause = buildPatientFilterClause("PK.PACIENTE_ID", pacienteId, params);
  const dateClause = buildDateStrRangeClause("PK.DATA_INICIO", periodo, params);

  return safeOracleQuery<PacoteExportRow>(
    ds,
    `SELECT
       PK.ID AS PACOTE_ID,
       P.RECORD_CODE AS PACIENTE_CODIGO,
       P.FULL_NAME AS PACIENTE_NOME,
       P.CPF AS PACIENTE_CPF,
       PK.NOME_PLANO, PK.QTD_TOTAL_CONSULTAS, PK.DATA_INICIO, PK.DATA_VALIDADE,
       PK.STATUS AS STATUS_PACOTE, PK.OBSERVACOES AS OBSERVACOES_PACOTE,
       CP.DATA_CONSULTA AS CONSULTA_DATA, CP.HORA_CONSULTA AS CONSULTA_HORA,
       CP.TIPO AS CONSULTA_TIPO, CP.STATUS AS CONSULTA_STATUS,
       CP.PROFISSIONAL_NOME, CP.OBSERVACAO AS CONSULTA_OBSERVACAO
     FROM PACOTES_ACOMPANHAMENTO PK
     INNER JOIN PATIENTS P ON P.ID = PK.PACIENTE_ID
     LEFT JOIN CONSULTAS_PACOTE CP ON CP.PACOTE_ID = PK.ID
     WHERE P.ORGANIZATION_ID = :1 AND P.DELETED_AT IS NULL${patClause}${dateClause}
     ORDER BY P.FULL_NAME ASC, PK.DATA_INICIO DESC, CP.DATA_CONSULTA DESC`,
    params,
  );
}

function buildPacotesCsv(rows: PacoteExportRow[]): string {
  const cols: CsvColumn<PacoteExportRow>[] = [
    { header: "PACOTE_ID", value: (r) => r.pacote_id },
    { header: "CODIGO_PRONTUARIO", value: (r) => r.paciente_codigo },
    { header: "PACIENTE", value: (r) => r.paciente_nome },
    { header: "CPF_PACIENTE", value: (r) => r.paciente_cpf },
    { header: "NOME_PLANO", value: (r) => r.nome_plano },
    { header: "QTD_TOTAL_CONSULTAS", value: (r) => r.qtd_total_consultas },
    { header: "DATA_INICIO", value: (r) => formatDateOnlyBR(r.data_inicio) },
    { header: "DATA_VALIDADE", value: (r) => formatDateOnlyBR(r.data_validade) },
    { header: "STATUS_PACOTE", value: (r) => r.status_pacote },
    { header: "OBSERVACOES_PACOTE", value: (r) => r.observacoes_pacote },
    { header: "CONSULTA_DATA", value: (r) => formatDateOnlyBR(r.consulta_data) },
    { header: "CONSULTA_HORA", value: (r) => r.consulta_hora },
    { header: "CONSULTA_TIPO", value: (r) => r.consulta_tipo },
    { header: "CONSULTA_STATUS", value: (r) => r.consulta_status },
    { header: "PROFISSIONAL", value: (r) => r.profissional_nome },
    { header: "CONSULTA_OBSERVACAO", value: (r) => r.consulta_observacao },
  ];
  return buildCsv(cols, rows);
}

// ============================================================================
// 8. GERADOR DE LEIA-ME.TXT E TRILHA DE AUDITORIA (ORACLE AUDIT_LOGS)
// ============================================================================

function gerarLeiaMeTxt(params: {
  tipo: "CLINICA" | "PACIENTE_LGPD";
  clinica: ContextoOrganizacaoExportacao;
  sessao: UserSessionPayload;
  periodo: PeriodoFiltroExportacao;
  contagensArquivos: Array<{
    arquivo: string;
    registros: number;
    observacao?: string;
  }>;
  pacienteInfo?: { nome: string; recordCode: string; cpf: string | null };
}): string {
  const agora = new Date();
  const dataHoraBR = `${formatarDataBR(agora)} às ${getHoraBR(agora, true)} (America/Sao_Paulo)`;
  const periodoTexto =
    params.periodo.dataInicio || params.periodo.dataFim
      ? `${params.periodo.dataInicio ? formatDateOnlyBR(params.periodo.dataInicio) : "Início"} até ${params.periodo.dataFim ? formatDateOnlyBR(params.periodo.dataFim) : "Hoje"}`
      : "Todo o histórico disponível";

  const linhas: string[] = [
    "============================================================================",
    params.tipo === "CLINICA"
      ? "CLÍNICA FAAZ — EXPORTAÇÃO COMPLETA DE DADOS DA CLÍNICA (PORTABILIDADE / LGPD)"
      : "CLÍNICA FAAZ — PORTABILIDADE INDIVIDUAL DO PACIENTE (LGPD — ART. 18, INCISO V)",
    "============================================================================",
    "",
    `Clínica:               ${params.clinica.clinicaNome}`,
    ...(params.clinica.razaoSocial &&
    params.clinica.razaoSocial !== params.clinica.clinicaNome
      ? [`Razão Social:          ${params.clinica.razaoSocial}`]
      : []),
    ...(params.clinica.cnpj ? [`CNPJ:                  ${params.clinica.cnpj}`] : []),
    ...(params.pacienteInfo
      ? [
          `Paciente:              ${params.pacienteInfo.nome}`,
          `Prontuário:            ${params.pacienteInfo.recordCode}`,
          ...(params.pacienteInfo.cpf
            ? [`CPF:                   ${params.pacienteInfo.cpf}`]
            : []),
        ]
      : []),
    `Data/Hora Exportação:  ${dataHoraBR}`,
    `Período Filtrado:      ${periodoTexto}`,
    `Usuário Responsável:   ${params.sessao.nome} (${params.sessao.cargo})${params.sessao.email ? ` — ${params.sessao.email}` : ""}`,
    "",
    "----------------------------------------------------------------------------",
    "ARQUIVOS INCLUÍDOS E CONTAGEM DE REGISTROS",
    "----------------------------------------------------------------------------",
    ...params.contagensArquivos.map(
      (item) =>
        `- ${item.arquivo.padEnd(32)} ${String(item.registros).padStart(6)} registro(s)${item.observacao ? `  [${item.observacao}]` : ""}`,
    ),
    "",
    "----------------------------------------------------------------------------",
    "COMPATIBILIDADE E SEGURANÇA DA INFORMAÇÃO (LGPD)",
    "----------------------------------------------------------------------------",
    "1. Todos os arquivos .CSV estão codificados em UTF-8 com BOM e utilizam",
    "   ponto e vírgula (;) como separador para abertura direta no Microsoft Excel",
    "   e LibreOffice Calc em português sem quebra de acentuação ou colunas.",
    "2. Proteção ativa contra CSV/Formula Injection: células textuais iniciadas",
    "   por '=', '+', '-', '@' ou caracteres de controle são neutralizadas.",
    "3. Credenciais de acesso, hashes de senha, tokens de sessão e segredos",
    "   internos são estritamente excluídos desta exportação.",
    "4. Esta operação foi registrada na trilha de auditoria da Clínica FAAZ.",
    "============================================================================",
    "",
  ];

  return UTF8_BOM + linhas.join(CSV_EOL);
}

export async function registrarAuditoriaExportacao(params: {
  organizationId: string;
  sessao: SessionWithOptionalRole;
  actionType: "CLINIC_DATA_EXPORT" | "PATIENT_LGPD_EXPORT";
  targetEntity: "ORGANIZATION" | "PATIENT";
  targetEntityId: string;
  patientId?: string | null;
  categorias: CategoriaExportacao[];
  periodo: PeriodoFiltroExportacao;
  contagens: Record<string, number>;
  nomeArquivo: string;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const metadata = {
    categorias: params.categorias,
    dataInicio: params.periodo.dataInicio,
    dataFim: params.periodo.dataFim,
    contagens: params.contagens,
    nomeArquivo: params.nomeArquivo,
    actorNome: params.sessao.nome,
    exportadoEm: new Date().toISOString(),
  };

  console.info("[AUDIT][EXPORTACAO_LGPD]", {
    actionType: params.actionType,
    organizationId: params.organizationId,
    actorUserId: params.sessao.userId,
    actorCargo: params.sessao.cargo,
    targetEntity: params.targetEntity,
    targetEntityId: params.targetEntityId,
    patientId: params.patientId ?? null,
    ...metadata,
  });

  try {
    const ds = await getDataSource();
    const auditId = crypto.randomUUID();
    const ipHash = params.clientIp
      ? crypto.createHash("sha256").update(params.clientIp).digest("hex")
      : null;
    const ua = (params.userAgent || "").slice(0, 255) || null;
    const actorUserId = params.sessao.userId || null;

    await ds.query(
      `INSERT INTO AUDIT_LOGS (
         ID, ORGANIZATION_ID, ACTOR_USER_ID, ACTOR_ROLE, ACTION_TYPE, CATEGORY,
         TARGET_ENTITY, TARGET_ENTITY_ID, PATIENT_ID, SEVERITY,
         METADATA_SANITIZED, IP_HASH, USER_AGENT, CREATED_BY, UPDATED_BY
       ) VALUES (
         :1, :2, :3, :4, :5, 'CLINICAL_ACCESS',
         :6, :7, :8, 'HIGH',
         :9, :10, :11, :12, :13
       )`,
      [
        auditId,
        params.organizationId,
        actorUserId,
        (params.sessao.cargo || params.sessao.role || "UNKNOWN").slice(0, 40),
        params.actionType,
        params.targetEntity,
        params.targetEntityId,
        params.patientId ?? null,
        JSON.stringify(metadata),
        ipHash,
        ua,
        actorUserId,
        actorUserId,
      ],
    );
  } catch (err) {
    console.warn(
      "[AUDIT][EXPORTACAO_LGPD] Falha ao gravar em AUDIT_LOGS (log estruturado já emitido):",
      err,
    );
  }
}

// ============================================================================
// 9. GERADOR DE ZIP — EXPORTAÇÃO COMPLETA DA CLÍNICA
// ============================================================================

export async function gerarPacoteExportacaoClinica(params: {
  clinica: ContextoOrganizacaoExportacao;
  sessao: UserSessionPayload;
  categorias: CategoriaExportacao[];
  periodo: PeriodoFiltroExportacao;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<{ buffer: Buffer; filename: string; contagens: Record<string, number> }> {
  const ds = await getDataSource();
  const zip = new JSZip();
  const contagensArquivos: Array<{
    arquivo: string;
    registros: number;
    observacao?: string;
  }> = [];
  const contagensResumo: Record<string, number> = {};

  const orgId = params.clinica.organizationId;

  for (const cat of params.categorias) {
    const meta = CATEGORIAS_EXPORTACAO_META.find((m) => m.id === cat);
    const arquivoCsv = meta?.arquivoCsv || `${cat}.csv`;

    switch (cat) {
      case "pacientes": {
        const rows = await fetchPacientes(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildPacientesCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
      case "agendamentos": {
        const rows = await fetchAgendamentos(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildAgendamentosCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
      case "prontuarios": {
        const rows = await fetchProntuarios(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildProntuariosCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
      case "exames": {
        const { lotes, linhas } = await fetchExames(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildExamesCsv(linhas));
        contagensArquivos.push({
          arquivo: arquivoCsv,
          registros: linhas.length,
          observacao: `${lotes.length} lote(s) achatado(s)`,
        });
        contagensResumo[cat] = lotes.length;
        break;
      }
      case "dietas": {
        const rows = await fetchDietas(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildDietasCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
      case "glicemia": {
        const rows = await fetchGlicemia(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildGlicemiaCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
      case "avaliacoes": {
        const rows = await fetchAvaliacoes(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildAvaliacoesCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
      case "termometro": {
        const rows = await fetchTermometro(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildTermometroCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
      case "pacotes": {
        const rows = await fetchPacotes(ds, orgId, params.periodo);
        zip.file(arquivoCsv, buildPacotesCsv(rows));
        contagensArquivos.push({ arquivo: arquivoCsv, registros: rows.length });
        contagensResumo[cat] = rows.length;
        break;
      }
    }
  }

  const leiaMe = gerarLeiaMeTxt({
    tipo: "CLINICA",
    clinica: params.clinica,
    sessao: params.sessao,
    periodo: params.periodo,
    contagensArquivos,
  });
  zip.file("LEIA-ME.txt", leiaMe);

  const hojeIso = getHojeBR();
  const filename = `Clinica_FAAZ_Exportacao_${hojeIso}.zip`;

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  await registrarAuditoriaExportacao({
    organizationId: orgId,
    sessao: params.sessao,
    actionType: "CLINIC_DATA_EXPORT",
    targetEntity: "ORGANIZATION",
    targetEntityId: orgId,
    categorias: params.categorias,
    periodo: params.periodo,
    contagens: contagensResumo,
    nomeArquivo: filename,
    clientIp: params.clientIp,
    userAgent: params.userAgent,
  });

  return { buffer, filename, contagens: contagensResumo };
}

// ============================================================================
// 10. GERADOR DE ZIP — PORTABILIDADE INDIVIDUAL DO PACIENTE (LGPD)
// ============================================================================

export async function gerarPacotePortabilidadePaciente(params: {
  clinica: ContextoOrganizacaoExportacao;
  sessao: UserSessionPayload;
  pacienteId: string;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<
  | { status: "not_found" }
  | { status: "forbidden_org" }
  | { status: "ok"; buffer: Buffer; filename: string }
> {
  const ds = await getDataSource();
  const orgId = params.clinica.organizationId;

  // Verifica existência e organização do paciente (anti-IDOR)
  const checkRows = await safeOracleQuery<{
    id: string;
    organization_id: string;
    full_name: string;
    record_code: string;
    cpf: string | null;
    deleted_at: Date | null;
  }>(
    ds,
    `SELECT ID, ORGANIZATION_ID, FULL_NAME, RECORD_CODE, CPF, DELETED_AT
       FROM PATIENTS
      WHERE ID = :1
      FETCH FIRST 1 ROWS ONLY`,
    [params.pacienteId],
  );

  const patCheck = checkRows[0];
  if (!patCheck || patCheck.deleted_at) {
    return { status: "not_found" };
  }
  if (patCheck.organization_id !== orgId) {
    return { status: "forbidden_org" };
  }

  const periodoVazio: PeriodoFiltroExportacao = {
    dataInicio: null,
    dataFim: null,
    inicioUtc: null,
    fimUtc: null,
  };

  let pacientesRows: PatientExportRow[] = [];
  let agendamentosRows: AgendamentoExportRow[] = [];
  let prontuariosRows: ProntuarioUnifiedRow[] = [];
  let examesData: { lotes: ExameRawRow[]; linhas: ExameFlattenedRow[] } = {
    lotes: [],
    linhas: [],
  };
  let dietasRows: DietaExportRow[] = [];
  let glicemiaRows: GlicemiaExportRow[] = [];
  let avaliacoesRows: AvaliacaoExportRow[] = [];
  let termometroRows: TermometroExportRow[] = [];
  let pacotesRows: PacoteExportRow[] = [];
  let protocoloGlicemicoRows: Array<Record<string, unknown>> = [];

  await runWithConcurrency(
    [
      async () => {
        pacientesRows = await fetchPacientes(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        agendamentosRows = await fetchAgendamentos(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        prontuariosRows = await fetchProntuarios(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        examesData = await fetchExames(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        dietasRows = await fetchDietas(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        glicemiaRows = await fetchGlicemia(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        avaliacoesRows = await fetchAvaliacoes(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        termometroRows = await fetchTermometro(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        pacotesRows = await fetchPacotes(
          ds,
          orgId,
          periodoVazio,
          params.pacienteId,
        );
      },
      async () => {
        protocoloGlicemicoRows = await safeOracleQuery<Record<string, unknown>>(
          ds,
          `SELECT ATIVO, USA_INSULINA, MODO, SLOTS_ATIVOS, ALVO_JEJUM_MIN, ALVO_JEJUM_MAX,
                  ALVO_POS_MAX, INSULINA_BASAL_NOME, INSULINA_BASAL_DOSE_REF,
                  INSULINA_BASAL_HORARIO, INSULINA_RAPIDA_NOME, ORIENTACAO_HIPO,
                  ORIENTACAO_HIPER, UPDATED_AT
             FROM PROTOCOLOS_GLICEMICOS
            WHERE PACIENTE_ID = :1
            FETCH FIRST 1 ROWS ONLY`,
          [params.pacienteId],
        );
      },
    ],
    2,
  );

  const zip = new JSZip();

  zip.file("pacientes.csv", buildPacientesCsv(pacientesRows));
  zip.file("agendamentos.csv", buildAgendamentosCsv(agendamentosRows));
  zip.file("prontuarios.csv", buildProntuariosCsv(prontuariosRows));
  zip.file("exames_laboratoriais.csv", buildExamesCsv(examesData.linhas));
  zip.file("dietas.csv", buildDietasCsv(dietasRows));
  zip.file("glicemia.csv", buildGlicemiaCsv(glicemiaRows));
  zip.file("avaliacoes_antropometria.csv", buildAvaliacoesCsv(avaliacoesRows));
  zip.file("termometro_habitos.csv", buildTermometroCsv(termometroRows));
  zip.file("pacotes_acompanhamento.csv", buildPacotesCsv(pacotesRows));

  const portabilidadeJson = stripSensitiveKeys({
    metadados: {
      sistema: "Clínica FAAZ — Prontuário Médico Digital",
      finalidade:
        "Portabilidade de Dados — LGPD (Lei nº 13.709/2018, Art. 18, V)",
      clinica: {
        nome: params.clinica.clinicaNome,
        razaoSocial: params.clinica.razaoSocial,
        cnpj: params.clinica.cnpj,
      },
      exportadoEm: new Date().toISOString(),
      responsavel: {
        nome: params.sessao.nome,
        cargo: params.sessao.cargo,
      },
    },
    paciente: pacientesRows[0] || null,
    agendamentos: agendamentosRows,
    prontuario: {
      fichasClinicas: prontuariosRows.filter(
        (r) => r.tipo_registro === "FICHA_CLINICA",
      ),
      evolucoesClinicas: prontuariosRows.filter(
        (r) => r.tipo_registro === "EVOLUCAO_CLINICA",
      ),
    },
    examesLaboratoriais: {
      totalLotes: examesData.lotes.length,
      resultadosDetalhados: examesData.linhas,
    },
    planosAlimentares: dietasRows,
    glicemiaEInsulina: {
      protocolo: protocoloGlicemicoRows[0] || null,
      registros: glicemiaRows,
    },
    avaliacoesAntropometria: avaliacoesRows,
    termometroHabitos: termometroRows,
    pacotesAcompanhamento: pacotesRows,
  });

  zip.file(
    "portabilidade_completa.json",
    JSON.stringify(portabilidadeJson, null, 2) + "\n",
  );

  const contagensArquivos = [
    { arquivo: "pacientes.csv", registros: pacientesRows.length },
    { arquivo: "agendamentos.csv", registros: agendamentosRows.length },
    { arquivo: "prontuarios.csv", registros: prontuariosRows.length },
    {
      arquivo: "exames_laboratoriais.csv",
      registros: examesData.linhas.length,
      observacao: `${examesData.lotes.length} lote(s) achatado(s)`,
    },
    { arquivo: "dietas.csv", registros: dietasRows.length },
    { arquivo: "glicemia.csv", registros: glicemiaRows.length },
    { arquivo: "avaliacoes_antropometria.csv", registros: avaliacoesRows.length },
    { arquivo: "termometro_habitos.csv", registros: termometroRows.length },
    { arquivo: "pacotes_acompanhamento.csv", registros: pacotesRows.length },
    {
      arquivo: "portabilidade_completa.json",
      registros: 1,
      observacao: "Formato estruturado interoperável (LGPD)",
    },
  ];

  zip.file(
    "LEIA-ME.txt",
    gerarLeiaMeTxt({
      tipo: "PACIENTE_LGPD",
      clinica: params.clinica,
      sessao: params.sessao,
      periodo: periodoVazio,
      contagensArquivos,
      pacienteInfo: {
        nome: patCheck.full_name,
        recordCode: patCheck.record_code,
        cpf: patCheck.cpf,
      },
    }),
  );

  const hojeIso = getHojeBR();
  const nomeSafe = sanitizarNomeArquivoPaciente(patCheck.full_name);
  const filename = `Clinica_FAAZ_LGPD_${nomeSafe}_${hojeIso}.zip`;

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  await registrarAuditoriaExportacao({
    organizationId: orgId,
    sessao: params.sessao,
    actionType: "PATIENT_LGPD_EXPORT",
    targetEntity: "PATIENT",
    targetEntityId: patCheck.id,
    patientId: patCheck.id,
    categorias: [...CATEGORIAS_EXPORTACAO],
    periodo: periodoVazio,
    contagens: {
      pacientes: pacientesRows.length,
      agendamentos: agendamentosRows.length,
      prontuarios: prontuariosRows.length,
      exames: examesData.lotes.length,
      dietas: dietasRows.length,
      glicemia: glicemiaRows.length,
      avaliacoes: avaliacoesRows.length,
      termometro: termometroRows.length,
      pacotes: pacotesRows.length,
    },
    nomeArquivo: filename,
    clientIp: params.clientIp,
    userAgent: params.userAgent,
  });

  return { status: "ok", buffer, filename };
}
