-- ============================================================================
-- MIGRATION 005 — ÍNDICES ADITIVOS DE PERFORMANCE (ORACLE ADB)
-- Clínica FAAZ — Otimização de leituras clínicas e telemetria do Dashboard
-- ============================================================================
-- 100% aditiva e idempotente (ignora ORA-00955 / ORA-01408 caso já exista).
-- Complementa os índices existentes por (PACIENTE_ID, DATA) com índices globais
-- por data/status usados nas consultas consolidadas do Command Center e listagens.

DECLARE
  PROCEDURE create_idx_if_missing(p_sql IN VARCHAR2) IS
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
  -- 1. Check-ins de refeições por período global (Command Center + Telemetria)
  create_idx_if_missing(
    'CREATE INDEX IX_CHECKINS_REF_DATA_DIA ON CHECKINS_REFEICOES (DATA_DIA DESC)'
  );

  -- 2. Check-ins intestinais (Escala de Bristol) por período global
  create_idx_if_missing(
    'CREATE INDEX IX_CHECKINS_INT_DATA ON CHECKINS_INTESTINAIS (DATA DESC)'
  );

  -- 3. Check-ins de hidratação por período global
  create_idx_if_missing(
    'CREATE INDEX IX_CHECKINS_HID_DATA ON CHECKINS_HIDRATACAO (DATA DESC)'
  );

  -- 4. Check-ins de sono por período global (evasão 7d)
  create_idx_if_missing(
    'CREATE INDEX IX_SONO_DATA ON CHECKINS_SONO (DATA DESC)'
  );

  -- 5. Treinos (WORKOUT_LOGS) por data global
  create_idx_if_missing(
    'CREATE INDEX IX_WORKOUT_LOG_DATE ON WORKOUT_LOGS (LOG_DATE DESC)'
  );

  -- 6. Biometria (peso/IMC) por data global (impacto corporal e pulso)
  create_idx_if_missing(
    'CREATE INDEX IX_BIOM_MEASURED_AT ON BIOMETRIC_MEASUREMENTS (MEASURED_AT DESC)'
  );

  -- 7. Medidas corporais (fita métrica) por data global
  create_idx_if_missing(
    'CREATE INDEX IX_MEAS_MEASURED_AT ON MEASUREMENTS (MEASURED_AT DESC)'
  );

  -- 8. Evoluções clínicas por data de atendimento global
  create_idx_if_missing(
    'CREATE INDEX IX_EVOL_DATA_ATEND ON EVOLUCOES_CLINICAS (DATA_ATENDIMENTO DESC)'
  );

  -- 9. Listagem de pacientes ativos não-excluídos ordenados por nome
  create_idx_if_missing(
    'CREATE INDEX IX_PATIENTS_STATUS_DEL_NAME ON PATIENTS (PATIENT_STATUS, DELETED_AT, FULL_NAME)'
  );

  -- 10. Metas ativas globais (hidratação / biomarcadores)
  create_idx_if_missing(
    'CREATE INDEX IX_GOALS_STATUS_DEL_PAT ON PATIENT_GOALS (STATUS, DELETED_AT, PATIENT_ID)'
  );
END;
/
