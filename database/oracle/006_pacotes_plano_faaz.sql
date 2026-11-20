-- ============================================================================
-- MIGRATION 006 — CONTROLE DE PACOTES E CONSULTAS (PLANO FAAZ) — ORACLE ADB
-- ============================================================================
-- 100% aditiva e idempotente (ignora ORA-00955 / ORA-01408 caso já exista).
-- Complementa PATIENTS.PLANO_FAAZ (NUMBER(1) DEFAULT 0) com controle de ciclos
-- de acompanhamento (PACOTES_ACOMPANHAMENTO) e extrato de consultas efetuadas
-- (CONSULTAS_PACOTE), com fuso America/Sao_Paulo nas chaves YYYY-MM-DD.
-- ============================================================================

DECLARE
  PROCEDURE exec_if_missing(p_sql IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      -- ORA-00955: name is already used by an existing object
      -- ORA-01408: such column list already indexed
      IF SQLCODE NOT IN (-955, -1408) THEN
        RAISE;
      END IF;
  END;
BEGIN
  -- 1. PACOTES_ACOMPANHAMENTO (Ciclos de acompanhamento contratados no Plano FAAZ)
  exec_if_missing('
    CREATE TABLE PACOTES_ACOMPANHAMENTO (
      ID                  VARCHAR2(36 CHAR)            NOT NULL,
      PACIENTE_ID         VARCHAR2(36 CHAR)            NOT NULL,
      NOME_PLANO          VARCHAR2(120 CHAR)           NOT NULL,
      QTD_TOTAL_CONSULTAS NUMBER(4)                    NOT NULL,
      DATA_INICIO         VARCHAR2(10 CHAR)            NOT NULL,
      DATA_VALIDADE       VARCHAR2(10 CHAR),
      STATUS              VARCHAR2(20 CHAR)            DEFAULT ''ATIVO'' NOT NULL,
      OBSERVACOES         VARCHAR2(500 CHAR),
      CREATED_BY          VARCHAR2(120 CHAR),
      CREATED_AT          TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
      UPDATED_AT          TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,

      CONSTRAINT PK_PACOTES_ACOMPANHAMENTO PRIMARY KEY (ID),
      CONSTRAINT FK_PACOTES_ACOMP_PATIENT
        FOREIGN KEY (PACIENTE_ID) REFERENCES PATIENTS (ID) ON DELETE CASCADE,
      CONSTRAINT CK_PACOTES_ACOMP_QTD CHECK (QTD_TOTAL_CONSULTAS >= 1),
      CONSTRAINT CK_PACOTES_ACOMP_STATUS
        CHECK (STATUS IN (''ATIVO'', ''CONCLUIDO'', ''RENOVADO'', ''CANCELADO''))
    )
  ');

  exec_if_missing(
    'CREATE INDEX IX_PACOTES_PACIENTE_STATUS ON PACOTES_ACOMPANHAMENTO (PACIENTE_ID, STATUS)'
  );

  -- 2. CONSULTAS_PACOTE (Extrato de consultas realizadas / faltas cobradas / bonificadas)
  exec_if_missing('
    CREATE TABLE CONSULTAS_PACOTE (
      ID                VARCHAR2(36 CHAR)            NOT NULL,
      PACOTE_ID         VARCHAR2(36 CHAR)            NOT NULL,
      PACIENTE_ID       VARCHAR2(36 CHAR)            NOT NULL,
      DATA_CONSULTA     VARCHAR2(10 CHAR)            NOT NULL,
      HORA_CONSULTA     VARCHAR2(5 CHAR),
      TIPO              VARCHAR2(30 CHAR)            DEFAULT ''PRESENCIAL'' NOT NULL,
      STATUS            VARCHAR2(20 CHAR)            DEFAULT ''REALIZADA'' NOT NULL,
      PROFISSIONAL_NOME VARCHAR2(120 CHAR),
      EVOLUCAO_ID       VARCHAR2(36 CHAR),
      OBSERVACAO        VARCHAR2(400 CHAR),
      CREATED_AT        TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,

      CONSTRAINT PK_CONSULTAS_PACOTE PRIMARY KEY (ID),
      CONSTRAINT FK_CONS_PACOTE_PACOTE
        FOREIGN KEY (PACOTE_ID) REFERENCES PACOTES_ACOMPANHAMENTO (ID) ON DELETE CASCADE,
      CONSTRAINT FK_CONS_PACOTE_PATIENT
        FOREIGN KEY (PACIENTE_ID) REFERENCES PATIENTS (ID) ON DELETE CASCADE,
      CONSTRAINT CK_CONS_PACOTE_TIPO
        CHECK (TIPO IN (''PRESENCIAL'', ''ONLINE'', ''RETORNO'', ''AVALIACAO'')),
      CONSTRAINT CK_CONS_PACOTE_STATUS
        CHECK (STATUS IN (''REALIZADA'', ''FALTA_COBRADA'', ''BONIFICADA''))
    )
  ');

  exec_if_missing(
    'CREATE INDEX IX_CONS_PACOTE_PACOTE_DATA ON CONSULTAS_PACOTE (PACOTE_ID, DATA_CONSULTA)'
  );
END;
/
