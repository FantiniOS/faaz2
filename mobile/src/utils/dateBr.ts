/**
 * Utilitário Único de Fuso Horário do App Mobile — Clínica FAAZ (America/Sao_Paulo / UTC-3)
 *
 * Compatível com Hermes (Android/iOS) e Web:
 * - Tenta `Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"` validado por sonda.
 * - Caso o runtime Android/Hermes não possua ICU completo (ou ignore `timeZone`),
 *   usa automaticamente fallback determinístico `UTC - 3h` sem jamais lançar exceção
 *   e sem depender do fuso horário configurado no aparelho/emulador.
 */

export const TIMEZONE_BR = "America/Sao_Paulo";
export const OFFSET_BR = "-03:00";

const OFFSET_BR_MS = 3 * 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const DIAS_SEMANA_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function formatUtcYmd(dt: Date): string {
  return `${pad4(dt.getUTCFullYear())}-${pad2(dt.getUTCMonth() + 1)}-${pad2(
    dt.getUTCDate()
  )}`;
}

/**
 * Valida se o runtime (Hermes/V8/JSC) realmente aplica `timeZone: "America/Sao_Paulo"`.
 * Alguns builds Android/Hermes não lançam erro mas ignoram silenciosamente `timeZone`
 * retornando UTC; esta sonda detecta ambos os casos com segurança.
 */
function detectIntlSaoPauloSupport(): boolean {
  try {
    if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
      return false;
    }
    // 2026-11-21T02:48:00.000Z === 2026-11-20 23:48:00 em America/Sao_Paulo
    const probe = new Date(Date.UTC(2026, 10, 21, 2, 48, 0));
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE_BR,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    if (typeof dtf.formatToParts !== "function") {
      return false;
    }
    const parts = dtf.formatToParts(probe);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value;
    return (
      pick("year") === "2026" &&
      pick("month") === "11" &&
      pick("day") === "20" &&
      Number(pick("hour")) % 24 === 23 &&
      pick("minute") === "48"
    );
  } catch {
    return false;
  }
}

const HAS_INTL_SAO_PAULO = detectIntlSaoPauloSupport();

function toValidDate(input?: Date | string | number | null): Date {
  if (input instanceof Date) return input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (ISO_DATE_RE.test(trimmed)) {
      return new Date(`${trimmed}T12:00:00${OFFSET_BR}`);
    }
    return new Date(trimmed);
  }
  if (typeof input === "number") return new Date(input);
  return new Date();
}

export interface PartesDataHoraBR {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isoDate: string;
  weekdayIndex: number;
}

/**
 * Extrai componentes de data e hora exatamente em America/Sao_Paulo (UTC-3).
 */
