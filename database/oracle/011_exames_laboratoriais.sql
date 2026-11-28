-- ============================================================================
-- MIGRATION 011 — MÓDULO DE EXAMES LABORATORIAIS & LAUDOS (CLÍNICA FAAZ)
-- ============================================================================
-- 100% aditiva e idempotente para Oracle Autonomous Database (19c / 23ai).
-- Verifica USER_TABLES e trata ORA-00955 / ORA-01408 / ORA-02264 com segurança.
-- NÃO executa DROP/TRUNCATE nem altera nenhuma tabela ou dado existente.
--
-- Cria:
--   1. Tabela EXAMES_LABORATORIAIS (lotes de exames e laudos por data de coleta)
--   2. Índice composto IX_EXAMES_LAB_ORG_PAC_DATA (ORGANIZACAO_ID, PACIENTE_ID, DATA_COLETA DESC)
--   3. Índice de FK IX_EXAMES_LAB_PACIENTE (PACIENTE_ID) para evitar locks em DELETE/UPDATE
-- ============================================================================

DECLARE
  v_table_count NUMBER := 0;

  PROCEDURE exec_idempotent(p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      -- ORA-00955: name is already used by an existing object
      -- ORA-01408: such column list already indexed
      -- ORA-01430: column being added already exists in table
      -- ORA-02264: name already used by an existing constraint
      IF SQLCODE NOT IN (-955, -1408, -1430, -2264) THEN
        RAISE;
      END IF;
  END;
BEGIN
  SELECT COUNT(*)
    INTO v_table_count
    FROM USER_TABLES
   WHERE TABLE_NAME = 'EXAMES_LABORATORIAIS';

  IF v_table_count = 0 THEN
    exec_idempotent('
      CREATE TABLE EXAMES_LABORATORIAIS (
        ID                     VARCHAR2(36 CHAR)            NOT NULL,
        ORGANIZACAO_ID         VARCHAR2(36 CHAR)            NOT NULL,
        PACIENTE_ID            VARCHAR2(36 CHAR)            NOT NULL,
        MEDICO_ID              VARCHAR2(36 CHAR),
        DATA_COLETA            DATE                         NOT NULL,
        LABORATORIO            VARCHAR2(160 CHAR),
        VALORES                CLOB                         DEFAULT ''{}'' NOT NULL,
        EXAMES_PERSONALIZADOS  CLOB                         DEFAULT ''[]'' NOT NULL,
        LAUDOS_IMAGEM          CLOB                         DEFAULT ''{}'' NOT NULL,
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
    ');
  END IF;

  -- Índice principal para listagem comparativa por organização, paciente e data de coleta
  exec_idempotent(
    'CREATE INDEX IX_EXAMES_LAB_ORG_PAC_DATA ON EXAMES_LABORATORIAIS (ORGANIZACAO_ID, PACIENTE_ID, DATA_COLETA DESC)'
  );

  -- Índice auxiliar de FK para integridade sem lock em operações sobre PATIENTS/USERS
  exec_idempotent(
    'CREATE INDEX IX_EXAMES_LAB_MEDICO ON EXAMES_LABORATORIAIS (MEDICO_ID)'
  );
END;
/
