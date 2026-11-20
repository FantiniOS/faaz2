import "reflect-metadata";
import oracledb from "oracledb";
import {
  DataSource,
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
  type Repository,
} from "typeorm";
import { entities } from "./entities";

// ============================================================================
// TUNING DO DRIVER node-oracledb (Modo Thin — Serverless Vercel + Oracle ADB)
// ============================================================================
// fetchAsString = [CLOB]: evita round-trips extras por linha ao ler LOB locators.
// fetchArraySize = 100: reduz round-trips de busca em listagens/séries temporais.
oracledb.fetchAsString = [oracledb.CLOB];
oracledb.fetchArraySize = 100;

// ============================================================================
// CONEXÃO — Oracle Autonomous Database via TypeORM + node-oracledb (Modo Thin)
// ============================================================================
// Parâmetros extraídos do painel do Oracle Autonomous Database (sa-saopaulo-1):
export const ORACLE_ADB_DEFAULTS = {
  host: "adb.sa-saopaulo-1.oraclecloud.com",
  port: 1521,
  serviceName: "ge6e02e943febad_l77mbqzsy42ovp1y_tp.adb.oraclecloud.com",
  ssl: true,
  connectString:
    "(description=(retry_count=3)(retry_delay=1)(address=(protocol=tcps)(port=1521)(host=adb.sa-saopaulo-1.oraclecloud.com))(connect_data=(service_name=ge6e02e943febad_l77mbqzsy42ovp1y_tp.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))",
} as const;

/**
 * Evita que descritores TNS com retry_count=20/retry_delay=3 travem o pool
 * por até 60s durante picos de sessão no Oracle ADB, estourando o queueTimeout.
 */
function normalizeOracleConnectString(raw: string): string {
  return raw
    .replace(/\(\s*retry_count\s*=\s*\d+\s*\)/gi, "(retry_count=3)")
    .replace(/\(\s*retry_delay\s*=\s*\d+\s*\)/gi, "(retry_delay=1)");
}

function readConfig() {
  // Garante carregamento do .env quando executado fora do Next.js (ex.: npx jiti prisma/seed.ts)
  if (
    !process.env.DATABASE_PASSWORD &&
    !process.env.ORACLE_PASSWORD &&
    typeof process.loadEnvFile === "function"
  ) {
    try {
      process.loadEnvFile();
    } catch {
      // Ignora se .env não existir no ambiente (ex.: Vercel Serverless)
    }
  }

  const host = process.env.ORACLE_HOST?.trim() || ORACLE_ADB_DEFAULTS.host;
  const port = Number(process.env.ORACLE_PORT ?? ORACLE_ADB_DEFAULTS.port);
  const serviceName =
    process.env.ORACLE_SERVICE_NAME?.trim() || ORACLE_ADB_DEFAULTS.serviceName;
  const ssl =
    process.env.ORACLE_SSL !== undefined
      ? process.env.ORACLE_SSL === "true"
      : ORACLE_ADB_DEFAULTS.ssl;

  // Se DATABASE_URL já contiver um descritor TNS Oracle, usa-o; caso contrário,
  // monta o descritor TCPS (1-way TLS sem Wallet) a partir de host/port/serviceName.
  // Nota técnica: o OracleDriver do TypeORM (OracleDriver.js:891) monta PROTOCOL=TCP
  // quando `connectString` é omitido e não possui propriedade `ssl` nativa; por isso
  // passamos tanto host/port/serviceName quanto `connectString` com protocol=tcps.
  const envUrl = process.env.DATABASE_URL?.trim();
  const rawConnectString =
    envUrl && !/^postgres(ql)?:\/\//i.test(envUrl)
      ? envUrl
      : ssl
        ? `(description=(retry_count=3)(retry_delay=1)(address=(protocol=tcps)(port=${port})(host=${host}))(connect_data=(service_name=${serviceName}))(security=(ssl_server_dn_match=yes)))`
        : `(description=(address=(protocol=tcp)(port=${port})(host=${host}))(connect_data=(service_name=${serviceName})))`;
  const connectString = normalizeOracleConnectString(rawConnectString);

  const username =
    process.env.DATABASE_USER?.trim() ||
    process.env.ORACLE_USER?.trim() ||
    "ADMIN";
  const password =
    process.env.DATABASE_PASSWORD ?? process.env.ORACLE_PASSWORD ?? "";

  if (!password) {
    throw new Error(
      "[db] Senha ausente: defina DATABASE_PASSWORD (ou ORACLE_PASSWORD) nas variáveis de ambiente.",
    );
  }

  // Oracle ADB Always Free impõe limite global de 30 sessões. Em Serverless (Vercel),
  // várias instâncias quentes ficam abertas em paralelo; manter poolMax=2 por instância
  // evita esgotamento global de sessões (NJS-040 / ORA-00018) mantendo alta vazão.
  const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 2);
  const resolvedPoolMax =
    Number.isFinite(poolMax) && poolMax >= 1 ? Math.min(poolMax, 8) : 2;
  return {
    host,
    port,
    serviceName,
    ssl,
    connectString,
    username,
    password,
    poolMax: resolvedPoolMax,
  };
}

