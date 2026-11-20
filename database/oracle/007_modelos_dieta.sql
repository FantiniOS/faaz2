-- ============================================================================
-- MIGRATION 007 — BIBLIOTECA DE MODELOS DE REFEIÇÕES E PLANOS ALIMENTARES
-- ============================================================================
-- 100% aditiva e idempotente (ignora ORA-00955 / ORA-01408 caso já exista).
-- Armazena modelos reutilizáveis por refeição (ESCOPO = 'REFEICAO') ou dia
-- completo (ESCOPO = 'PLANO_COMPLETO') em CONTEUDO_JSON (CLOB inline via
-- oracledb.fetchAsString).
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
  exec_if_missing('
    CREATE TABLE MODELOS_DIETA (
      ID                 VARCHAR2(36 CHAR)            NOT NULL,
      ORGANIZATION_ID    VARCHAR2(36 CHAR),
      MEDICO_ID          VARCHAR2(36 CHAR),
      ESCOPO             VARCHAR2(20 CHAR)            NOT NULL,
      CATEGORIA_REFEICAO VARCHAR2(30 CHAR),
      TITULO             VARCHAR2(140 CHAR)           NOT NULL,
      OBJETIVO_TAG       VARCHAR2(30 CHAR)            DEFAULT ''GERAL'' NOT NULL,
      DESCRICAO          VARCHAR2(300 CHAR),
      CONTEUDO_JSON      CLOB                         NOT NULL,
      PADRAO_SISTEMA     NUMBER(1)                    DEFAULT 0 NOT NULL,
      CREATED_AT         TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
      UPDATED_AT         TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,

      CONSTRAINT PK_MODELOS_DIETA PRIMARY KEY (ID),
      CONSTRAINT CK_MODELOS_DIETA_ESCOPO
        CHECK (ESCOPO IN (''REFEICAO'', ''PLANO_COMPLETO'')),
      CONSTRAINT CK_MODELOS_DIETA_CAT
        CHECK (
          CATEGORIA_REFEICAO IS NULL OR
          CATEGORIA_REFEICAO IN (''DESJEJUM'', ''COLACAO'', ''ALMOCO'', ''LANCHE'', ''JANTAR'', ''CEIA'', ''GERAL'')
        ),
      CONSTRAINT CK_MODELOS_DIETA_OBJ
        CHECK (
          OBJETIVO_TAG IN (''EMAGRECIMENTO'', ''HIPERTROFIA'', ''CONTROLE_GLICEMICO'', ''MANUTENCAO'', ''GERAL'')
        ),
      CONSTRAINT CK_MODELOS_DIETA_PADRAO
        CHECK (PADRAO_SISTEMA IN (0, 1))
    )
  ');

  exec_if_missing(
    'CREATE INDEX IX_MODELOS_DIETA_ESC_CAT ON MODELOS_DIETA (ESCOPO, CATEGORIA_REFEICAO)'
  );
END;
/
