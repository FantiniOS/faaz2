// ============================================================================
// MOTOR OFICIAL DE IMPORTAÇÃO PADRÃO ICLINIC — CLÍNICA FAAZ (ORACLE ADB)
// ============================================================================
// • Aceita 1 arquivo .zip do iClinic OU 1 a 4 arquivos .csv individuais
// • Proteção contra Zip Bomb, path traversal, extensão inválida e limite 25 MB
// • Parser RFC-4180 completo (aspas, vírgulas/ponto-e-vírgula e quebras de linha)
// • Auto-detecção de encoding (UTF-8 / BOM / Windows-1252) e delimitador (, ou ;)
// • Sanitização clínica anti-XSS (converte tags de quebra em \n e remove todo HTML)
// • Simulação dry-run (/preview) + Execução transacional e idempotente (/executar)
// • Trilha de auditoria em AUDIT_LOGS + isolamento rigoroso por ORGANIZATION_ID
// ============================================================================

import crypto from "crypto";
import JSZip from "jszip";
import type { EntityManager } from "typeorm";
import { getDataSource, withTransaction } from "@/lib/db/data-source";
import { safeClobString } from "@/lib/db/oracle-utils";
import {
  AgendamentoEntity,
  EvolucaoClinicaEntity,
  PatientEntity,
  ProntuarioPacienteEntity,
  type BiologicalSex,
  type Patient,
  type PatientStatus,
} from "@/lib/db/entities";
import type { UserSessionPayload } from "@/lib/auth-rbac";
import { criarDataBR, formatarDataBR, formatarDataHoraBR } from "@/lib/date-br";
import {
  buscarUsuarioMedicoAtivo,
  garantirEspelhoMedicoAgenda,
  listarMedicosClinica,
  type MedicoResponsavelDTO,
} from "@/lib/medico-responsavel";
import {
  safeOracleQuery,
  type ContextoOrganizacaoExportacao,
} from "@/lib/exportacao-lgpd";
import {
  LIMITE_UPLOAD_ICLINIC_BYTES,
  type ArquivoIClinicDetectado,
  type ModoDuplicadosImportacao,
  type PhysicianIClinicResumo,
  type PreviewImportacaoIClinicResponse,
  type ResultadoImportacaoIClinicResponse,
  type TipoArquivoIClinic,
} from "@/lib/importacao-iclinic-types";

// ============================================================================
// 1. CONSTANTES DE SEGURANÇA CONTRA ZIP BOMB E LIMITES
// ============================================================================

const FAAZ_RECORD_PREFIX = "FAAZ-";
const MAX_ZIP_ENTRIES = 250;
const MAX_SINGLE_CSV_BYTES = 30 * 1024 * 1024; // 30 MB descomprimido por CSV
const MAX_TOTAL_UNCOMPRESSED_BYTES = 80 * 1024 * 1024; // 80 MB total descomprimido
const MAX_WARNINGS_RETURNED = 60;

export class ImportacaoValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ImportacaoValidationError";
    this.status = status;
  }
}

function normalizeOracleRows<T>(rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const out: Record<string, unknown> = {};
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        out[k.toLowerCase()] = v;
      }
    }
    return out;
  }) as unknown as T[];
}

// ============================================================================
// 2. EXTRAÇÃO SEGURA DE ARQUIVOS (.ZIP OU .CSV) + AUTO-DETECÇÃO DE ENCODING
// ============================================================================

export interface UploadedFileInput {
  name: string;
  size: number;
  buffer: Buffer;
}

interface ExtractedCsvFile {
  tipo: TipoArquivoIClinic;
  nomeOriginal: string;
  text: string;
  encoding: string;
  separador: "," | ";";
}

function getSafeBasename(rawName: string): string {
  const normalized = rawName.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return (parts[parts.length - 1] || "").trim();
}

function identificarTipoCsvPorNomeOuCabecalho(
  filename: string,
  headersLower: Set<string>,
): TipoArquivoIClinic | null {
  const base = getSafeBasename(filename).toLowerCase();
  if (base === "patient.csv" || base.endsWith("_patient.csv")) return "patient";
  if (base === "event_record.csv" || base.endsWith("_event_record.csv")) {
    return "event_record";
  }
  if (
    base === "event_scheduling.csv" ||
    base.endsWith("_event_scheduling.csv")
  ) {
    return "event_scheduling";
  }
  if (
    base === "event_attachment.csv" ||
    base.endsWith("_event_attachment.csv")
  ) {
    return "event_attachment";
  }

  // Fallback por assinatura real de colunas oficiais do iClinic
  if (
    headersLower.has("patient_code") &&
    headersLower.has("healthinsurance_pack")
  ) {
    return "patient";
  }
  if (
    headersLower.has("eventblock_name") &&
    headersLower.has("eventblock_text") &&
    headersLower.has("tab_name")
  ) {
    return "event_record";
  }
  if (
    headersLower.has("event_blocked_scheduling") &&
    headersLower.has("eventprocedure_pack")
  ) {
    return "event_scheduling";
  }
  if (headersLower.has("attachment_filename") && headersLower.has("title")) {
    return "event_attachment";
  }

  return null;
}

export function decodeCsvBuffer(buf: Buffer): { text: string; encoding: string } {
  if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    return {
      text: buf.subarray(3).toString("utf8"),
      encoding: "UTF-8 BOM",
    };
  }

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return {
      text: decoder.decode(buf),
      encoding: "UTF-8",
    };
  } catch {
    try {
      const winDecoder = new TextDecoder("windows-1252");
      return {
        text: winDecoder.decode(buf),
        encoding: "Windows-1252",
      };
    } catch {
      return {
        text: buf.toString("latin1"),
        encoding: "Latin-1",
      };
    }
  }
}

export function detectCsvDelimiter(text: string): "," | ";" {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes) {
      if (ch === "\n" || ch === "\r") break;
      if (ch === ",") commas += 1;
      else if (ch === ";") semicolons += 1;
    }
  }

  return semicolons > commas ? ";" : ",";
}

/**
 * Parser CSV RFC-4180 robusto: trata campos entre aspas com vírgulas,
 * ponto e vírgula, aspas escapadas ("") e quebras de linha em textos clínicos.
 */
export function parseCsvText(text: string, delimiter: "," | ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const clean = text.startsWith("\uFEFF") ? text.slice(1) : text;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      if (clean[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function rowsToRecords(matrix: string[][]): {
  headers: string[];
  records: Array<Record<string, string>>;
} {
  if (matrix.length === 0) return { headers: [], records: [] };
  const headers = matrix[0].map((h) => h.trim().toLowerCase());
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line.some((c) => c.trim() !== "")) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = line[c] ?? "";
    }
    records.push(obj);
  }

  return { headers, records };
}