function createDataSource(): DataSource {
  const { host, port, serviceName, connectString, username, password, poolMax } =
    readConfig();

  return new DataSource({
    type: "oracle",
    host,
    port,
    serviceName,
    connectString,
    username,
    password,
    entities,
    // Schema gerenciado via scripts DDL em database/oracle/*.sql
    synchronize: false,
    migrationsRun: false,
    // Sessão em UTC para consistência de TIMESTAMP WITH TIME ZONE
    useUTC: true,
    logging:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    extra: {
      poolMin: 0,
      poolMax,
      poolIncrement: 1,
      // Valida conexões ociosas (>15s) antes do checkout para descartar sockets
      // encerrados durante congelamento de containers Serverless (NJS-500 / NJS-521).
      poolPingInterval: 15,
      poolPingTimeout: 3_000,
      // Libera sessões ociosas rapidamente de volta ao Oracle ADB Free Tier (30 sessões globais).
      poolTimeout: 10,
      maxLifetimeSession: 300,
      queueTimeout: 20_000,
      connectTimeout: 10,
      stmtCacheSize: 40,
    },
  });
}

const TRANSIENT_ORACLE_CODES = [
  "NJS-500",
  "NJS-521",
  "NJS-503",
  "NJS-040",
  "NJS-003",
  "NJS-064",
  "NJS-065",
  "DPI-1010",
  "ORA-03113",
  "ORA-03114",
  "ORA-03135",
  "ORA-01012",
  "ORA-00018",
  "ORA-12170",
  "ORA-12537",
  "ORA-12514",
  "ORA-12516",
  "ORA-12520",
  "ORA-12541",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ECONNREFUSED",
] as const;

const POOL_RESET_ORACLE_CODES = [
  "NJS-503",
  "NJS-064",
  "NJS-065",
  "DPI-1010",
  "ORA-03113",
  "ORA-03114",
] as const;

function extractOracleErrorSignature(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
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
  const parts = [
    errObj.code,
    errObj.errorNum != null ? `ORA-${String(errObj.errorNum).padStart(5, "0")}` : null,
    errObj.message,
    errObj.driverError?.code,
    errObj.driverError?.errorNum != null
      ? `ORA-${String(errObj.driverError.errorNum).padStart(5, "0")}`
      : null,
    errObj.driverError?.message,
  ].filter(Boolean);
  return parts.map(String).join(" | ");
}

/** Identifica falhas transitórias de rede/conexão/pool do Oracle ADB elegíveis para retry único. */
export function isTransientOracleError(error: unknown): boolean {
  const sig = extractOracleErrorSignature(error).toUpperCase();
  if (!sig) return false;
  return TRANSIENT_ORACLE_CODES.some((code) => sig.includes(code));
}

function shouldResetPoolOnError(error: unknown): boolean {
  const sig = extractOracleErrorSignature(error).toUpperCase();
  if (!sig) return false;
  return POOL_RESET_ORACLE_CODES.some((code) => sig.includes(code));
}

const globalForDb = globalThis as unknown as {
  endocDataSource?: Promise<DataSource>;
  endocDataSourceResetting?: Promise<void>;
};

