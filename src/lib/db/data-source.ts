import "reflect-metadata";
import {
  DataSource,
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
  type Repository,
} from "typeorm";
import { entities } from "./entities";

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
    "(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1521)(host=adb.sa-saopaulo-1.oraclecloud.com))(connect_data=(service_name=ge6e02e943febad_l77mbqzsy42ovp1y_tp.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))",
} as const;

function readConfig() {
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
  const connectString =
    envUrl && !/^postgres(ql)?:\/\//i.test(envUrl)
      ? envUrl
      : ssl
        ? `(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=${port})(host=${host}))(connect_data=(service_name=${serviceName}))(security=(ssl_server_dn_match=yes)))`
        : `(description=(address=(protocol=tcp)(port=${port})(host=${host}))(connect_data=(service_name=${serviceName})))`;

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

  const poolMax = Number(process.env.DATABASE_POOL_MAX ?? 4);
  return {
    host,
    port,
    serviceName,
    ssl,
    connectString,
    username,
    password,
    poolMax: Number.isFinite(poolMax) ? poolMax : 4,
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
      poolTimeout: 60,
      queueTimeout: 10_000,
    },
  });
}

const globalForDb = globalThis as unknown as {
  endocDataSource?: Promise<DataSource>;
};

/** Retorna o DataSource inicializado (singleton por instância / HMR-safe). */
export function getDataSource(): Promise<DataSource> {
  if (!globalForDb.endocDataSource) {
    globalForDb.endocDataSource = createDataSource()
      .initialize()
      .catch((error: unknown) => {
        globalForDb.endocDataSource = undefined;
        throw error;
      });
  }
  return globalForDb.endocDataSource;
}

/** Atalho para obter um Repository já conectado. */
export async function getRepository<T extends ObjectLiteral>(
  target: EntityTarget<T>,
): Promise<Repository<T>> {
  return (await getDataSource()).getRepository(target);
}

/** Substituto de `prisma.$transaction(async (tx) => ...)`. */
export async function withTransaction<T>(
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return (await getDataSource()).transaction(work);
}
