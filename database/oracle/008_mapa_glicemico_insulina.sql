-- ============================================================================
-- MIGRATION 008 — MAPA GLICÊMICO & CONTROLE DE INSULINA (POR PACIENTE)
-- ============================================================================
-- 100% aditiva e idempotente (ignora ORA-00955 / ORA-01408 / ORA-01430 / ORA-02264).
-- 1. PROTOCOLOS_GLICEMICOS (1:1 por paciente — chaves ATIVO e USA_INSULINA).
-- 2. Colunas aditivas MOMENTO_CLINICO e CONTEXTO_TAGS em REGISTROS_GLICEMIA.
-- 3. REGISTROS_INSULINA + índice IX_REG_INSULINA_PAC_DIA (PACIENTE_ID, DATA_DIA).
-- ============================================================================

DECLARE
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
  -- 1. Nova tabela PROTOCOLOS_GLICEMICOS (1:1 com PATIENTS)
  exec_idempotent('
    CREATE TABLE PROTOCOLOS_GLICEMICOS (
      PACIENTE_ID             VARCHAR2(36 CHAR)           NOT NULL,
      ATIVO                   NUMBER(1)                   DEFAULT 0 NOT NULL,
      USA_INSULINA            NUMBER(1)                   DEFAULT 0 NOT NULL,
      MODO                    VARCHAR2(25 CHAR)           DEFAULT ''LIVRE'' NOT NULL,
      SLOTS_ATIVOS            VARCHAR2(200 CHAR),
      ALVO_JEJUM_MIN          NUMBER(4)                   DEFAULT 70 NOT NULL,
      ALVO_JEJUM_MAX          NUMBER(4)                   DEFAULT 130 NOT NULL,
      ALVO_POS_MAX            NUMBER(4)                   DEFAULT 180 NOT NULL,
      INSULINA_BASAL_NOME     VARCHAR2(80 CHAR),
      INSULINA_BASAL_DOSE_REF NUMBER(6,2),
      INSULINA_BASAL_HORARIO  VARCHAR2(30 CHAR),
      INSULINA_RAPIDA_NOME    VARCHAR2(80 CHAR),
      ORIENTACAO_HIPO         VARCHAR2(300 CHAR),
      ORIENTACAO_HIPER        VARCHAR2(300 CHAR),
      UPDATED_AT              TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,

      CONSTRAINT PK_PROTOCOLOS_GLICEMICOS PRIMARY KEY (PACIENTE_ID),
      CONSTRAINT FK_PROT_GLIC_PACIENTE FOREIGN KEY (PACIENTE_ID)
        REFERENCES PATIENTS (ID) ON DELETE CASCADE,
      CONSTRAINT CK_PROT_GLIC_ATIVO CHECK (ATIVO IN (0, 1)),
      CONSTRAINT CK_PROT_GLIC_INSULINA CHECK (USA_INSULINA IN (0, 1)),
      CONSTRAINT CK_PROT_GLIC_MODO CHECK (
        MODO IN (''LIVRE'', ''JEJUM'', ''PAREADO'', ''MAPA_COMPLETO'', ''PERSONALIZADO'')
      )
    )
  ');

  -- 2. Colunas aditivas opcionais em REGISTROS_GLICEMIA
  exec_idempotent(
    'ALTER TABLE REGISTROS_GLICEMIA ADD (MOMENTO_CLINICO VARCHAR2(20 CHAR))'
  );
  exec_idempotent(
    'ALTER TABLE REGISTROS_GLICEMIA ADD (CONTEXTO_TAGS VARCHAR2(200 CHAR))'
  );

  -- 3. Nova tabela REGISTROS_INSULINA
  exec_idempotent('
    CREATE TABLE REGISTROS_INSULINA (
      ID                   VARCHAR2(36 CHAR)           NOT NULL,
      PACIENTE_ID          VARCHAR2(36 CHAR)           NOT NULL,
      REGISTRO_GLICEMIA_ID VARCHAR2(36 CHAR),
      DATA_DIA             VARCHAR2(10 CHAR)           NOT NULL,
      APLICADO_EM          TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
      TIPO                 VARCHAR2(15 CHAR)           NOT NULL,
      NOME_INSULINA        VARCHAR2(80 CHAR),
      UNIDADES             NUMBER(6,2)                 NOT NULL,
      MOMENTO_CLINICO      VARCHAR2(20 CHAR),
      OBSERVACAO           VARCHAR2(200 CHAR),

      CONSTRAINT PK_REGISTROS_INSULINA PRIMARY KEY (ID),
      CONSTRAINT FK_REG_INSULINA_PACIENTE FOREIGN KEY (PACIENTE_ID)
        REFERENCES PATIENTS (ID) ON DELETE CASCADE,
      CONSTRAINT FK_REG_INSULINA_GLICEMIA FOREIGN KEY (REGISTRO_GLICEMIA_ID)
        REFERENCES REGISTROS_GLICEMIA (ID) ON DELETE SET NULL,
      CONSTRAINT CK_REG_INSULINA_TIPO CHECK (TIPO IN (''BASAL'', ''RAPIDA''))
    )
  ');

  exec_idempotent(
    'CREATE INDEX IX_REG_INSULINA_PAC_DIA ON REGISTROS_INSULINA (PACIENTE_ID, DATA_DIA)'
  );
END;
/
