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
 * Extrai componentes de data e hora exatamente no fuso America/Sao_Paulo.
 */
export function getPartesDataHoraBR(
  input?: Date | string | number
): PartesDataHoraBR {
  const date = toValidDate(input);
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

  const wdStr = (parts.find((p) => p.type === "weekday")?.value || "").toLowerCase();
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

  const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;

  return { year, month, day, hour, minute, second, isoDate, weekdayIndex };
}

/**
 * Retorna "YYYY-MM-DD" no fuso de Brasília (nunca usa toISOString().slice(0, 10)).
 */
export function getDataDiaBR(input?: Date | string | number): string {
  if (typeof input === "string" && ISO_DATE_RE.test(input.trim())) {
    return input.trim();
  }
  return getPartesDataHoraBR(input).isoDate;
}

/**
 * Aritmética segura em strings YYYY-MM-DD sem deslocamento de fuso.
 */
export function subtrairDiasDataBR(baseIso: string, dias: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

export function adicionarDiasDataBR(baseIso: string, dias: number): string {
  return subtrairDiasDataBR(baseIso, -dias);
}

/**
 * Converte data ("YYYY-MM-DD") + horário ("HH:mm" ou "HH:mm:ss") no horário de Brasília
 * para um objeto Date UTC preciso para persistência e consulta no Oracle.
 */
export function criarDataBR(dataIso: string, horario: string = "00:00"): Date {
  const cleanDate = dataIso.trim().slice(0, 10);
  const [hRaw, mRaw, sRaw] = horario.trim().split(":");
  const hh = String(Math.min(23, Math.max(0, Number(hRaw) || 0))).padStart(
    2,
    "0"
  );
  const mm = String(Math.min(59, Math.max(0, Number(mRaw) || 0))).padStart(
    2,
    "0"
  );
  const ss = String(Math.min(59, Math.max(0, Number(sRaw) || 0))).padStart(
    2,
    "0"
  );
  return new Date(`${cleanDate}T${hh}:${mm}:${ss}${OFFSET_BR}`);
}

/**
 * Retorna { inicioUtc, fimUtc } correspondentes exatamente a 00:00:00.000 até 23:59:59.999
 * em America/Sao_Paulo, prontos para Between() / MoreThanOrEqual() no Oracle.
 */
export function getInicioFimDiaBR(input?: Date | string | number): {
  dataDia: string;
  inicioUtc: Date;
  fimUtc: Date;
} {
  const dataDia = getDataDiaBR(input);
  return {
    dataDia,
    inicioUtc: new Date(`${dataDia}T00:00:00.000${OFFSET_BR}`),
    fimUtc: new Date(`${dataDia}T23:59:59.999${OFFSET_BR}`),
  };
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
  const dataInicioIso = `${String(sp.year).padStart(4, "0")}-${String(
    sp.month
  ).padStart(2, "0")}-01`;

  const mesAntUtc = new Date(Date.UTC(sp.year, sp.month - 2, 1));
  const dataMesAnteriorIso = mesAntUtc.toISOString().slice(0, 10);

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
  const dataFimIso = getDataDiaBR(referencia);
  const dataInicioIso = subtrairDiasDataBR(dataFimIso, n - 1);
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
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Formata data em pt-BR sempre no fuso America/Sao_Paulo (ex.: "19/11/2026").
 */
export function formatarDataBR(
  input?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (input === null || input === undefined) return "--";
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString("pt-BR", {
    timeZone: TIMEZONE_BR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  });
}

/**
 * Formata hora em pt-BR sempre no fuso America/Sao_Paulo (ex.: "21:40" ou "21:40:15").
 */
export function formatarHoraBR(
  input?: Date | string | number | null,
  incluirSegundos: boolean = false
): string {
  if (input === null || input === undefined) return "--:--";
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: TIMEZONE_BR,
    hour: "2-digit",
    minute: "2-digit",
    ...(incluirSegundos ? { second: "2-digit" } : {}),
  });
}

/**
 * Formata data e hora curtas em pt-BR sempre no fuso America/Sao_Paulo (ex.: "19/11, 21:40").
 */
export function formatarDataHoraBR(
  input?: Date | string | number | null,
  incluirAno: boolean = false
): string {
  if (input === null || input === undefined) return "--";
  const d = toValidDate(input);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("pt-BR", {
    timeZone: TIMEZONE_BR,
    day: "2-digit",
    month: "2-digit",
    ...(incluirAno ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formata data legível completa em Brasília (ex.: "20 de Novembro, Sexta-feira").
 */
export function formatarDataHumanaBR(
  input?: Date | string | number | null
): string {
  if (input === null || input === undefined) return "";
  const sp = getPartesDataHoraBR(input);
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
  return `${sp.isoDate}T${String(sp.hour).padStart(2, "0")}:${String(
    sp.minute
  ).padStart(2, "0")}`;
}
