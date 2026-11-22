/**
 * Utilitário Central de Fuso Horário — Clínica FAAZ (America/Sao_Paulo / UTC-3)
 *
 * Garante que todas as fronteiras de dia ("Hoje", "7d", "30d", "Mês"),
 * chaves `DATA_DIA` (YYYY-MM-DD), filtros SQL no Oracle e formatações de hora
 * operem sempre no horário oficial de Brasília, mesmo com servidores Vercel
 * e Oracle ADB executando em UTC.
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
 * Verifica em tempo de carga se o runtime realmente aplica `timeZone: "America/Sao_Paulo"`
 * (caso o runtime não tenha ICU completo, cai para o fallback determinístico UTC-3).
 */
function detectIntlSaoPauloSupport(): boolean {
  try {
    // 2026-11-21T02:48:00.000Z === 2026-11-20 23:48:00 em America/Sao_Paulo
    const probe = new Date(Date.UTC(2026, 10, 21, 2, 48, 0));
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE_BR,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(probe);
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
    if (!trimmed) return new Date(Number.NaN);
    if (ISO_DATE_RE.test(trimmed)) {
      return new Date(`${trimmed}T12:00:00${OFFSET_BR}`);
    }
    return new Date(trimmed);
  }
  if (typeof input === "number" && Number.isFinite(input)) return new Date(input);
  if (input === null || input === undefined) return new Date();
  return new Date(Number.NaN);
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
 * Extrai componentes de data e hora exatamente no fuso America/Sao_Paulo.
 */
export function getPartesDataHoraBR(
  input?: Date | string | number | null
): PartesDataHoraBR {
  const parsed = toValidDate(input);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  if (HAS_INTL_SAO_PAULO) {
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
  }

  // Fallback determinístico UTC-3 (horário oficial de Brasília)
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
 * Retorna a data de hoje ("YYYY-MM-DD") exatamente em America/Sao_Paulo.
 * Às 23:48 BRT de 20/11 retorna "2026-11-20", nunca "2026-11-21".
 */
export function getHojeBR(refDate?: Date): string {
  return getPartesDataHoraBR(refDate).isoDate;
}

/**
 * Converte qualquer Date, timestamp ISO UTC ou string YYYY-MM-DD para "YYYY-MM-DD"
 * no fuso oficial de Brasília (America/Sao_Paulo).
 */
export function getDataBR(input?: Date | string | number): string {
  if (typeof input === "string" && ISO_DATE_RE.test(input.trim())) {
    return input.trim();
  }
  return getPartesDataHoraBR(input).isoDate;
}

/**
 * Alias retrocompatível de getDataBR.
 */
export function getDataDiaBR(input?: Date | string | number): string {
  return getDataBR(input);
}

/**
 * Soma ou subtrai dias em strings YYYY-MM-DD de forma pura, sem shift de fuso.
 * Ex.: somarDiasBR("2026-11-20", 1) => "2026-11-21"; somarDiasBR("2026-11-20", -1) => "2026-11-19".
 */
export function somarDiasBR(dataDiaYYYYMMDD: string, deltaDias: number): string {
  const clean = dataDiaYYYYMMDD.trim().slice(0, 10);
  const [y, m, d] = clean.split("-").map(Number);
  const dt = new Date(
    Date.UTC(y, (m || 1) - 1, (d || 1) + Math.trunc(deltaDias))
  );
  return formatUtcYmd(dt);
}

/**
 * Aritmética segura em strings YYYY-MM-DD sem deslocamento de fuso.
 */
export function subtrairDiasDataBR(baseIso: string, dias: number): string {
  return somarDiasBR(baseIso, -dias);
}

export function adicionarDiasDataBR(baseIso: string, dias: number): string {
  return somarDiasBR(baseIso, dias);
}

/**
 * Converte data ("YYYY-MM-DD") + horário ("HH:mm" ou "HH:mm:ss") no horário de Brasília
 * para um objeto Date UTC preciso para persistência e consulta no Oracle.
 */
export function criarDataBR(dataIso: string, horario: string = "00:00"): Date {
  const cleanDate = dataIso.trim().slice(0, 10);
  const [hRaw, mRaw, sRaw] = horario.trim().split(":");
  const hh = pad2(Math.min(23, Math.max(0, Number(hRaw) || 0)));
  const mm = pad2(Math.min(59, Math.max(0, Number(mRaw) || 0)));
  const ss = pad2(Math.min(59, Math.max(0, Number(sRaw) || 0)));
  return new Date(`${cleanDate}T${hh}:${mm}:${ss}${OFFSET_BR}`);
}

/**
 * Converte um dia de Brasília (YYYY-MM-DD ou Date de referência) no intervalo exato
 * de instâncias Date em UTC (00:00:00.000-03:00 até 23:59:59.999-03:00, ou seja,
 * 03:00:00.000Z do dia até 02:59:59.999Z do dia seguinte) para filtros TIMESTAMP no Oracle.
 */
export function getIntervaloDiaBR(input?: Date | string | number): {
  dataDia: string;
  inicioUtc: Date;
  fimUtc: Date;
} {
  const dataDia = getDataBR(input);
  return {
    dataDia,
    inicioUtc: new Date(`${dataDia}T00:00:00.000${OFFSET_BR}`),
    fimUtc: new Date(`${dataDia}T23:59:59.999${OFFSET_BR}`),
  };
}

/**
 * Alias retrocompatível de getIntervaloDiaBR.
 */
export function getInicioFimDiaBR(input?: Date | string | number): {
  dataDia: string;
  inicioUtc: Date;
  fimUtc: Date;
} {
  return getIntervaloDiaBR(input);
}

/**
 * Retorna fronteiras do mês corrente (e início do mês anterior) em America/Sao_Paulo.
 */
export function getInicioMesBR(input?: Date | string | number): {
  dataInicioIso: string;
  inicioUtc: Date;
  dataMesAnteriorIso: string;
  inicioMesAnteriorUtc: Date;
  diasDecorridos: number;
} {
  const sp = getPartesDataHoraBR(input);
  const dataInicioIso = `${pad4(sp.year)}-${pad2(sp.month)}-01`;

  const mesAntUtc = new Date(Date.UTC(sp.year, sp.month - 2, 1));
  const dataMesAnteriorIso = formatUtcYmd(mesAntUtc);

  return {
    dataInicioIso,
    inicioUtc: new Date(`${dataInicioIso}T00:00:00.000${OFFSET_BR}`),
    dataMesAnteriorIso,
    inicioMesAnteriorUtc: new Date(
      `${dataMesAnteriorIso}T00:00:00.000${OFFSET_BR}`
    ),
    diasDecorridos: Math.max(1, sp.day),
  };
}

/**
 * Retorna intervalo dos últimos `dias` corridos em America/Sao_Paulo (incluindo hoje).
 * Ex.: dias = 1 -> apenas hoje; dias = 7 -> hoje e os 6 dias anteriores; dias = 30 -> 30 dias.
 */
export function getIntervaloDiasBR(
  dias: number,
  referencia?: Date | string | number
): {
  dataInicioIso: string;
  dataFimIso: string;
  inicioUtc: Date;
  fimUtc: Date;
} {
  const n = Math.max(1, Math.round(dias));
  const dataFimIso = getDataBR(referencia);
  const dataInicioIso = somarDiasBR(dataFimIso, -(n - 1));
  return {
    dataInicioIso,
    dataFimIso,
    inicioUtc: new Date(`${dataInicioIso}T00:00:00.000${OFFSET_BR}`),
    fimUtc: new Date(`${dataFimIso}T23:59:59.999${OFFSET_BR}`),
  };
}

/**
 * Garante timestamp ISO UTC padronizado com sufixo "Z".
 */
export function toIsoUtc(input?: Date | string | number | null): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string" && !input.trim()) return null;
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Formata data em pt-BR sempre no fuso America/Sao_Paulo (ex.: "20/11/2026").
 * Strings YYYY-MM-DD são formatadas diretamente sem parsing UTC (nunca retrocedem 1 dia).
 */
export function formatarDataBR(
  input?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (input === null || input === undefined) return "--";
  if (typeof input === "string" && !options) {
    const trimmed = input.trim();
    if (ISO_DATE_RE.test(trimmed)) {
      const [y, m, d] = trimmed.split("-");
      return `${d}/${m}/${y}`;
    }
  }
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "--";
  if (!options) {
    const sp = getPartesDataHoraBR(d);
    return `${pad2(sp.day)}/${pad2(sp.month)}/${pad4(sp.year)}`;
  }
  return d.toLocaleDateString("pt-BR", {
    timeZone: TIMEZONE_BR,
    ...options,
  });
}

/**
 * Formata data curta "DD/MM" sempre em America/Sao_Paulo (nunca retrocede 1 dia).
 */
export function formatarDataCurtaBR(
  input?: Date | string | number | null
): string {
  if (input === null || input === undefined) return "--/--";
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (ISO_DATE_RE.test(trimmed)) {
      const [, m, d] = trimmed.split("-");
      return `${d}/${m}`;
    }
  }
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "--/--";
  const sp = getPartesDataHoraBR(d);
  return `${pad2(sp.day)}/${pad2(sp.month)}`;
}

/**
 * Retorna hora "HH:mm" (ou "HH:mm:ss") sempre em America/Sao_Paulo.
 */
export function getHoraBR(
  input?: Date | string | number | null,
  incluirSegundos: boolean = false
): string {
  if (input === null || input === undefined) {
    return incluirSegundos ? "--:--:--" : "--:--";
  }
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) {
    return incluirSegundos ? "--:--:--" : "--:--";
  }
  const sp = getPartesDataHoraBR(d);
  const hh = pad2(sp.hour);
  const mm = pad2(sp.minute);
  if (!incluirSegundos) return `${hh}:${mm}`;
  return `${hh}:${mm}:${pad2(sp.second)}`;
}