/** Descarta o DataSource singleton caso o pool tenha sido fechado ou corrompido (com lock anti-race). */
export async function resetDataSource(): Promise<void> {
  if (globalForDb.endocDataSourceResetting) {
    await globalForDb.endocDataSourceResetting;
    return;
  }

  const resetPromise = (async () => {
    const existing = globalForDb.endocDataSource;
    globalForDb.endocDataSource = undefined;
    if (!existing) return;
    try {
      const ds = await existing;
      if (ds.isInitialized) {
        await ds.destroy();
      }
    } catch {
      // Ignora erro ao encerrar pool já corrompido/fechado
    }
  })().finally(() => {
    globalForDb.endocDataSourceResetting = undefined;
  });

  globalForDb.endocDataSourceResetting = resetPromise;
  await resetPromise;
}

/** Retorna o DataSource inicializado com lock de Promise singleton em globalThis (evita pools duplicados em cold starts simultâneos). */
export async function getDataSource(): Promise<DataSource> {
  if (globalForDb.endocDataSourceResetting) {
    await globalForDb.endocDataSourceResetting;
  }

  if (!globalForDb.endocDataSource) {
    globalForDb.endocDataSource = createDataSource()
      .initialize()
      .catch((error: unknown) => {
        globalForDb.endocDataSource = undefined;
        throw error;
      });
  }

  const ds = await globalForDb.endocDataSource;
  if (!ds.isInitialized) {
    await resetDataSource();
    globalForDb.endocDataSource = createDataSource()
      .initialize()
      .catch((error: unknown) => {
        globalForDb.endocDataSource = undefined;
        throw error;
      });
    return globalForDb.endocDataSource;
  }

  return ds;
}

/**
 * Executa uma lista de tarefas assíncronas com concorrência máxima limitada
 * (padrão = 2, alinhado ao poolMax Serverless para não esgotar sessões do Oracle ADB).
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = 2,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, tasks.length));
  const results = new Array<T>(tasks.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < tasks.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await tasks[idx]();
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Variante de runWithConcurrency com semântica Promise.allSettled para isolamento
 * seguro de falhas por consulta/módulo em ondas controladas de até N queries paralelas.
 */
export async function runSettledWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = 2,
): Promise<Array<PromiseSettledResult<T>>> {
  if (tasks.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, tasks.length));
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < tasks.length) {
      const idx = cursor;
      cursor += 1;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: "fulfilled", value };
      } catch (reason: unknown) {
        results[idx] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Executa uma operação contra o Oracle ADB com 1 retry seguro em erros transitórios
 * de conexão fechada, rede ou timeout de fila do pool (NJS-500/521/503/040, DPI-1010, ORA-03113/03114).
 */
export async function withOracleRetry<T>(
  work: () => Promise<T>,
  options?: { label?: string; retryDelayMs?: number },
): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (!isTransientOracleError(error)) {
      throw error;
    }

    const label = options?.label || "query";
    const sig = extractOracleErrorSignature(error);
    console.warn(
      `[db] Erro transitório Oracle em ${label} (${sig.slice(0, 180)}); executando retry único...`,
    );

    if (shouldResetPoolOnError(error)) {
      await resetDataSource();
    }

    const delayMs =
      options?.retryDelayMs ??
      (sig.includes("NJS-040") || sig.includes("ORA-00018") ? 350 : 150);
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    return await work();
  }
}

/** Atalho para obter um Repository já conectado. */
export async function getRepository<T extends ObjectLiteral>(
  target: EntityTarget<T>,
): Promise<Repository<T>> {
  return (await getDataSource()).getRepository(target);
}

/**
 * Executa uma consulta com Repository obtido dinamicamente do DataSource ativo,
 * garantindo que em caso de resetDataSource() durante o retry o novo pool seja usado.
 */
export async function withRepositoryRetry<T extends ObjectLiteral, R>(
  target: EntityTarget<T>,
  work: (repo: Repository<T>) => Promise<R>,
  options?: { label?: string; retryDelayMs?: number },
): Promise<R> {
  return withOracleRetry(async () => {
    const repo = (await getDataSource()).getRepository(target);
    return work(repo);
  }, options);
}

/** Substituto de `prisma.$transaction(async (tx) => ...)`. */
export async function withTransaction<T>(
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return (await getDataSource()).transaction(work);
}
