-- ============================================================================
-- MIGRATION 010 — ACEITE ÚNICO DE TERMOS DE USO E PRIVACIDADE (LGPD / CFM)
-- ============================================================================
-- 100% aditiva e idempotente (verifica USER_TAB_COLUMNS antes de alterar).
-- Adiciona em PATIENTS:
--   1. TERMOS_VERSAO_ACEITA  VARCHAR2(20 CHAR) NULL  (ex.: '1.0')
--   2. TERMOS_ACEITO_EM      TIMESTAMP(6) WITH TIME ZONE NULL
-- ============================================================================

DECLARE
  v_count NUMBER := 0;
BEGIN
  SELECT COUNT(*)
    INTO v_count
    FROM USER_TAB_COLUMNS
   WHERE TABLE_NAME = 'PATIENTS'
     AND COLUMN_NAME = 'TERMOS_VERSAO_ACEITA';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE PATIENTS ADD (TERMOS_VERSAO_ACEITA VARCHAR2(20 CHAR) NULL)';
  END IF;

  SELECT COUNT(*)
    INTO v_count
    FROM USER_TAB_COLUMNS
   WHERE TABLE_NAME = 'PATIENTS'
     AND COLUMN_NAME = 'TERMOS_ACEITO_EM';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE PATIENTS ADD (TERMOS_ACEITO_EM TIMESTAMP(6) WITH TIME ZONE NULL)';
  END IF;
END;
/