/**
 * Alias retrocompatível de getHoraBR.
 */
export function formatarHoraBR(
  input?: Date | string | number | null,
  incluirSegundos: boolean = false
): string {
  return getHoraBR(input, incluirSegundos);
}

/**
 * Formata data e hora curtas em pt-BR sempre no fuso America/Sao_Paulo (ex.: "20/11, 23:48").
 */
export function formatarDataHoraBR(
  input?: Date | string | number | null,
  incluirAno: boolean = false
): string {
  if (input === null || input === undefined) return "--";
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "--";
  const sp = getPartesDataHoraBR(d);
  const dd = pad2(sp.day);
  const mm = pad2(sp.month);
  const yyyy = pad4(sp.year);
  const hh = pad2(sp.hour);
  const min = pad2(sp.minute);
  return `${dd}/${mm}${incluirAno ? `/${yyyy}` : ""}, ${hh}:${min}`;
}

/**
 * Formata data legível completa em Brasília (ex.: "20 de Novembro, Sexta-feira").
 */
export function formatarDataHumanaBR(
  input?: Date | string | number | null
): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string" && !input.trim()) return "";
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "";
  const sp = getPartesDataHoraBR(d);
  const mes = MESES_PT[sp.month - 1] || "";
  const diaSemana = DIAS_SEMANA_PT[sp.weekdayIndex] || "";
  return `${sp.day} de ${mes}, ${diaSemana}`;
}

