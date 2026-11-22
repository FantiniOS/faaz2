// ============================================================================
// UTILITÁRIOS DEFENSIVOS PARA ORACLE ADB / TYPEORM
// ============================================================================

export interface OracleErrorInfo {
  errorNum: number | null;
  oraCode: string | null;
  code: string | null;
  message: string;
}

/**
 * Extrai código ORA (`errorNum` / `oraCode`), `code` e `message` tanto de erros
 * diretos do node-oracledb quanto de QueryFailedError do TypeORM (`driverError`).
 */
export function extractOracleErrorInfo(error: unknown): OracleErrorInfo {
  if (!error || typeof error !== "object") {
    const message = String(error ?? "Erro desconhecido");
    const match = message.match(/ORA-(\d{5})/i);
    return {
      errorNum: match ? Number(match[1]) : null,
      oraCode: match ? `ORA-${match[1]}` : null,
      code: match ? `ORA-${match[1]}` : null,
      message,
    };
  }

  const errObj = error as {
    code?: unknown;
    errorNum?: unknown;
    message?: unknown;
    driverError?: {
      code?: unknown;
      errorNum?: unknown;
      message?: unknown;
    };
  };

  const rawErrorNum = errObj.errorNum ?? errObj.driverError?.errorNum;
  let errorNum =
    typeof rawErrorNum === "number" && Number.isFinite(rawErrorNum)
      ? rawErrorNum
      : null;

  const message =
    (typeof errObj.driverError?.message === "string" &&
      errObj.driverError.message) ||
    (typeof errObj.message === "string" && errObj.message) ||
    String(error);

  if (errorNum === null) {
    const match = message.match(/ORA-(\d{5})/i);
    if (match) {
      errorNum = Number(match[1]);
    }
  }

  const oraCode =
    errorNum !== null ? `ORA-${String(errorNum).padStart(5, "0")}` : null;

  const rawCode = errObj.driverError?.code ?? errObj.code;
  const code =
    typeof rawCode === "string" && rawCode.trim() ? rawCode.trim() : oraCode;

  return {
    errorNum,
    oraCode,
    code,
    message,
  };
}

/**
 * Emite log estruturado no servidor (Vercel Logs) com rota, código ORA e mensagem,
 * mantendo a resposta HTTP limpa e sem vazamento de SQL/stack.
 */
export function logOracleRouteError(
  route: string,
  error: unknown,
  context?: Record<string, unknown>,
): OracleErrorInfo {
  const info = extractOracleErrorInfo(error);
  console.error(`[${route}] Erro interno`, {
    route,
    errorNum: info.errorNum,
    oraCode: info.oraCode,
    code: info.code,
    message: info.message,
    ...(context || {}),
  });
  return info;
}

/**
 * Converte valores vindos de colunas CLOB/VARCHAR do Oracle em string segura,
 * sem lançar exceção para null, undefined, Buffer ou objetos inesperados.
 */
export function safeClobString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Parser JSON defensivo para CLOBs e payloads textuais:
 * nunca lança SyntaxError para null, string vazia ou texto puro.
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") {
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
      const asText = value.toString("utf8").trim();
      if (!asText) return fallback;
      try {
        return JSON.parse(asText) as T;
      } catch {
        return fallback;
      }
    }
    return value as T;
  }
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}