async function extrairCsvsDeUploads(
  files: UploadedFileInput[],
): Promise<{
  arquivos: Map<TipoArquivoIClinic, ExtractedCsvFile>;
  avisos: string[];
}> {
  if (files.length === 0) {
    throw new ImportacaoValidationError(
      "Envie um arquivo .zip do iClinic ou de 1 a 4 arquivos .csv (patient.csv, event_record.csv, event_scheduling.csv, event_attachment.csv).",
    );
  }

  const totalUploadBytes = files.reduce((acc, f) => acc + f.buffer.byteLength, 0);
  if (totalUploadBytes > LIMITE_UPLOAD_ICLINIC_BYTES) {
    throw new ImportacaoValidationError(
      "O tamanho total do envio excede o limite de segurança de 25 MB.",
      413,
    );
  }

  const hasZip = files.some((f) => f.name.toLowerCase().endsWith(".zip"));
  if (hasZip && files.length > 1) {
    throw new ImportacaoValidationError(
      "Envie apenas 1 arquivo .zip por vez OU selecione individualmente os arquivos .csv.",
    );
  }

  if (!hasZip && files.length > 4) {
    throw new ImportacaoValidationError(
      "Selecione no máximo 4 arquivos .csv (patient.csv, event_record.csv, event_scheduling.csv e event_attachment.csv).",
    );
  }

  const arquivos = new Map<TipoArquivoIClinic, ExtractedCsvFile>();
  const avisos: string[] = [];

  const registerCsv = (nomeOriginal: string, buffer: Buffer) => {
    if (buffer.byteLength > MAX_SINGLE_CSV_BYTES) {
      throw new ImportacaoValidationError(
        `O arquivo "${nomeOriginal}" ultrapassa o limite descomprimido seguro de 30 MB.`,
        413,
      );
    }
    const { text, encoding } = decodeCsvBuffer(buffer);
    const separador = detectCsvDelimiter(text);
    const firstLineMatrix = parseCsvText(
      text.split(/\r?\n/, 2)[0] || "",
      separador,
    );
    const headersLower = new Set(
      (firstLineMatrix[0] || []).map((h) => h.trim().toLowerCase()),
    );
    const tipo = identificarTipoCsvPorNomeOuCabecalho(nomeOriginal, headersLower);
    if (!tipo) {
      avisos.push(
        `Arquivo ignorado (não corresponde a um CSV padrão do iClinic): ${getSafeBasename(nomeOriginal)}.`,
      );
      return;
    }
    arquivos.set(tipo, {
      tipo,
      nomeOriginal: getSafeBasename(nomeOriginal),
      text,
      encoding,
      separador,
    });
  };

  if (hasZip) {
    const zipFile = files[0];
    if (
      zipFile.buffer.byteLength < 4 ||
      zipFile.buffer[0] !== 0x50 ||
      zipFile.buffer[1] !== 0x4b
    ) {
      throw new ImportacaoValidationError(
        "O arquivo enviado não possui assinatura válida de pacote .zip.",
      );
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipFile.buffer);
    } catch {
      throw new ImportacaoValidationError(
        "Não foi possível abrir o pacote .zip. Verifique se o arquivo não está corrompido ou protegido por senha.",
      );
    }

    const entries = Object.values(zip.files);
    if (entries.length > MAX_ZIP_ENTRIES) {
      const csvEntries = entries.filter(
        (e) => !e.dir && e.name.toLowerCase().endsWith(".csv"),
      );
      if (entries.length > 5000 || csvEntries.length > 50) {
        throw new ImportacaoValidationError(
          "O pacote .zip excede o limite de segurança de arquivos permitidos (proteção anti-Zip Bomb).",
          400,
        );
      }
    }

    let totalUncompressed = 0;

    for (const entry of entries) {
      if (entry.dir) continue;
      if (
        entry.name.includes("..") ||
        entry.name.startsWith("/") ||
        entry.name.startsWith("\\")
      ) {
        continue;
      }
      const base = getSafeBasename(entry.name);
      if (!base || base.startsWith(".") || entry.name.includes("__MACOSX/")) {
        continue;
      }
      if (!base.toLowerCase().endsWith(".csv")) {
        continue;
      }

      const contentBuf = await entry.async("nodebuffer");
      totalUncompressed += contentBuf.byteLength;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new ImportacaoValidationError(
          "O conteúdo descomprimido do .zip excede o limite de segurança de 80 MB (proteção anti-Zip Bomb).",
          413,
        );
      }

      registerCsv(base, contentBuf);
    }
  } else {
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (!lower.endsWith(".csv")) {
        throw new ImportacaoValidationError(
          `Extensão não permitida em "${getSafeBasename(f.name)}". Envie apenas arquivos .csv ou .zip.`,
        );
      }
      registerCsv(f.name, f.buffer);
    }
  }

  if (arquivos.size === 0) {
    throw new ImportacaoValidationError(
      "Nenhum CSV padrão do iClinic foi reconhecido (esperado: patient.csv, event_record.csv, event_scheduling.csv ou event_attachment.csv).",
    );
  }

  return { arquivos, avisos };
}

// ============================================================================
// 3. NORMALIZADORES E SANITIZADOR ANTI-XSS CLÍNICO
// ============================================================================

export function normalizarChaveNome(nome: string | null | undefined): string {
  return (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function criarChavePaciente(
  nome: string | null | undefined,
  birthDateIso: string | null | undefined,
): string {
  const n = normalizarChaveNome(nome);
  const d = (birthDateIso || "").trim().slice(0, 10);
  return `${n}|${d}`;
}

export function normalizarDataIsoIClinic(
  raw: string | null | undefined,
): string | null {
  const clean = (raw || "").trim();
  if (!clean) return null;

  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return validarDataCalendario(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const brMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (brMatch) {
    return validarDataCalendario(
      Number(brMatch[3]),
      Number(brMatch[2]),
      Number(brMatch[1]),
    );
  }

  return null;
}

function validarDataCalendario(
  year: number,
  month: number,
  day: number,
): string | null {
  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizarHoraIClinic(
  raw: string | null | undefined,
): string | null {
  const clean = (raw || "").trim();
  if (!clean) return null;
  const m = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function calcularDuracaoMinutos(
  startTime: string | null,
  endTime: string | null,
): number {
  if (!startTime || !endTime) return 30;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  if (diff >= 5 && diff <= 480) return diff;
  return 30;
}

export function validarCpfDigitos(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += Number(digits[i]) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(digits[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += Number(digits[i]) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(digits[10]);
}

function normalizarSexoBiologico(
  raw: string | null | undefined,
): BiologicalSex | null {
  const norm = normalizarChaveNome(raw);
  if (!norm) return null;
  if (norm === "F" || norm.startsWith("FEM") || norm === "MULHER") return "FEMALE";
  if (norm === "M" || norm.startsWith("MASC") || norm === "HOMEM") return "MALE";
  return "OTHER";
}

function parseBoolIClinic(raw: string | null | undefined): boolean {
  const norm = (raw || "").trim().toLowerCase();
  return (
    norm === "true" ||
    norm === "1" ||
    norm === "t" ||
    norm === "yes" ||
    norm === "y" ||
    norm === "sim" ||
    norm === "s"
  );
}

function parseBoolDefaultTrue(raw: string | null | undefined): boolean {
  const norm = (raw || "").trim().toLowerCase();
  if (!norm) return true;
  if (
    norm === "false" ||
    norm === "0" ||
    norm === "f" ||
    norm === "no" ||
    norm === "n" ||
    norm === "nao" ||
    norm === "não"
  ) {
    return false;
  }
  return true;
}

function normalizarTelefone(raw: string | null | undefined): string | null {
  const clean = (raw || "").trim().replace(/\s+/g, " ");
  if (!clean) return null;
  return clean.slice(0, 30);
}

function extrairTextoDePack(raw: string | null | undefined): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed === "[]" || trimmed === "{}") return null;

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const candidates = [
      trimmed,
      trimmed
        .replace(/'/g, '"')
        .replace(/\bNone\b/g, "null")
        .replace(/\bTrue\b/g, "true")
        .replace(/\bFalse\b/g, "false"),
    ];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const labels = extrairNomesDeObjeto(parsed);
        if (labels.length > 0) {
          return labels.join(", ");
        }
      } catch {
        // tenta próximo formato
      }
    }
  }

  return trimmed;
}

function extrairNomesDeObjeto(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === "string") {
    const t = val.trim();
    return t ? [t] : [];
  }
  if (Array.isArray(val)) {
    const out: string[] = [];
    for (const item of val) {
      out.push(...extrairNomesDeObjeto(item));
    }
    return Array.from(new Set(out));
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const preferredKeys = [
      "name",
      "nome",
      "healthinsurance_name",
      "health_insurance",
      "convenio",
      "plan",
      "plan_name",
      "procedure",
      "procedure_name",
      "description",
      "title",
    ];
    for (const key of preferredKeys) {
      const found = obj[key];
      if (typeof found === "string" && found.trim()) {
        return [found.trim()];
      }
    }
    const fallbackStrings = Object.values(obj)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((s) => s.trim());
    return fallbackStrings.slice(0, 2);
  }
  return [];
}

const HTML_ENTITIES_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  aacute: "á",
  Aacute: "Á",
  agrave: "à",
  Agrave: "À",
  acirc: "â",
  Acirc: "Â",
  atilde: "ã",
  Atilde: "Ã",
  eacute: "é",
  Eacute: "É",
  ecirc: "ê",
  Ecirc: "Ê",
  iacute: "í",
  Iacute: "Í",
  oacute: "ó",
  Oacute: "Ó",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  uacute: "ú",
  Uacute: "Ú",
  uuml: "ü",
  Uuml: "Ü",
  ccedil: "ç",
  Ccedil: "Ç",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  ndash: "–",
  mdash: "—",
  bull: "•",
  hellip: "...",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
};

function decodificarEntidadesHtml(input: string): string {
  return input.replace(
    /&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g,
    (match, code: string) => {
      if (code in HTML_ENTITIES_MAP) {
        return HTML_ENTITIES_MAP[code];
      }
      if (code.startsWith("#x") || code.startsWith("#X")) {
        const cp = parseInt(code.slice(2), 16);
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
          return String.fromCodePoint(cp);
        }
      } else if (code.startsWith("#")) {
        const cp = parseInt(code.slice(1), 10);
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff) {
          return String.fromCodePoint(cp);
        }
      }
      return match;
    },
  );
}

/**
 * Sanitização clínica anti-XSS:
 * Converte quebras HTML (<br>, </p>, </div>, <li>) em quebras de linha legíveis,
 * decodifica entidades HTML e remove 100% das tags restantes (incluindo <script>/<style>).
 */