/**
 * Formata para input HTML <input type="datetime-local"> no fuso America/Sao_Paulo.
 */
export function formatarParaDatetimeLocalBR(
  input?: Date | string | number | null
): string {
  if (input === null || input === undefined) return "";
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "";
  const sp = getPartesDataHoraBR(d);
  return `${sp.isoDate}T${pad2(sp.hour)}:${pad2(sp.minute)}`;
}

/**
 * Calcula idade exata em America/Sao_Paulo sem retrocesso de 1 dia em strings YYYY-MM-DD.
 */
export function calcularIdadeBR(
  birthDate?: Date | string | null,
  refDate?: Date
): number | null {
  if (!birthDate) return null;
  let birthY: number;
  let birthM: number;
  let birthD: number;

  if (typeof birthDate === "string") {
    const trimmed = birthDate.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      birthY = Number(match[1]);
      birthM = Number(match[2]);
      birthD = Number(match[3]);
    } else {
      const d = toValidDate(trimmed);
      if (Number.isNaN(d.getTime())) return null;
      const p = getPartesDataHoraBR(d);
      birthY = p.year;
      birthM = p.month;
      birthD = p.day;
    }
  } else if (birthDate instanceof Date) {
    if (Number.isNaN(birthDate.getTime())) return null;
    if (
      birthDate.getUTCHours() === 0 &&
      birthDate.getUTCMinutes() === 0 &&
      birthDate.getUTCSeconds() === 0 &&
      birthDate.getUTCMilliseconds() === 0
    ) {
      birthY = birthDate.getUTCFullYear();
      birthM = birthDate.getUTCMonth() + 1;
      birthD = birthDate.getUTCDate();
    } else {
      const p = getPartesDataHoraBR(birthDate);
      birthY = p.year;
      birthM = p.month;
      birthD = p.day;
    }
  } else {
    return null;
  }

  const hoje = getPartesDataHoraBR(refDate);
  let idade = hoje.year - birthY;
  if (hoje.month < birthM || (hoje.month === birthM && hoje.day < birthD)) {
    idade -= 1;
  }
  return idade >= 0 ? idade : null;
}
