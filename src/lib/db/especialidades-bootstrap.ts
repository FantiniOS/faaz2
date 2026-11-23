import { IsNull } from "typeorm";
import { getDataSource, getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import {
  EspecialidadeEntity,
  UserEntity,
  type Especialidade,
} from "@/lib/db/entities";
import { extractOracleErrorInfo } from "@/lib/db/oracle-utils";
import {
  encontrarEspecialidadeCompativel,
  gerarCodigoEspecialidadeLegado,
  getCorEspecialidadeEstilo,
  normalizarCorEspecialidade,
  type EspecialidadeDTO,
} from "@/lib/especialidades-clinica";

const ORACLE_IDEMPOTENT_DDL_CODES = new Set([
  955,  // ORA-00955: name is already used by an existing object
  1408, // ORA-01408: such column list already indexed
  1430, // ORA-01430: column being added already exists in table
  2260, // ORA-02260: table can have only one primary key
  2261, // ORA-02261: such unique or primary key already exists in the table
  2275, // ORA-02275: such a referential constraint already exists in the table
]);

const globalForEspecialidades = globalThis as unknown as {
  __endocEspecialidadesBootstrapPromise?: Promise<void>;
};

async function runIdempotentDdl(sql: string): Promise<void> {
  const ds = await getDataSource();
  try {
    await ds.query(sql);
  } catch (err) {
    const info = extractOracleErrorInfo(err);
    if (info.errorNum !== null && ORACLE_IDEMPOTENT_DDL_CODES.has(info.errorNum)) {
      return;
    }
    throw err;
  }
}

export function mapEspecialidadeToDTO(
  esp: Pick<Especialidade, "id" | "nome" | "cor" | "ativo" | "ordem"> & {
    createdAt?: Date | string;
    updatedAt?: Date | string;
  },
  medicosAtivosCount?: number,
): EspecialidadeDTO {
  const cor = normalizarCorEspecialidade(esp.cor);
  const estilo = getCorEspecialidadeEstilo(cor);
  return {
    id: esp.id,
    nome: esp.nome,
    cor,
    corHex: estilo.hex,
    ativo: Boolean(esp.ativo),
    ordem: Number(esp.ordem) || 0,
    codigoLegado: gerarCodigoEspecialidadeLegado(esp.nome),
    ...(medicosAtivosCount !== undefined ? { medicosAtivosCount } : {}),
    ...(esp.createdAt
      ? { createdAt: new Date(esp.createdAt).toISOString() }
      : {}),
    ...(esp.updatedAt
      ? { updatedAt: new Date(esp.updatedAt).toISOString() }
      : {}),
  };
}

/**
 * Migration + seed 100% aditivos e idempotentes para ESPECIALIDADES no Oracle ADB.
 * - Cria tabela ESPECIALIDADES (se não existir)
 * - Adiciona colunas nullable USERS.ESPECIALIDADE_ID e AGENDAMENTOS.ESPECIALIDADE_ID (se não existirem)
 * - Insere seed inicial ("Endocrinologia" e "Cirurgia Plástica") apenas se a tabela estiver vazia
 * - Vincula automaticamente profissionais clínicos existentes por texto compatível SEM perder USERS.SPECIALTY nem CRM
 * - Preenche AGENDAMENTOS.ESPECIALIDADE_ID em agendamentos históricos ainda não vinculados
 */
export async function executarBootstrapEspecialidades(): Promise<{
  tabelaCriada: boolean;
  seedExecutado: boolean;
  usuariosVinculados: number;
  agendamentosVinculados: number;
}> {
  const ds = await getDataSource();

  // 1. Verifica colunas/tabelas já existentes em uma única consulta leve
  const rows = (await ds.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM USER_TAB_COLUMNS
    WHERE (TABLE_NAME = 'ESPECIALIDADES' AND COLUMN_NAME = 'ID')
       OR (TABLE_NAME = 'USERS' AND COLUMN_NAME = 'ESPECIALIDADE_ID')
       OR (TABLE_NAME = 'AGENDAMENTOS' AND COLUMN_NAME = 'ESPECIALIDADE_ID')
  `)) as Array<{ TABLE_NAME?: string; COLUMN_NAME?: string }>;

  const existentes = new Set(
    rows.map((r) => `${r.TABLE_NAME || ""}.${r.COLUMN_NAME || ""}`),
  );

  let tabelaCriada = false;

  if (!existentes.has("ESPECIALIDADES.ID")) {
    await runIdempotentDdl(`
      CREATE TABLE ESPECIALIDADES (
        ID          VARCHAR2(36 CHAR)            NOT NULL,
        NOME        VARCHAR2(100 CHAR)           NOT NULL,
        COR         VARCHAR2(20 CHAR)            DEFAULT 'emerald' NOT NULL,
        ATIVO       NUMBER(1)                    DEFAULT 1 NOT NULL,
        ORDEM       NUMBER(10)                   DEFAULT 0 NOT NULL,
        CREATED_AT  TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
        UPDATED_AT  TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT PK_ESPECIALIDADES PRIMARY KEY (ID),
        CONSTRAINT UQ_ESPECIALIDADES_NOME UNIQUE (NOME),
        CONSTRAINT CK_ESPECIALIDADES_ATIVO CHECK (ATIVO IN (0, 1))
      )
    `);
    await runIdempotentDdl(
      `CREATE INDEX IX_ESPECIALIDADES_ATIVO_ORDEM ON ESPECIALIDADES (ATIVO, ORDEM, NOME)`,
    );
    tabelaCriada = true;
  }

  if (!existentes.has("USERS.ESPECIALIDADE_ID")) {
    await runIdempotentDdl(
      `ALTER TABLE USERS ADD (ESPECIALIDADE_ID VARCHAR2(36 CHAR) NULL)`,
    );
    await runIdempotentDdl(
      `ALTER TABLE USERS ADD CONSTRAINT FK_USERS_ESPECIALIDADE FOREIGN KEY (ESPECIALIDADE_ID) REFERENCES ESPECIALIDADES (ID)`,
    );
    await runIdempotentDdl(
      `CREATE INDEX IX_USERS_ESPECIALIDADE ON USERS (ESPECIALIDADE_ID)`,
    );
  }

  if (!existentes.has("AGENDAMENTOS.ESPECIALIDADE_ID")) {
    await runIdempotentDdl(
      `ALTER TABLE AGENDAMENTOS ADD (ESPECIALIDADE_ID VARCHAR2(36 CHAR) NULL)`,
    );
    await runIdempotentDdl(
      `ALTER TABLE AGENDAMENTOS ADD CONSTRAINT FK_AGEND_ESPECIALIDADE FOREIGN KEY (ESPECIALIDADE_ID) REFERENCES ESPECIALIDADES (ID)`,
    );
    await runIdempotentDdl(
      `CREATE INDEX IX_AGEND_ESPECIALIDADE_ID ON AGENDAMENTOS (ESPECIALIDADE_ID)`,
    );
  }

  // 2. Seed idempotente (somente quando tabela ESPECIALIDADES estiver vazia)
  const espRepo = await getRepository(EspecialidadeEntity);
  let totalEspecialidades = await espRepo.count();
  let seedExecutado = false;

  if (totalEspecialidades === 0) {
    const iniciais = [
      { nome: "Endocrinologia", cor: "emerald", ativo: true, ordem: 1 },
      { nome: "Cirurgia Plástica", cor: "blue", ativo: true, ordem: 2 },
    ];
    for (const item of iniciais) {
      try {
        await espRepo.save(espRepo.create(item));
      } catch (err) {
        const info = extractOracleErrorInfo(err);
        if (info.errorNum !== 1) throw err; // ignora ORA-00001 em corrida de cold start
      }
    }
    seedExecutado = true;
    totalEspecialidades = await espRepo.count();
  }

  if (totalEspecialidades === 0) {
    return {
      tabelaCriada,
      seedExecutado,
      usuariosVinculados: 0,
      agendamentosVinculados: 0,
    };
  }

  const todasEspecialidades = await espRepo.find({
    order: { ordem: "ASC", nome: "ASC" },
  });

  // 3. Backfill idempotente em USERS.ESPECIALIDADE_ID (preservando USERS.SPECIALTY e CRM)
  let usuariosVinculados = 0;
  const userRepo = await getRepository(UserEntity);
  const usuariosSemVinculo = await userRepo.find({
    where: {
      deletedAt: IsNull(),
      especialidadeId: IsNull(),
    },
    select: {
      id: true,
      cargo: true,
      role: true,
      specialty: true,
      especialidadeId: true,
    },
  });

  for (const u of usuariosSemVinculo) {
    const isClinico =
      u.cargo === "MEDICO" ||
      u.cargo === "DONO_CLINICA" ||
      u.role === "DOCTOR" ||
      u.role === "CLINIC_ADMIN";
    if (!isClinico || !u.specialty) continue;

    const compativel = encontrarEspecialidadeCompativel(
      u.specialty,
      todasEspecialidades,
    );
    if (compativel) {
      await userRepo.update({ id: u.id }, { especialidadeId: compativel.id });
      usuariosVinculados += 1;
    }
  }

  // 4. Backfill idempotente em AGENDAMENTOS.ESPECIALIDADE_ID (preservando histórico)
  let agendamentosVinculados = 0;
  const pendingRows = (await ds.query(
    `SELECT COUNT(*) AS TOTAL FROM AGENDAMENTOS WHERE ESPECIALIDADE_ID IS NULL`,
  )) as Array<{ TOTAL?: number | string }>;
  const pendentes = Number(pendingRows[0]?.TOTAL ?? 0);

  if (pendentes > 0) {
    for (const esp of todasEspecialidades) {
      const codigoLegado = gerarCodigoEspecialidadeLegado(esp.nome);
      await ds.query(
        `UPDATE AGENDAMENTOS
         SET ESPECIALIDADE_ID = :1
         WHERE ESPECIALIDADE_ID IS NULL
           AND UPPER(ESPECIALIDADE) = :2`,
        [esp.id, codigoLegado],
      );
    }
    const afterRows = (await ds.query(
      `SELECT COUNT(*) AS TOTAL FROM AGENDAMENTOS WHERE ESPECIALIDADE_ID IS NULL`,
    )) as Array<{ TOTAL?: number | string }>;
    const restantes = Number(afterRows[0]?.TOTAL ?? 0);
    agendamentosVinculados = Math.max(0, pendentes - restantes);
  }

  return {
    tabelaCriada,
    seedExecutado,
    usuariosVinculados,
    agendamentosVinculados,
  };
}

/**
 * Garante uma única execução por processo (singleton) com retry em caso de falha transitória.
 */
export async function ensureEspecialidadesSchemaAndSeed(): Promise<void> {
  if (!globalForEspecialidades.__endocEspecialidadesBootstrapPromise) {
    globalForEspecialidades.__endocEspecialidadesBootstrapPromise =
      executarBootstrapEspecialidades()
        .then(() => undefined)
        .catch((err) => {
          globalForEspecialidades.__endocEspecialidadesBootstrapPromise = undefined;
          throw err;
        });
  }
  return globalForEspecialidades.__endocEspecialidadesBootstrapPromise;
}

/**
 * Carrega todas as especialidades cadastradas (ativas e inativas) ordenadas por ORDEM, NOME.
 */
export async function listarTodasEspecialidadesEntity(
  apenasAtivas = false,
): Promise<Especialidade[]> {
  await ensureEspecialidadesSchemaAndSeed();
  return withRepositoryRetry(
    EspecialidadeEntity,
    (repo) =>
      repo.find({
        where: apenasAtivas ? { ativo: true } : {},
        order: { ordem: "ASC", nome: "ASC" },
      }),
    { label: "especialidades:list-entity" },
  );
}