export function sanitizarTextoClinico(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).replace(/\0/g, "");

  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<li\b[^>]*>/gi, "\n• ");
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article)>/gi, "\n");
  s = s.replace(/<\/td>/gi, " | ");

  s = s.replace(/<[^>]+>/g, "");
  s = decodificarEntidadesHtml(s);

  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mapearStatusAgendamentoIClinic(
  raw: string | null | undefined,
): {
  status: "AGENDADO" | "CONFIRMADO" | "FINALIZADO" | "CANCELADO";
  notaExtra: string | null;
} {
  const norm = normalizarChaveNome(raw);
  if (!norm) return { status: "AGENDADO", notaExtra: null };

  if (
    norm.includes("ATENDID") ||
    norm.includes("ATTEND") ||
    norm.includes("FINALIZ") ||
    norm.includes("FINISH") ||
    norm.includes("REALIZ") ||
    norm.includes("COMPLET") ||
    norm === "DONE" ||
    norm === "CONCLUIDO"
  ) {
    return { status: "FINALIZADO", notaExtra: null };
  }

  if (
    norm.includes("FALTOU") ||
    norm.includes("FALTA") ||
    norm.includes("MISS") ||
    norm.includes("NO_SHOW") ||
    norm.includes("NOSHOW") ||
    norm.includes("ABSENT")
  ) {
    return { status: "CANCELADO", notaExtra: "[Faltou no iClinic]" };
  }

  if (norm.includes("CANCEL") || norm.includes("DESMARC")) {
    return { status: "CANCELADO", notaExtra: null };
  }

  if (
    norm.includes("CONFIRM") ||
    norm.includes("CHEGOU") ||
    norm.includes("ARRIV") ||
    norm.includes("CHECK")
  ) {
    return { status: "CONFIRMADO", notaExtra: null };
  }

  return { status: "AGENDADO", notaExtra: null };
}

function inferirTipoAgendamento(
  description: string | null,
  procedurePack: string | null,
): "PRIMEIRA_CONSULTA" | "RETORNO" | "EXAME" {
  const combined = normalizarChaveNome(
    `${description || ""} ${procedurePack || ""}`,
  );
  if (
    combined.includes("PRIMEIRA") ||
    combined.includes("1A CONSULTA") ||
    combined.includes("AVALIACAO INICIAL")
  ) {
    return "PRIMEIRA_CONSULTA";
  }
  if (
    combined.includes("EXAME") ||
    combined.includes("BIOIMPED") ||
    combined.includes("ULTRASSOM")
  ) {
    return "EXAME";
  }
  return "RETORNO";
}

// ============================================================================
// 4. ESTRUTURAS PARSEADAS INTERNAS
// ============================================================================

interface ParsedPatientIClinic {
  patientCode: string | null;
  fullName: string;
  birthDate: string | null;
  chave: string;
  biologicalSex: BiologicalSex | null;
  cpf: string | null;
  rg: string | null;
  phoneWhatsapp: string | null;
  telefoneSecundario: string | null;
  email: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  contatoEmergenciaNome: string | null;
  convenio: string;
  patientStatus: PatientStatus;
  observacaoClinica: string | null;
  tagPhysicianId: string | null;
}

interface ParsedConsultaAgrupada {
  chavePaciente: string;
  pacienteNome: string;
  pacienteBirthDate: string | null;
  physicianId: string;
  dateIso: string;
  startTime: string;
  endTime: string | null;
  blocos: Array<{ tabName: string; blockName: string; text: string }>;
  anexos: Array<{ title: string; description: string | null; filename: string }>;
  somenteAnexo: boolean;
}

interface ParsedAgendamentoIClinic {
  chavePaciente: string;
  pacienteNome: string;
  pacienteBirthDate: string | null;
  physicianId: string;
  dateIso: string;
  startTime: string;
  endTime: string | null;
  duracaoMinutos: number;
  statusOriginal: string;
  statusMapeado: "AGENDADO" | "CONFIRMADO" | "FINALIZADO" | "CANCELADO";
  tipo: "PRIMEIRA_CONSULTA" | "RETORNO" | "EXAME";
  convenio: string | null;
  observacao: string | null;
}

interface ParsedAnexoIClinic {
  chavePaciente: string;
  pacienteNome: string;
  pacienteBirthDate: string | null;
  physicianId: string;
  dateIso: string;
  startTime: string | null;
  title: string;
  description: string | null;
  filename: string;
}

interface ParsedIClinicBundle {
  arquivosDetectados: ArquivoIClinicDetectado[];
  pacientes: ParsedPatientIClinic[];
  consultasAgrupadas: ParsedConsultaAgrupada[];
  linhasProntuarioBrutas: number;
  agendamentos: ParsedAgendamentoIClinic[];
  bloqueiosIgnorados: number;
  anexos: ParsedAnexoIClinic[];
  physicians: PhysicianIClinicResumo[];
  avisos: string[];
}

// ============================================================================
// 5. PARSER COMPLETO DO PACOTE ICLINIC
// ============================================================================

