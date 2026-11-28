import { getDataSource } from "@/lib/db/data-source";
import { extractOracleErrorInfo } from "@/lib/db/oracle-utils";

const ORACLE_IDEMPOTENT_DDL_CODES = new Set([
  955,  // ORA-00955: name is already used by an existing object
  1408, // ORA-01408: such column list already indexed
  1430, // ORA-01430: column being added already exists in table
  2260, // ORA-02260: table can have only one primary key
  2261, // ORA-02261: such unique or primary key already exists in the table
  2264, // ORA-02264: name already used by an existing constraint
  2275, // ORA-02275: such a referential constraint already exists in the table
]);

const globalForExames = globalThis as unknown as {
  __endocExamesLabBootstrapPromise?: Promise<void>;
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

/**
 * Bootstrap 100% aditivo e idempotente para a tabela EXAMES_LABORATORIAIS no Oracle ADB.
 * - Consulta USER_TABLES antes de executar qualquer DDL.
 * - Nunca executa DROP, TRUNCATE ou alteração de tabelas/dados existentes.
 */
export async function executarBootstrapExamesLaboratoriais(): Promise<{
  tabelaCriada: boolean;
}> {
  const ds = await getDataSource();

  const rows = (await ds.query(`
    SELECT TABLE_NAME
    FROM USER_TABLES
    WHERE TABLE_NAME = 'EXAMES_LABORATORIAIS'
  `)) as Array<{ TABLE_NAME?: string }>;

  let tabelaCriada = false;

  if (rows.length === 0) {
    await runIdempotentDdl(`
      CREATE TABLE EXAMES_LABORATORIAIS (
        ID                     VARCHAR2(36 CHAR)            NOT NULL,
        ORGANIZACAO_ID         VARCHAR2(36 CHAR)            NOT NULL,
        PACIENTE_ID            VARCHAR2(36 CHAR)            NOT NULL,
        MEDICO_ID              VARCHAR2(36 CHAR),
        DATA_COLETA            DATE                         NOT NULL,
        LABORATORIO            VARCHAR2(160 CHAR),
        VALORES                CLOB                         DEFAULT '{}' NOT NULL,
        EXAMES_PERSONALIZADOS  CLOB                         DEFAULT '[]' NOT NULL,
        LAUDOS_IMAGEM          CLOB                         DEFAULT '{}' NOT NULL,
        OBSERVACOES            CLOB,
        CREATED_AT             TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
        UPDATED_AT             TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,

        CONSTRAINT PK_EXAMES_LABORATORIAIS PRIMARY KEY (ID),
        CONSTRAINT FK_EXAMES_LAB_ORG FOREIGN KEY (ORGANIZACAO_ID)
          REFERENCES ORGANIZATIONS (ID),
        CONSTRAINT FK_EXAMES_LAB_PACIENTE FOREIGN KEY (PACIENTE_ID)
          REFERENCES PATIENTS (ID) ON DELETE CASCADE,
        CONSTRAINT FK_EXAMES_LAB_MEDICO FOREIGN KEY (MEDICO_ID)
          REFERENCES USERS (ID) ON DELETE SET NULL,
        CONSTRAINT CK_EXAMES_LAB_VALORES_JSON CHECK (VALORES IS JSON),
        CONSTRAINT CK_EXAMES_LAB_PERS_JSON CHECK (EXAMES_PERSONALIZADOS IS JSON),
        CONSTRAINT CK_EXAMES_LAB_LAUDOS_JSON CHECK (LAUDOS_IMAGEM IS JSON)
      )
    `);
    tabelaCriada = true;
  }

  await runIdempotentDdl(
    `CREATE INDEX IX_EXAMES_LAB_ORG_PAC_DATA ON EXAMES_LABORATORIAIS (ORGANIZACAO_ID, PACIENTE_ID, DATA_COLETA DESC)`,
  );
  await runIdempotentDdl(
    `CREATE INDEX IX_EXAMES_LAB_MEDICO ON EXAMES_LABORATORIAIS (MEDICO_ID)`,
  );

  return { tabelaCriada };
}

/**
 * Garante uma única verificação/criação por processo (singleton) sem custo em chamadas subsequentes.
 */
export async function ensureExamesLaboratoriaisSchema(): Promise<void> {
  if (!globalForExames.__endocExamesLabBootstrapPromise) {
    globalForExames.__endocExamesLabBootstrapPromise =
      executarBootstrapExamesLaboratoriais()
        .then(() => undefined)
        .catch((err) => {
          globalForExames.__endocExamesLabBootstrapPromise = undefined;
          throw err;
        });
  }
  return globalForExames.__endocExamesLabBootstrapPromise;
}