export function getPartesDataHoraBR(
  input?: Date | string | number
): PartesDataHoraBR {
  const date = toValidDate(input);

  if (HAS_INTL_SAO_PAULO) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE_BR,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "short",
        hour12: false,
      }).formatToParts(date);

      const pick = (type: string) =>
        parts.find((p) => p.type === type)?.value || "00";

      const year = Number(pick("year"));
      const month = Number(pick("month"));
      const day = Number(pick("day"));
      const hour = Number(pick("hour")) % 24;
      const minute = Number(pick("minute"));
      const second = Number(pick("second"));

      const wdStr = (
        parts.find((p) => p.type === "weekday")?.value || ""
      ).toLowerCase();
      const wdMap: Record<string, number> = {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
      };
      const weekdayIndex = wdMap[wdStr.slice(0, 3)] ?? 0;

      const isoDate = `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
      return { year, month, day, hour, minute, second, isoDate, weekdayIndex };
    } catch {
      // Cai silenciosamente para o fallback determinístico UTC-3
    }
  }

  const shifted = new Date(date.getTime() - OFFSET_BR_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();
  const weekdayIndex = shifted.getUTCDay();
  const isoDate = `${pad4(year)}-${pad2(month)}-${pad2(day)}`;

  return { year, month, day, hour, minute, second, isoDate, weekdayIndex };
}

/**
 * Retorna a data de hoje ("YYYY-MM-DD") no fuso oficial de Brasília.
 * Às 23:48 BRT de 20/11 retorna "2026-11-20", nunca "2026-11-21".
 */
export function getHojeBR(refDate?: Date): string {
  return getPartesDataHoraBR(refDate).isoDate;
}

/**
 * Converte qualquer Date, timestamp ISO UTC ou string YYYY-MM-DD para "YYYY-MM-DD"
 * em America/Sao_Paulo.
 */
export function getDataBR(dateOrIso?: Date | string | number): string {
  if (typeof dateOrIso === "string" && ISO_DATE_RE.test(dateOrIso.trim())) {
    return dateOrIso.trim();
  }
  const d = toValidDate(dateOrIso);
  if (Number.isNaN(d.getTime())) return getHojeBR();
  return getPartesDataHoraBR(d).isoDate;
}

/**
 * Retorna hora "HH:mm" em America/Sao_Paulo.
 */
export function getHoraBR(dateOrIso?: Date | string | number | null): string {
  if (dateOrIso === null || dateOrIso === undefined) return "";
  const d = toValidDate(dateOrIso);
  if (Number.isNaN(d.getTime())) return "";
  const sp = getPartesDataHoraBR(d);
  return `${pad2(sp.hour)}:${pad2(sp.minute)}`;
}

/**
 * Retorna hora, minuto e total de minutos do dia em America/Sao_Paulo.
 */
export function getHoraMinutosBR(refDate?: Date): {
  hour: number;
  minute: number;
  totalMinutes: number;
} {
  const sp = getPartesDataHoraBR(refDate);
  return {
    hour: sp.hour,
    minute: sp.minute,
    totalMinutes: sp.hour * 60 + sp.minute,
  };
}

/**
 * Saudação baseada na hora real de Brasília (nunca na hora UTC do emulador/dispositivo).
 */
export function getSaudacaoBR(
  refDate?: Date
): "Bom dia" | "Boa tarde" | "Boa noite" {
  const { hour } = getPartesDataHoraBR(refDate);
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Soma ou subtrai dias em string YYYY-MM-DD sem deslocamento de fuso.
 */
export function somarDiasBR(
  dataDiaYYYYMMDD: string,
  deltaDias: number
): string {
  const clean = dataDiaYYYYMMDD.trim().slice(0, 10);
  const [y, m, d] = clean.split("-").map(Number);
  const dt = new Date(
    Date.UTC(y, (m || 1) - 1, (d || 1) + Math.trunc(deltaDias))
  );
  return formatUtcYmd(dt);
}

/**
 * Diferença em dias inteiros entre duas datas YYYY-MM-DD (`destino - origem`).
 */
export function diffDiasBR(origemIso: string, destinoIso: string): number {
  const [oy, om, od] = origemIso.trim().slice(0, 10).split("-").map(Number);
  const [dy, dm, dd] = destinoIso.trim().slice(0, 10).split("-").map(Number);
  const utcOrigem = Date.UTC(oy, (om || 1) - 1, od || 1);
  const utcDestino = Date.UTC(dy, (dm || 1) - 1, dd || 1);
  return Math.round((utcDestino - utcOrigem) / (24 * 60 * 60 * 1000));
}

/**
 * Formata "DD/MM" sem erro de -1 dia em strings YYYY-MM-DD.
 */
export function formatarDataCurtaBR(
  dataDiaOuIso?: Date | string | number | null
): string {
  if (dataDiaOuIso === null || dataDiaOuIso === undefined) return "--/--";
  if (typeof dataDiaOuIso === "string") {
    const trimmed = dataDiaOuIso.trim();
    if (ISO_DATE_RE.test(trimmed)) {
      const [, m, d] = trimmed.split("-");
      return `${d}/${m}`;
    }
  }
  const d = toValidDate(dataDiaOuIso);
  if (Number.isNaN(d.getTime())) return "--/--";
  const sp = getPartesDataHoraBR(d);
  return `${pad2(sp.day)}/${pad2(sp.month)}`;
}

/**
 * Formata "DD/MM/YYYY" sem erro de -1 dia em strings YYYY-MM-DD.
 */
export function formatarDataBR(
  dataDiaOuIso?: Date | string | number | null
): string {
  if (dataDiaOuIso === null || dataDiaOuIso === undefined) return "--/--/----";
  if (typeof dataDiaOuIso === "string") {
    const trimmed = dataDiaOuIso.trim();
    if (ISO_DATE_RE.test(trimmed)) {
      const [y, m, d] = trimmed.split("-");
      return `${d}/${m}/${y}`;
    }
  }
  const d = toValidDate(dataDiaOuIso);
  if (Number.isNaN(d.getTime())) return "--/--/----";
  const sp = getPartesDataHoraBR(d);
  return `${pad2(sp.day)}/${pad2(sp.month)}/${pad4(sp.year)}`;
}

/**
 * Formata "DD/MM/YYYY às HH:mm" em America/Sao_Paulo (ex.: comprovante de aceite LGPD).
 */
export function formatarDataHoraBR(
  dateOrIso?: Date | string | number | null
): string | null {
  if (dateOrIso === null || dateOrIso === undefined) return null;
  const d = toValidDate(dateOrIso);
  if (Number.isNaN(d.getTime())) return null;
  const sp = getPartesDataHoraBR(d);
  return `${pad2(sp.day)}/${pad2(sp.month)}/${pad4(sp.year)} às ${pad2(
    sp.hour
  )}:${pad2(sp.minute)}`;
}

/**
 * Formata "DD/MM • HH:mm" em America/Sao_Paulo (ex.: históricos de glicemia e Bristol).
 */
export function formatarDataCurtaHoraBR(
  dateOrIso?: Date | string | number | null
): string {
  if (dateOrIso === null || dateOrIso === undefined) return "--";
  const d = toValidDate(dateOrIso);
  if (Number.isNaN(d.getTime())) return "--";
  const sp = getPartesDataHoraBR(d);
  return `${pad2(sp.day)}/${pad2(sp.month)} • ${pad2(sp.hour)}:${pad2(
    sp.minute
  )}`;
}

/**
 * Formata data legível por extenso em Brasília (ex.: "20 de Novembro, Sexta-feira").
 */
export function formatarDataExtensoBR(
  dateOrIso?: Date | string | number | null
): string {
  if (dateOrIso === null || dateOrIso === undefined) return "Data a confirmar";
  const d = toValidDate(dateOrIso);
  if (Number.isNaN(d.getTime())) return "Data a confirmar";
  const sp = getPartesDataHoraBR(d);
  const mes = MESES_PT[sp.month - 1] || "";
  const diaSemana = DIAS_SEMANA_PT[sp.weekdayIndex] || "";
  return `${sp.day} de ${mes}, ${diaSemana}`;
}