export async function parsearPacoteIClinic(
  files: UploadedFileInput[],
): Promise<ParsedIClinicBundle> {
  const { arquivos, avisos } = await extrairCsvsDeUploads(files);
  const arquivosDetectados: ArquivoIClinicDetectado[] = [];

  const pacientes: ParsedPatientIClinic[] = [];
  const pacientesDedupCsv = new Set<string>();

  const physicianStats = new Map<
    string,
    { qtdProntuarios: number; qtdAgendamentos: number; qtdAnexos: number }
  >();
  const touchPhysician = (rawId: string | null | undefined) => {
    const id = (rawId || "").trim() || "SEM_ID";
    if (!physicianStats.has(id)) {
      physicianStats.set(id, {
        qtdProntuarios: 0,
        qtdAgendamentos: 0,
        qtdAnexos: 0,
      });
    }
    return id;
  };

  // --- 1) patient.csv ---
  const patientCsv = arquivos.get("patient");
  if (patientCsv) {
    const matrix = parseCsvText(patientCsv.text, patientCsv.separador);
    const { records } = rowsToRecords(matrix);
    arquivosDetectados.push({
      tipo: "patient",
      nomeOriginal: patientCsv.nomeOriginal,
      linhasLidas: records.length,
      separador: patientCsv.separador,
      encoding: patientCsv.encoding,
    });

    for (let idx = 0; idx < records.length; idx++) {
      const r = records[idx];
      const rawName = (r.name || "").trim();
      if (!rawName) {
        avisos.push(
          `patient.csv (linha ${idx + 2}): registro sem nome ignorado.`,
        );
        continue;
      }

      const fullName = rawName.toUpperCase().slice(0, 160);
      const birthDate = normalizarDataIsoIClinic(r.birth_date);
      if (r.birth_date && r.birth_date.trim() && !birthDate) {
        avisos.push(
          `patient.csv (linha ${idx + 2}): data de nascimento "${r.birth_date.trim()}" inválida para ${fullName}; importada em branco.`,
        );
      }

      let cpfValido: string | null = null;
      const rawCpfDigits = (r.cpf || "").replace(/\D/g, "");
      if (rawCpfDigits) {
        if (validarCpfDigitos(rawCpfDigits)) {
          cpfValido = rawCpfDigits;
        } else {
          avisos.push(
            `patient.csv (linha ${idx + 2}): CPF inválido para ${fullName} — campo CPF mantido vazio para preservar integridade.`,
          );
        }
      }

      const chave = criarChavePaciente(fullName, birthDate);
      const csvUniqueKey = cpfValido ? `cpf:${cpfValido}` : `key:${chave}`;
      if (pacientesDedupCsv.has(csvUniqueKey)) {
        avisos.push(
          `patient.csv (linha ${idx + 2}): duplicata interna no CSV para ${fullName} ignorada.`,
        );
        continue;
      }
      pacientesDedupCsv.add(csvUniqueKey);

      const mobile = normalizarTelefone(r.mobile_phone);
      const home = normalizarTelefone(r.home_phone);
      const office = normalizarTelefone(r.office_phone);
      const phoneWhatsapp = mobile || home || office || null;
      const telefoneSecundario = mobile
        ? home || office || null
        : home
          ? office || null
          : null;

      const rgRaw = [r.rg?.trim(), r.rg_issuer?.trim()]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
      const rg = rgRaw ? rgRaw.slice(0, 20) : null;

      const emailRaw = (r.email || r.email_secondary || "")
        .trim()
        .toLowerCase();
      const email =
        emailRaw && emailRaw.includes("@") ? emailRaw.slice(0, 160) : null;

      const cepDigits = (r.zip_code || "").replace(/\D/g, "");
      const zipCode = cepDigits ? cepDigits.slice(0, 10) : null;

      const street = (r.address || "").trim()
        ? r.address.trim().toUpperCase().slice(0, 200)
        : null;
      const number = (r.number || "").trim()
        ? r.number.trim().toUpperCase().slice(0, 30)
        : null;
      const complement = (r.complement || "").trim()
        ? r.complement.trim().toUpperCase().slice(0, 100)
        : null;
      const neighborhood = (r.neighborhood || "").trim()
        ? r.neighborhood.trim().toUpperCase().slice(0, 100)
        : null;
      const city = (r.city || "").trim()
        ? r.city.trim().toUpperCase().slice(0, 100)
        : null;
      const stateRaw = (r.state || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      const state = stateRaw.length === 2 ? stateRaw : null;

      const estadoCivil = (r.marital_status || "").trim()
        ? r.marital_status.trim().toUpperCase().slice(0, 30)
        : null;
      const profissao = (r.occupation || "").trim()
        ? r.occupation.trim().toUpperCase().slice(0, 100)
        : null;

      const responsavelRaw =
        (r.responsible || "").trim() ||
        (r.patientrelatedness_mother_names || "").trim() ||
        (r.patientrelatedness_father_names || "").trim();
      const contatoEmergenciaNome = responsavelRaw
        ? responsavelRaw.toUpperCase().slice(0, 160)
        : null;

      const convenioExtraido = extrairTextoDePack(r.healthinsurance_pack);
      const convenio = (convenioExtraido || "Particular").slice(0, 50);

      const died = parseBoolIClinic(r.died);
      const active = parseBoolDefaultTrue(r.active);
      const patientStatus: PatientStatus = died
        ? "ARCHIVED"
        : active
          ? "ACTIVE"
          : "INACTIVE";

      const obsParts: string[] = [];
      const obsClean = sanitizarTextoClinico(r.observation);
      if (obsClean) obsParts.push(obsClean);
      if (r.cns?.trim()) obsParts.push(`CNS: ${r.cns.trim()}`);
      if (r.indication?.trim()) {
        obsParts.push(
          `Indicação: ${r.indication.trim()}${r.indication_observation?.trim() ? ` (${r.indication_observation.trim()})` : ""}`,
        );
      }
      if (r.tag_names?.trim())
        obsParts.push(`Tags iClinic: ${r.tag_names.trim()}`);
      if (died && r.death_info?.trim())
        obsParts.push(`Óbito: ${r.death_info.trim()}`);

      const tagPhysicianId = (r.tag_physician_id || "").trim() || null;
      if (tagPhysicianId) {
        touchPhysician(tagPhysicianId);
      }

      pacientes.push({
        patientCode: (r.patient_code || "").trim() || null,
        fullName,
        birthDate,
        chave,
        biologicalSex: normalizarSexoBiologico(r.gender),
        cpf: cpfValido,
        rg,
        phoneWhatsapp,
        telefoneSecundario,
        email,
        zipCode,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        estadoCivil,
        profissao,
        contatoEmergenciaNome,
        convenio,
        patientStatus,
        observacaoClinica: obsParts.length > 0 ? obsParts.join("\n") : null,
        tagPhysicianId,
      });
    }
  }

  // --- 2) event_record.csv (agrupado por paciente + physician_id + date + start_time) ---
  const consultasMap = new Map<string, ParsedConsultaAgrupada>();
  let linhasProntuarioBrutas = 0;

  const recordCsv = arquivos.get("event_record");
  if (recordCsv) {
    const matrix = parseCsvText(recordCsv.text, recordCsv.separador);
    const { records } = rowsToRecords(matrix);
    linhasProntuarioBrutas = records.length;
    arquivosDetectados.push({
      tipo: "event_record",
      nomeOriginal: recordCsv.nomeOriginal,
      linhasLidas: records.length,
      separador: recordCsv.separador,
      encoding: recordCsv.encoding,
    });

    for (let idx = 0; idx < records.length; idx++) {
      const r = records[idx];
      const pacienteNome = (r.patient_name || "").trim().toUpperCase();
      if (!pacienteNome) {
        avisos.push(
          `event_record.csv (linha ${idx + 2}): registro sem patient_name ignorado.`,
        );
        continue;
      }

      const dateIso = normalizarDataIsoIClinic(r.date);
      if (!dateIso) {
        avisos.push(
          `event_record.csv (linha ${idx + 2}): data inválida "${r.date || ""}" para ${pacienteNome} ignorada.`,
        );
        continue;
      }

      const pacienteBirthDate = normalizarDataIsoIClinic(r.patient_birth_date);
      const chavePaciente = criarChavePaciente(pacienteNome, pacienteBirthDate);
      const physicianId = touchPhysician(r.physician_id);
      const startTime = normalizarHoraIClinic(r.start_time) || "08:00";
      const endTime = normalizarHoraIClinic(r.end_time);

      const textoLimpo = sanitizarTextoClinico(r.eventblock_text);
      const tabName = sanitizarTextoClinico(r.tab_name) || "Prontuário";
      const blockName = sanitizarTextoClinico(r.eventblock_name) || "Evolução";

      if (!textoLimpo) continue;

      const groupKey = `${chavePaciente}||${physicianId}||${dateIso}||${startTime}`;
      let grupo = consultasMap.get(groupKey);
      if (!grupo) {
        grupo = {
          chavePaciente,
          pacienteNome,
          pacienteBirthDate,
          physicianId,
          dateIso,
          startTime,
          endTime,
          blocos: [],
          anexos: [],
          somenteAnexo: false,
        };
        consultasMap.set(groupKey, grupo);
        physicianStats.get(physicianId)!.qtdProntuarios += 1;
      }

      grupo.blocos.push({ tabName, blockName, text: textoLimpo });
    }
  }

  // --- 3) event_attachment.csv ---
  const anexos: ParsedAnexoIClinic[] = [];
  const attachCsv = arquivos.get("event_attachment");
  if (attachCsv) {
    const matrix = parseCsvText(attachCsv.text, attachCsv.separador);
    const { records } = rowsToRecords(matrix);
    arquivosDetectados.push({
      tipo: "event_attachment",
      nomeOriginal: attachCsv.nomeOriginal,
      linhasLidas: records.length,
      separador: attachCsv.separador,
      encoding: attachCsv.encoding,
    });

    for (let idx = 0; idx < records.length; idx++) {
      const r = records[idx];
      const pacienteNome = (r.patient_name || "").trim().toUpperCase();
      if (!pacienteNome) {
        avisos.push(
          `event_attachment.csv (linha ${idx + 2}): registro sem patient_name ignorado.`,
        );
        continue;
      }

      const dateIso = normalizarDataIsoIClinic(r.date);
      if (!dateIso) {
        avisos.push(
          `event_attachment.csv (linha ${idx + 2}): data inválida "${r.date || ""}" ignorada.`,
        );
        continue;
      }

      const pacienteBirthDate = normalizarDataIsoIClinic(r.patient_birth_date);
      const chavePaciente = criarChavePaciente(pacienteNome, pacienteBirthDate);
      const physicianId = touchPhysician(r.physician_id);
      const startTime = normalizarHoraIClinic(r.start_time);
      const title = sanitizarTextoClinico(r.title) || "Documento sem título";
      const description = sanitizarTextoClinico(r.description) || null;
      const filename =
        getSafeBasename(r.attachment_filename || "") || "arquivo_nao_informado";

      physicianStats.get(physicianId)!.qtdAnexos += 1;

      anexos.push({
        chavePaciente,
        pacienteNome,
        pacienteBirthDate,
        physicianId,
        dateIso,
        startTime,
        title,
        description,
        filename,
      });

      const exactKey = `${chavePaciente}||${physicianId}||${dateIso}||${startTime || "08:00"}`;
      let targetGrupo = consultasMap.get(exactKey);
      if (!targetGrupo) {
        for (const g of consultasMap.values()) {
          if (g.chavePaciente === chavePaciente && g.dateIso === dateIso) {
            targetGrupo = g;
            break;
          }
        }
      }

      if (!targetGrupo) {
        const novoGrupo: ParsedConsultaAgrupada = {
          chavePaciente,
          pacienteNome,
          pacienteBirthDate,
          physicianId,
          dateIso,
          startTime: startTime || "08:00",
          endTime: null,
          blocos: [],
          anexos: [],
          somenteAnexo: true,
        };
        consultasMap.set(exactKey, novoGrupo);
        targetGrupo = novoGrupo;
      }

      targetGrupo.anexos.push({ title, description, filename });
    }
  }

  // --- 4) event_scheduling.csv ---
  const agendamentos: ParsedAgendamentoIClinic[] = [];
  let bloqueiosIgnorados = 0;

  const schedCsv = arquivos.get("event_scheduling");
  if (schedCsv) {
    const matrix = parseCsvText(schedCsv.text, schedCsv.separador);
    const { records } = rowsToRecords(matrix);
    arquivosDetectados.push({
      tipo: "event_scheduling",
      nomeOriginal: schedCsv.nomeOriginal,
      linhasLidas: records.length,
      separador: schedCsv.separador,
      encoding: schedCsv.encoding,
    });

    for (let idx = 0; idx < records.length; idx++) {
      const r = records[idx];
      const isBloqueio = parseBoolIClinic(r.event_blocked_scheduling);
      const pacienteNome = (r.patient_name || "").trim().toUpperCase();

      if (isBloqueio || !pacienteNome) {
        bloqueiosIgnorados += 1;
        continue;
      }

      const dateIso = normalizarDataIsoIClinic(r.date);
      if (!dateIso) {
        avisos.push(
          `event_scheduling.csv (linha ${idx + 2}): data inválida "${r.date || ""}" para ${pacienteNome} ignorada.`,
        );
        continue;
      }

      const pacienteBirthDate = normalizarDataIsoIClinic(r.patient_birth_date);
      const chavePaciente = criarChavePaciente(pacienteNome, pacienteBirthDate);
      const physicianId = touchPhysician(r.physician_id);
      const startTime = normalizarHoraIClinic(r.start_time) || "08:00";
      const endTime = normalizarHoraIClinic(r.end_time);
      const duracaoMinutos = calcularDuracaoMinutos(startTime, endTime);

      const statusOriginal = (r.status || "").trim() || "scheduled";
      const { status: statusMapeado, notaExtra } =
        mapearStatusAgendamentoIClinic(statusOriginal);

      const descClean = sanitizarTextoClinico(r.description);
      const cancelClean = sanitizarTextoClinico(r.cancel_reason);
      const procClean = extrairTextoDePack(r.eventprocedure_pack);
      const convenio = (r.healthinsurance_name || "").trim() || null;

      const obsParts: string[] = [];
      if (descClean) obsParts.push(descClean);
      if (procClean) obsParts.push(`Procedimento: ${procClean}`);
      if (convenio) obsParts.push(`Convênio: ${convenio}`);
      if (cancelClean) obsParts.push(`Motivo cancelamento: ${cancelClean}`);
      if (notaExtra) obsParts.push(notaExtra);

      physicianStats.get(physicianId)!.qtdAgendamentos += 1;

      agendamentos.push({
        chavePaciente,
        pacienteNome,
        pacienteBirthDate,
        physicianId,
        dateIso,
        startTime,
        endTime,
        duracaoMinutos,
        statusOriginal,
        statusMapeado,
        tipo: inferirTipoAgendamento(descClean, procClean),
        convenio,
        observacao: obsParts.length > 0 ? obsParts.join(" | ") : null,
      });
    }
  }

  const consultasAgrupadas = Array.from(consultasMap.values()).sort((a, b) =>
    `${b.dateIso} ${b.startTime}`.localeCompare(`${a.dateIso} ${a.startTime}`),
  );

  const physicians: PhysicianIClinicResumo[] = Array.from(
    physicianStats.entries(),
  )
    .map(([physicianId, st]) => ({
      physicianId,
      qtdProntuarios: st.qtdProntuarios,
      qtdAgendamentos: st.qtdAgendamentos,
      qtdAnexos: st.qtdAnexos,
      qtdTotal: st.qtdProntuarios + st.qtdAgendamentos + st.qtdAnexos,
    }))
    .sort((a, b) => b.qtdTotal - a.qtdTotal);

  if (anexos.length > 0) {
    avisos.push(
      `Foram detectadas ${anexos.length} referência(s) em event_attachment.csv. As notas serão registradas no prontuário; os arquivos físicos (PDF/imagens) podem ser migrados separadamente.`,
    );
  }

  return {
    arquivosDetectados,
    pacientes,
    consultasAgrupadas,
    linhasProntuarioBrutas,
    agendamentos,
    bloqueiosIgnorados,
    anexos,
    physicians,
    avisos,
  };
}

// ============================================================================
// 6. FORMATAÇÃO DA EVOLUÇÃO AGRUPADA
// ============================================================================

function formatarCondutaConsulta(consulta: ParsedConsultaAgrupada): {
  queixaPrincipal: string;
  condutaEvolucao: string;
} {
  const blocosTexto = consulta.blocos.map(
    (b) => `[${b.tabName} — ${b.blockName}]\n${b.text}`,
  );

  const anexosTexto = consulta.anexos.map((a) => {
    const descPart = a.description ? ` (${a.description})` : "";
    return `[Anexo importado do iClinic: ${a.title}${descPart} — arquivo: ${a.filename}]`;
  });

  const condutaEvolucao = [...blocosTexto, ...anexosTexto].join("\n\n").trim();

  if (consulta.somenteAnexo && blocosTexto.length === 0) {
    return {
      queixaPrincipal: "ANEXO IMPORTADO DO ICLINIC",
      condutaEvolucao: condutaEvolucao || "[Anexo importado do iClinic]",
    };
  }

  const blocoQueixa = consulta.blocos.find((b) =>
    /QUEIXA|MOTIVO|HMA|ANAMNESE/i.test(b.blockName),
  );
  const queixaRaw = blocoQueixa
    ? blocoQueixa.text.split("\n")[0].slice(0, 180)
    : `Atendimento importado do iClinic (${consulta.blocos[0]?.tabName || "Consulta"})`;

  return {
    queixaPrincipal: queixaRaw,
    condutaEvolucao: condutaEvolucao || "Atendimento importado do iClinic.",
  };
}

// ============================================================================
// 7. SIMULAÇÃO (DRY-RUN) — POST /api/clinica/importar/iclinic/preview
// ============================================================================

export async function simularImportacaoIClinic(params: {
  clinica: ContextoOrganizacaoExportacao;
  files: UploadedFileInput[];
}): Promise<PreviewImportacaoIClinicResponse> {
  const bundle = await parsearPacoteIClinic(params.files);
  const ds = await getDataSource();
  const orgId = params.clinica.organizationId;

  const [existentesRows, profissionaisClinica] = await Promise.all([
    safeOracleQuery<{
      id: string;
      full_name: string;
      birth_date: string | Date | null;
      cpf: string | null;
    }>(
      ds,
      `SELECT ID, FULL_NAME, BIRTH_DATE, CPF
         FROM PATIENTS
        WHERE ORGANIZATION_ID = :1 AND DELETED_AT IS NULL`,
      [orgId],
    ),
    listarMedicosClinica(orgId),
  ]);

  const existingByCpf = new Set<string>();
  const existingByKey = new Set<string>();
  const existingByNameOnly = new Set<string>();

  for (const row of existentesRows) {
    const cpfClean = (row.cpf || "").replace(/\D/g, "");
    if (cpfClean) existingByCpf.add(cpfClean);
    const bdIso =
      row.birth_date instanceof Date
        ? row.birth_date.toISOString().slice(0, 10)
        : normalizarDataIsoIClinic(String(row.birth_date || ""));
    existingByKey.add(criarChavePaciente(row.full_name, bdIso));
    existingByNameOnly.add(normalizarChaveNome(row.full_name));
  }

  const availableKeys = new Set<string>(existingByKey);
  const availableNames = new Set<string>(existingByNameOnly);

  let pacientesNovos = 0;
  let pacientesExistentes = 0;
  const previasPacientes: PreviewImportacaoIClinicResponse["previas"]["pacientes"] =
    [];

  for (const p of bundle.pacientes) {
    const jaExiste =
      (p.cpf && existingByCpf.has(p.cpf)) || existingByKey.has(p.chave);
    if (jaExiste) {
      pacientesExistentes += 1;
    } else {
      pacientesNovos += 1;
    }

    availableKeys.add(p.chave);
    availableNames.add(normalizarChaveNome(p.fullName));

    if (previasPacientes.length < 5) {
      previasPacientes.push({
        nome: p.fullName,
        dataNascimento: p.birthDate ? formatarDataBR(p.birthDate) : null,
        cpf: p.cpf,
        telefone: p.phoneWhatsapp,
        convenio: p.convenio,
        cidadeUf: [p.city, p.state].filter(Boolean).join("/") || null,
        statusMatch: jaExiste ? "EXISTENTE" : "NOVO",
      });
    }
  }

  const pacienteExisteNoContexto = (
    chave: string,
    nome: string,
    birthDate: string | null,
  ) => {
    if (availableKeys.has(chave)) return true;
    if (!birthDate && availableNames.has(normalizarChaveNome(nome))) return true;
    return false;
  };

  let semVinculoCount = 0;

  const previasProntuarios = bundle.consultasAgrupadas.slice(0, 5).map((c) => {
    const vinculado = pacienteExisteNoContexto(
      c.chavePaciente,
      c.pacienteNome,
      c.pacienteBirthDate,
    );
    const { condutaEvolucao } = formatarCondutaConsulta(c);
    return {
      pacienteNome: c.pacienteNome,
      dataAtendimento: `${formatarDataBR(c.dateIso)} ${c.startTime}`,
      physicianId: c.physicianId,
      qtdBlocos: c.blocos.length,
      qtdAnexos: c.anexos.length,
      resumoTexto:
        condutaEvolucao.length > 160
          ? `${condutaEvolucao.slice(0, 157)}...`
          : condutaEvolucao,
      pacienteVinculado: vinculado,
    };
  });

  for (const c of bundle.consultasAgrupadas) {
    if (
      !pacienteExisteNoContexto(
        c.chavePaciente,
        c.pacienteNome,
        c.pacienteBirthDate,
      )
    ) {
      semVinculoCount += 1;
    }
  }

  const previasAgendamentos = bundle.agendamentos.slice(0, 5).map((a) => {
    const vinculado = pacienteExisteNoContexto(
      a.chavePaciente,
      a.pacienteNome,
      a.pacienteBirthDate,
    );
    return {
      pacienteNome: a.pacienteNome,
      dataHora: `${formatarDataBR(a.dateIso)} ${a.startTime}`,
      physicianId: a.physicianId,
      statusOriginal: a.statusOriginal,
      statusMapeado: a.statusMapeado,
      convenio: a.convenio,
      pacienteVinculado: vinculado,
    };
  });

  for (const a of bundle.agendamentos) {
    if (
      !pacienteExisteNoContexto(
        a.chavePaciente,
        a.pacienteNome,
        a.pacienteBirthDate,
      )
    ) {
      semVinculoCount += 1;
    }
  }

  const previasAnexos = bundle.anexos.slice(0, 5).map((an) => ({
    pacienteNome: an.pacienteNome,
    data: `${formatarDataBR(an.dateIso)}${an.startTime ? ` ${an.startTime}` : ""}`,
    physicianId: an.physicianId,
    titulo: an.title,
    arquivo: an.filename,
    pacienteVinculado: pacienteExisteNoContexto(
      an.chavePaciente,
      an.pacienteNome,
      an.pacienteBirthDate,
    ),
  }));

  const avisos = [...bundle.avisos];
  if (semVinculoCount > 0) {
    avisos.push(
      `${semVinculoCount} registro(s) de prontuário/agenda referenciam paciente não localizado no patient.csv nem no cadastro atual da clínica e serão ignorados na importação.`,
    );
  }
  if (bundle.bloqueiosIgnorados > 0) {
    avisos.push(
      `${bundle.bloqueiosIgnorados} linha(s) de bloqueio de agenda sem paciente foram ignoradas automaticamente.`,
    );
  }

  return {
    sucesso: true,
    clinicaNome: params.clinica.clinicaNome,
    arquivosDetectados: bundle.arquivosDetectados,
    physiciansEncontrados: bundle.physicians,
    profissionaisClinica: profissionaisClinica.map((m) => ({
      id: m.id,
      nome: m.nome,
      especialidade: m.especialidadeNome || m.especialidade || null,
      crm: m.crm,
    })),
    contagens: {
      pacientesNovos,
      pacientesExistentes,
      pacientesTotalCsv: bundle.pacientes.length,
      consultasAgrupadas: bundle.consultasAgrupadas.length,
      linhasProntuarioBrutas: bundle.linhasProntuarioBrutas,
      agendamentosValidos: bundle.agendamentos.length,
      bloqueiosIgnorados: bundle.bloqueiosIgnorados,
      referenciasAnexos: bundle.anexos.length,
      avisosTotal: avisos.length,
    },
    previas: {
      pacientes: previasPacientes,
      prontuarios: previasProntuarios,
      agendamentos: previasAgendamentos,
      anexos: previasAnexos,
    },
    avisos: avisos.slice(0, MAX_WARNINGS_RETURNED),
  };
}

// ============================================================================
// 8. EXECUÇÃO TRANSACIONAL E IDEMPOTENTE — POST /api/clinica/importar/iclinic/executar
// ============================================================================

async function gerarRecordCodeUnico(
  manager: EntityManager,
  usedCodes: Set<string>,
  patientCodeIClinic: string | null,
  seqBase: number,
): Promise<string> {
  if (patientCodeIClinic) {
    const clean = patientCodeIClinic
      .replace(/[^a-zA-Z0-9-]/g, "")
      .slice(0, 20)
      .toUpperCase();
    if (clean) {
      const candidate = `${FAAZ_RECORD_PREFIX}IC-${clean}`.slice(0, 40);
      if (!usedCodes.has(candidate)) {
        const exists = await manager
          .getRepository(PatientEntity)
          .findOne({ where: { recordCode: candidate }, select: { id: true } });
        if (!exists) {
          usedCodes.add(candidate);
          return candidate;
        }
      }
    }
  }

  let seq = seqBase;
  for (let attempt = 0; attempt < 500; attempt++) {
    const candidate = `${FAAZ_RECORD_PREFIX}${String(seq).padStart(5, "0")}`;
    seq += 1;
    if (usedCodes.has(candidate)) continue;
    const exists = await manager
      .getRepository(PatientEntity)
      .findOne({ where: { recordCode: candidate }, select: { id: true } });
    if (!exists) {
      usedCodes.add(candidate);
      return candidate;
    }
  }

  const fallback = `${FAAZ_RECORD_PREFIX}IC-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  usedCodes.add(fallback);
  return fallback;
}

export async function executarImportacaoIClinic(params: {
  clinica: ContextoOrganizacaoExportacao;
  sessao: UserSessionPayload & { role?: string };
  files: UploadedFileInput[];
  mapeamentoMedicos: Record<string, string>;
  medicoPadraoId: string;
  modoDuplicados: ModoDuplicadosImportacao;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<ResultadoImportacaoIClinicResponse> {
  const orgId = params.clinica.organizationId;

  const medicoPadraoIdClean = (params.medicoPadraoId || "").trim();
  if (!medicoPadraoIdClean) {
    throw new ImportacaoValidationError(
      "Selecione um profissional padrão da clínica para o vínculo de prontuários e agendamentos.",
      400,
    );
  }

  const medicoPadrao = await buscarUsuarioMedicoAtivo(
    medicoPadraoIdClean,
    orgId,
  );
  if (!medicoPadrao) {
    throw new ImportacaoValidationError(
      "O profissional padrão informado não pertence à sua organização ou está inativo.",
      403,
    );
  }

  const medicosResolvidos = new Map<string, MedicoResponsavelDTO>();
  medicosResolvidos.set(medicoPadrao.id, medicoPadrao);

  const mapeamentoLimpo = new Map<string, MedicoResponsavelDTO>();
  for (const [iclinicPhysId, targetMedicoIdRaw] of Object.entries(
    params.mapeamentoMedicos || {},
  )) {
    const cleanKey = iclinicPhysId.trim();
    const targetId =
      typeof targetMedicoIdRaw === "string" ? targetMedicoIdRaw.trim() : "";
    if (!cleanKey || !targetId) continue;

    let doc = medicosResolvidos.get(targetId);
    if (!doc) {
      const found = await buscarUsuarioMedicoAtivo(targetId, orgId);
      if (!found) {
        throw new ImportacaoValidationError(
          `Profissional mapeado para o ID iClinic "${cleanKey}" não pertence à sua organização ou está inativo.`,
          403,
        );
      }
      medicosResolvidos.set(found.id, found);
      doc = found;
    }
    mapeamentoLimpo.set(cleanKey, doc);
  }

  const resolverMedico = (
    physicianId: string | null | undefined,
  ): MedicoResponsavelDTO => {
    const key = (physicianId || "").trim();
    if (key && mapeamentoLimpo.has(key)) {
      return mapeamentoLimpo.get(key)!;
    }
    return medicoPadrao;
  };

  const bundle = await parsearPacoteIClinic(params.files);
  const avisos = [...bundle.avisos];

  const totais = {
    pacientesCriados: 0,
    pacientesReaproveitados: 0,
    pacientesAtualizadosVazios: 0,
    consultasCriadas: 0,
    consultasIgnoradasDuplicadas: 0,
    agendamentosCriados: 0,
    agendamentosIgnoradosDuplicados: 0,
    bloqueiosIgnorados: bundle.bloqueiosIgnorados,
    anexosReferenciados: 0,
    registrosSemPacienteVinculado: 0,
  };

  // Execução transacional única no Oracle ADB
  await withTransaction(async (manager) => {
    const patientRepo = manager.getRepository(PatientEntity);
    const prontuarioRepo = manager.getRepository(ProntuarioPacienteEntity);
    const evolucaoRepo = manager.getRepository(EvolucaoClinicaEntity);
    const agendamentoRepo = manager.getRepository(AgendamentoEntity);

    // Garante espelhos na tabela MEDICOS para satisfazer FK_AGEND_MEDICO
    for (const doc of medicosResolvidos.values()) {
      await garantirEspelhoMedicoAgenda(doc, manager);
    }

    type ExistingPatientRow = {
      id: string;
      record_code: string;
      full_name: string;
      birth_date: string | Date | null;
      cpf: string | null;
      rg: string | null;
      biological_sex: BiologicalSex | null;
      estado_civil: string | null;
      profissao: string | null;
      convenio: string | null;
      phone_whatsapp: string | null;
      telefone_secundario: string | null;
      email: string | null;
      contato_emergencia_nome: string | null;
      zip_code: string | null;
      street: string | null;
      address_number: string | null;
      complement: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
      primary_doctor_id: string | null;
    };

    const existingPatients = normalizeOracleRows<ExistingPatientRow>(
      await manager.query(
        `SELECT ID, RECORD_CODE, FULL_NAME, BIRTH_DATE, CPF, RG, BIOLOGICAL_SEX,
                ESTADO_CIVIL, PROFISSAO, CONVENIO, PHONE_WHATSAPP, TELEFONE_SECUNDARIO,
                EMAIL, CONTATO_EMERGENCIA_NOME, ZIP_CODE, STREET, ADDRESS_NUMBER,
                COMPLEMENT, NEIGHBORHOOD, CITY, STATE, PRIMARY_DOCTOR_ID
           FROM PATIENTS
          WHERE ORGANIZATION_ID = :1 AND DELETED_AT IS NULL`,
        [orgId],
      ),
    );

    const byCpf = new Map<string, ExistingPatientRow>();
    const byKey = new Map<string, ExistingPatientRow>();
    const byNameOnly = new Map<string, string>();
    const usedRecordCodes = new Set<string>();

    for (const row of existingPatients) {
      usedRecordCodes.add(row.record_code);
      const cpfClean = (row.cpf || "").replace(/\D/g, "");
      if (cpfClean) byCpf.set(cpfClean, row);
      const bdIso =
        row.birth_date instanceof Date
          ? row.birth_date.toISOString().slice(0, 10)
          : normalizarDataIsoIClinic(String(row.birth_date || ""));
      byKey.set(criarChavePaciente(row.full_name, bdIso), row);
      byNameOnly.set(normalizarChaveNome(row.full_name), row.id);
    }

    let seqCounter = existingPatients.length + 1;

    // --- 3A. Pacientes ---
    for (const p of bundle.pacientes) {
      const existing =
        (p.cpf ? byCpf.get(p.cpf) : undefined) || byKey.get(p.chave);

      if (existing) {
        if (params.modoDuplicados === "atualizar_vazios") {
          const patch: Partial<
            Pick<
              Patient,
              | "cpf"
              | "rg"
              | "birthDate"
              | "biologicalSex"
              | "estadoCivil"
              | "profissao"
              | "convenio"
              | "phoneWhatsapp"
              | "telefoneSecundario"
              | "email"
              | "contatoEmergenciaNome"
              | "zipCode"
              | "street"
              | "number"
              | "complement"
              | "neighborhood"
              | "city"
              | "state"
              | "primaryDoctorId"
              | "updatedBy"
            >
          > = {};
          if (!existing.cpf && p.cpf && !byCpf.has(p.cpf)) patch.cpf = p.cpf;
          if (!existing.rg && p.rg) patch.rg = p.rg;
          if (!existing.birth_date && p.birthDate) patch.birthDate = p.birthDate;
          if (!existing.biological_sex && p.biologicalSex)
            patch.biologicalSex = p.biologicalSex;
          if (!existing.estado_civil && p.estadoCivil)
            patch.estadoCivil = p.estadoCivil;
          if (!existing.profissao && p.profissao) patch.profissao = p.profissao;
          if (
            (!existing.convenio || existing.convenio === "Particular") &&
            p.convenio !== "Particular"
          ) {
            patch.convenio = p.convenio;
          }
          if (!existing.phone_whatsapp && p.phoneWhatsapp)
            patch.phoneWhatsapp = p.phoneWhatsapp;
          if (!existing.telefone_secundario && p.telefoneSecundario) {
            patch.telefoneSecundario = p.telefoneSecundario;
          }
          if (!existing.email && p.email) patch.email = p.email;
          if (!existing.contato_emergencia_nome && p.contatoEmergenciaNome) {
            patch.contatoEmergenciaNome = p.contatoEmergenciaNome;
          }
          if (!existing.zip_code && p.zipCode) patch.zipCode = p.zipCode;
          if (!existing.street && p.street) patch.street = p.street;
          if (!existing.address_number && p.number) patch.number = p.number;
          if (!existing.complement && p.complement)
            patch.complement = p.complement;
          if (!existing.neighborhood && p.neighborhood)
            patch.neighborhood = p.neighborhood;
          if (!existing.city && p.city) patch.city = p.city;
          if (!existing.state && p.state) patch.state = p.state;
          if (!existing.primary_doctor_id) {
            patch.primaryDoctorId = resolverMedico(p.tagPhysicianId).id;
          }

          if (Object.keys(patch).length > 0) {
            await patientRepo.update(
              { id: existing.id },
              { ...patch, updatedBy: params.sessao.userId || null },
            );
            if (patch.cpf) byCpf.set(patch.cpf, { ...existing, cpf: patch.cpf });
            totais.pacientesAtualizadosVazios += 1;
          } else {
            totais.pacientesReaproveitados += 1;
          }
        } else {
          totais.pacientesReaproveitados += 1;
        }
        byKey.set(p.chave, existing);
        byNameOnly.set(normalizarChaveNome(p.fullName), existing.id);
        continue;
      }

      const recordCode = await gerarRecordCodeUnico(
        manager,
        usedRecordCodes,
        p.patientCode,
        seqCounter,
      );
      seqCounter += 1;

      const primaryDoc = resolverMedico(p.tagPhysicianId);

      const created = await patientRepo.save(
        patientRepo.create({
          organizationId: orgId,
          recordCode,
          fullName: p.fullName,
          cpf: p.cpf,
          rg: p.rg,
          birthDate: p.birthDate,
          biologicalSex: p.biologicalSex,
          estadoCivil: p.estadoCivil,
          profissao: p.profissao,
          convenio: p.convenio,
          planoFaaz: false,
          phoneWhatsapp: p.phoneWhatsapp || "",
          telefoneSecundario: p.telefoneSecundario,
          email: p.email,
          contatoEmergenciaNome: p.contatoEmergenciaNome,
          zipCode: p.zipCode,
          street: p.street,
          number: p.number,
          complement: p.complement,
          neighborhood: p.neighborhood,
          city: p.city,
          state: p.state,
          primaryDoctorId: primaryDoc.id,
          metaDiariaMl: 2500,
          patientStatus: p.patientStatus,
          activeModules: [],
          createdBy: params.sessao.userId || null,
          updatedBy: params.sessao.userId || null,
        }),
      );

      if (p.observacaoClinica) {
        await prontuarioRepo.save(
          prontuarioRepo.create({
            pacienteId: created.id,
            evolucao: `[Observação cadastral importada do iClinic]\n${p.observacaoClinica}`,
          }),
        );
      }

      const indexedRow: ExistingPatientRow = {
        id: created.id,
        record_code: recordCode,
        full_name: p.fullName,
        birth_date: p.birthDate,
        cpf: p.cpf,
        rg: p.rg,
        biological_sex: p.biologicalSex,
        estado_civil: p.estadoCivil,
        profissao: p.profissao,
        convenio: p.convenio,
        phone_whatsapp: p.phoneWhatsapp,
        telefone_secundario: p.telefoneSecundario,
        email: p.email,
        contato_emergencia_nome: p.contatoEmergenciaNome,
        zip_code: p.zipCode,
        street: p.street,
        address_number: p.number,
        complement: p.complement,
        neighborhood: p.neighborhood,
        city: p.city,
        state: p.state,
        primary_doctor_id: primaryDoc.id,
      };
      if (p.cpf) byCpf.set(p.cpf, indexedRow);
      byKey.set(p.chave, indexedRow);
      byNameOnly.set(normalizarChaveNome(p.fullName), created.id);
      totais.pacientesCriados += 1;
    }

    const resolverPacienteId = (
      chave: string,
      nome: string,
      birthDate: string | null,
    ): string | null => {
      const exact = byKey.get(chave);
      if (exact) return exact.id;
      if (!birthDate) {
        return byNameOnly.get(normalizarChaveNome(nome)) || null;
      }
      return null;
    };

    // --- 3B. Consultas agrupadas de prontuário (+ referências de anexos) ---
    for (const c of bundle.consultasAgrupadas) {
      const pacienteId = resolverPacienteId(
        c.chavePaciente,
        c.pacienteNome,
        c.pacienteBirthDate,
      );
      if (!pacienteId) {
        totais.registrosSemPacienteVinculado += 1;
        continue;
      }

      const medico = resolverMedico(c.physicianId);
      const dataAtendimento = criarDataBR(c.dateIso, c.startTime);
      const { queixaPrincipal, condutaEvolucao } = formatarCondutaConsulta(c);

      // Deduplicação idempotente Oracle-safe (sem comparação direta de CLOB no WHERE):
      // busca evoluções na janela de +-60s e compara o CLOB em TypeScript.
      const winStart = new Date(dataAtendimento.getTime() - 60_000);
      const winEnd = new Date(dataAtendimento.getTime() + 60_000);

      const dupCandidates = normalizeOracleRows<{
        id: string;
        conduta_evolucao: unknown;
      }>(
        await manager.query(
          `SELECT ID, CONDUTA_EVOLUCAO
             FROM EVOLUCOES_CLINICAS
            WHERE PACIENTE_ID = :1
              AND DATA_ATENDIMENTO >= :2
              AND DATA_ATENDIMENTO <= :3`,
          [pacienteId, winStart, winEnd],
        ),
      );

      const condutaNorm = condutaEvolucao.trim();
      const isDuplicate = dupCandidates.some(
        (row) => safeClobString(row.conduta_evolucao).trim() === condutaNorm,
      );

      if (isDuplicate) {
        totais.consultasIgnoradasDuplicadas += 1;
        continue;
      }

      await evolucaoRepo.save(
        evolucaoRepo.create({
          pacienteId,
          dataAtendimento,
          queixaPrincipal,
          condutaEvolucao,
          medicoResponsavel: medico.nome.slice(0, 160),
        }),
      );

      totais.consultasCriadas += 1;
      totais.anexosReferenciados += c.anexos.length;
    }

    // --- 3C. Agendamentos ---
    for (const a of bundle.agendamentos) {
      const pacienteId = resolverPacienteId(
        a.chavePaciente,
        a.pacienteNome,
        a.pacienteBirthDate,
      );
      if (!pacienteId) {
        totais.registrosSemPacienteVinculado += 1;
        continue;
      }

      const medico = resolverMedico(a.physicianId);
      const dataHora = criarDataBR(a.dateIso, a.startTime);

      const winStart = new Date(dataHora.getTime() - 60_000);
      const winEnd = new Date(dataHora.getTime() + 60_000);

      const dupAgend = normalizeOracleRows<{ id: string }>(
        await manager.query(
          `SELECT ID
             FROM AGENDAMENTOS
            WHERE PACIENTE_ID = :1
              AND MEDICO_ID = :2
              AND DATA_HORA >= :3
              AND DATA_HORA <= :4
            FETCH FIRST 1 ROWS ONLY`,
          [pacienteId, medico.id, winStart, winEnd],
        ),
      );

      if (dupAgend.length > 0) {
        totais.agendamentosIgnoradosDuplicados += 1;
        continue;
      }

      await agendamentoRepo.save(
        agendamentoRepo.create({
          pacienteId,
          medicoId: medico.id,
          especialidade: (medico.especialidadeCodigo || "ENDOCRINOLOGIA").slice(
            0,
            40,
          ),
          especialidadeId: medico.especialidadeId || null,
          dataHora,
          duracaoMinutos: a.duracaoMinutos,
          encaixe: false,
          tipo: a.tipo,
          status: a.statusMapeado,
          observacao: a.observacao,
        }),
      );

      totais.agendamentosCriados += 1;
    }
  });

  // 4. Registro na trilha de auditoria (AUDIT_LOGS no Oracle + log estruturado)
  const arquivosProcessados = bundle.arquivosDetectados.map(
    (a) => a.nomeOriginal,
  );
  const auditMetadata = {
    origem: "ICLINIC",
    modoDuplicados: params.modoDuplicados,
    arquivosProcessados,
    totais,
    avisosCount: avisos.length,
    actorNome: params.sessao.nome,
    importadoEm: new Date().toISOString(),
  };

  console.info("[AUDIT][IMPORTACAO_ICLINIC]", {
    organizationId: orgId,
    actorUserId: params.sessao.userId,
    actorCargo: params.sessao.cargo,
    ...auditMetadata,
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
         :1, :2, :3, :4, 'ICLINIC_DATA_IMPORT', 'MEDICAL_RECORD',
         'ORGANIZATION', :5, NULL, 'HIGH',
         :6, :7, :8, :9, :10
       )`,
      [
        auditId,
        orgId,
        actorUserId,
        (params.sessao.cargo || params.sessao.role || "DONO_CLINICA").slice(
          0,
          40,
        ),
        orgId,
        JSON.stringify(auditMetadata),
        ipHash,
        ua,
        actorUserId,
        actorUserId,
      ],
    );
  } catch (err) {
    console.warn("[AUDIT][IMPORTACAO_ICLINIC] Falha ao gravar em AUDIT_LOGS:", err);
  }

  return {
    sucesso: true,
    clinicaNome: params.clinica.clinicaNome,
    modoDuplicados: params.modoDuplicados,
    arquivosProcessados,
    totais,
    avisos: avisos.slice(0, MAX_WARNINGS_RETURNED),
    concluidoEm: formatarDataHoraBR(new Date(), true),
  };
}

// ============================================================================
// 9. GERADOR DE PACOTE DE EXEMPLO — GET /api/clinica/importar/iclinic/modelo
// ============================================================================

function quoteCsv(v: string): string {
  if (/[,"\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function makeCsv(headers: string[], rows: string[][]): string {
  return (
    "\uFEFF" +
    [headers.join(","), ...rows.map((r) => r.map(quoteCsv).join(","))].join(
      "\r\n",
    ) +
    "\r\n"
  );
}

/**
 * Gera em memória um arquivo `modelo_teste_iclinic.zip` com os cabeçalhos exatos
 * do iClinic e 2 pacientes fictícios completos para validação do importador.
 */
export async function gerarPacoteModeloIClinic(): Promise<Buffer> {
  const zip = new JSZip();

  const patientHeaders = [
    "patient_code", "name", "birth_date", "gender", "cpf", "rg", "rg_issuer",
    "mobile_phone", "home_phone", "office_phone", "email", "email_secondary",
    "birth_place", "birth_state", "zip_code", "address", "number", "complement",
    "neighborhood", "city", "state", "country", "picture_filename", "ethnicity",
    "marital_status", "religion", "occupation", "education", "responsible",
    "sms", "cns", "died", "death_info", "nationality", "indication",
    "indication_observation", "active", "receive_email", "observation",
    "healthinsurance_pack", "patientrelatedness_mother_names",
    "patientrelatedness_father_names", "tag_names", "tag_physician_id",
  ];

  const patientRows = [
    [
      "IC-9001", "Beatriz Almeida Teste", "14/05/1988", "F", "39053344705", "MG-1234567", "SSP-MG",
      "(31) 99111-2233", "", "", "beatriz.teste@exemplo.com.br", "",
      "Belo Horizonte", "MG", "30130-010", "Av. Afonso Pena", "1500", "Apto 402",
      "Centro", "Belo Horizonte", "MG", "Brasil", "", "",
      "Casada", "", "Arquiteta", "Superior Completo", "",
      "true", "", "false", "", "Brasileira", "Indicação",
      "Acompanhamento metabólico", "true", "true", "Paciente fictícia de teste do importador padrão iClinic.",
      '[{"name":"Unimed BH"}]', "Helena Almeida", "Carlos Almeida", "Endocrinologia", "101",
    ],
    [
      "IC-9002", "Eduardo Nogueira Teste", "1979-11-22", "M", "52998224725", "MG-7654321", "SSP-MG",
      "(31) 99222-3344", "(31) 3222-1100", "", "eduardo.teste@exemplo.com.br", "",
      "Nova Lima", "MG", "34000-000", "Rua das Flores", "85", "Casa",
      "Vila da Serra", "Nova Lima", "MG", "Brasil", "", "",
      "Solteiro", "", "Engenheiro Civil", "Pós-graduação", "",
      "true", "", "false", "", "Brasileira", "Indicação médica",
      "", "true", "true", "Paciente fictício de teste com retorno programado.",
      "Particular", "Sônia Nogueira", "Marcos Nogueira", "Nutrologia", "102",
    ],
  ];

  const recordHeaders = [
    "patient_birth_date", "patient_name", "physician_id", "date", "start_time",
    "end_time", "tab_name", "eventblock_name", "eventblock_text",
  ];
  const recordRows = [
    [
      "1988-05-14", "Beatriz Almeida Teste", "101", "2026-10-15", "09:00", "09:40",
      "Anamnese", "Queixa Principal",
      "<p>Fadiga vespertina e dificuldade para perda ponderal nos &uacute;ltimos 6 meses.</p><script>alert('xss')</script>",
    ],
    [
      "1988-05-14", "Beatriz Almeida Teste", "101", "2026-10-15", "09:00", "09:40",
      "Conduta", "Plano Terapêutico",
      "<p>Solicitados exames metab&oacute;licos completos:<br/><ul><li>Glicemia de jejum &amp; HbA1c</li><li>TSH e T4 Livre</li><li>Vitamina D e Ferritina</li></ul></p>",
    ],
    [
      "22/11/1979", "Eduardo Nogueira Teste", "102", "2026-10-20", "14:30", "15:00",
      "Evolução", "Avaliação Clínica",
      "<div>Retorno para revis&atilde;o de plano alimentar.<br>Boa ades&atilde;o aos treinos (4x/semana).</div>",
    ],
    [
      "22/11/1979", "Eduardo Nogueira Teste", "102", "2026-10-20", "14:30", "15:00",
      "Conduta", "Ajuste Nutricional",
      "<p>Aumentar aporte proteico para 1,8 g/kg/dia e manter hidrata&ccedil;&atilde;o de 3L/dia.</p>",
    ],
  ];

  const schedulingHeaders = [
    "patient_birth_date", "patient_name", "physician_id", "date", "status",
    "patient_home_phone", "patient_mobile_phone", "arrival_time", "start_time",
    "end_time", "description", "all_day", "cancel_reason", "patient_email",
    "event_blocked_scheduling", "healthinsurance_name", "eventprocedure_pack",
  ];
  const schedulingRows = [
    [
      "1988-05-14", "Beatriz Almeida Teste", "101", "2026-10-15", "attended",
      "", "(31) 99111-2233", "08:52", "09:00", "09:40",
      "Primeira consulta endocrinologia", "false", "", "beatriz.teste@exemplo.com.br",
      "false", "Unimed BH", '[{"name":"Consulta Médica"}]',
    ],
    [
      "1979-11-22", "Eduardo Nogueira Teste", "102", "2026-12-10", "confirmed",
      "", "(31) 99222-3344", "", "14:30", "15:00",
      "Retorno nutrologia e bioimpedância", "false", "", "eduardo.teste@exemplo.com.br",
      "false", "Particular", '[{"name":"Retorno Nutrológico"}]',
    ],
    [
      "", "", "101", "2026-12-11", "scheduled",
      "", "", "", "12:00", "13:00",
      "Horário de almoço / bloqueio de agenda", "false", "", "",
      "true", "", "[]",
    ],
  ];

  const attachmentHeaders = [
    "patient_birth_date", "patient_name", "physician_id", "date", "start_time",
    "title", "description", "attachment_filename",
  ];
  const attachmentRows = [
    [
      "1988-05-14", "Beatriz Almeida Teste", "101", "2026-10-15", "09:00",
      "Exames Laboratoriais Anteriores", "PDF trazido pela paciente na consulta",
      "exames_beatriz_out2026.pdf",
    ],
  ];

  zip.file("patient.csv", makeCsv(patientHeaders, patientRows));
  zip.file("event_record.csv", makeCsv(recordHeaders, recordRows));
  zip.file("event_scheduling.csv", makeCsv(schedulingHeaders, schedulingRows));
  zip.file("event_attachment.csv", makeCsv(attachmentHeaders, attachmentRows));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
