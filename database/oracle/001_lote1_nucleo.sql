-- ============================================================================
-- ENDOC / CLÍNICA FAAZ — DDL ORACLE AUTONOMOUS DATABASE — LOTE 1 (NÚCLEO)
-- ============================================================================
-- Tabelas: ORGANIZATIONS, USERS, PATIENTS  (models 1, 2 e 3 do antigo schema.prisma)
-- Executar conectado como o usuário/schema da aplicação (SQL Developer Web,
-- Database Actions ou SQLcl), NA ORDEM deste arquivo.
--
-- Convenções de conversão PostgreSQL → Oracle (valem para todos os lotes):
--   UUID (@db.Uuid)          → VARCHAR2(36 CHAR)      UUID v4 gerado pela aplicação
--   VARCHAR(n)               → VARCHAR2(n CHAR)       semântica de caractere (acentos)
--   TEXT                     → CLOB
--   TIMESTAMPTZ(6)           → TIMESTAMP(6) WITH TIME ZONE
--   DATE                     → DATE
--   DECIMAL(p,s)             → NUMBER(p,s)
--   INTEGER                  → NUMBER(10)
--   DOUBLE PRECISION (Float) → BINARY_DOUBLE
--   BOOLEAN                  → NUMBER(1) + CHECK (0,1)          (compatível 19c/23ai)
--   JSON / JSONB             → CLOB + CHECK (IS JSON)            (compatível 19c/23ai)
--   String[] (array)         → CLOB com array JSON + CHECK (IS JSON)
--   ENUM                     → VARCHAR2 + CHECK (valores idênticos ao PostgreSQL)
--   ON DELETE RESTRICT       → FK sem cláusula (comportamento padrão do Oracle)
--   Nomes sem aspas          → armazenados em MAIÚSCULAS (as entidades TypeORM usam MAIÚSCULAS)
--
-- Diferenças de comportamento tratadas aqui:
--   • '' = NULL no Oracle: colunas "NOT NULL DEFAULT ''" viram anuláveis
--     (ex.: PATIENTS.PHONE_WHATSAPP; a entidade devolve '' ao código).
--   • UNIQUE composto com NULL: no Oracle, (org, NULL) repetido VIOLA a constraint;
--     no PostgreSQL não. Por isso (ORGANIZATION_ID, CPF) usa índice baseado em função.
--   • Palavras reservadas: PATIENTS."number" → ADDRESS_NUMBER.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. ORGANIZATIONS (Clínica / Unidade Contratante)
-- ----------------------------------------------------------------------------
CREATE TABLE ORGANIZATIONS (
  ID                 VARCHAR2(36 CHAR)            NOT NULL,
  SLUG               VARCHAR2(80 CHAR)            NOT NULL,
  LEGAL_NAME         VARCHAR2(200 CHAR)           NOT NULL,
  TRADE_NAME         VARCHAR2(150 CHAR)           NOT NULL,
  TAX_ID             VARCHAR2(20 CHAR)            NOT NULL,
  PRIMARY_COLOR_HEX  VARCHAR2(7 CHAR)             DEFAULT '#059669' NOT NULL,
  LOGO_STORAGE_KEY   VARCHAR2(255 CHAR),
  ENABLED_MODULES    CLOB                         DEFAULT '{}' NOT NULL,
  ROLE_PERMISSIONS   CLOB                         DEFAULT '{}',
  STATUS             VARCHAR2(20 CHAR)            DEFAULT 'ACTIVE' NOT NULL,
  -- Rastreabilidade e Soft Delete
  CREATED_AT         TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  UPDATED_AT         TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  DELETED_AT         TIMESTAMP(6) WITH TIME ZONE,
  CREATED_BY         VARCHAR2(36 CHAR),
  UPDATED_BY         VARCHAR2(36 CHAR),

  CONSTRAINT PK_ORGANIZATIONS PRIMARY KEY (ID),
  CONSTRAINT UQ_ORGANIZATIONS_SLUG UNIQUE (SLUG),
  CONSTRAINT UQ_ORGANIZATIONS_TAX_ID UNIQUE (TAX_ID),
  CONSTRAINT CK_ORGANIZATIONS_STATUS
    CHECK (STATUS IN ('ACTIVE', 'MAINTENANCE', 'SUSPENDED')),
  CONSTRAINT CK_ORGANIZATIONS_ENABLED_MODULES CHECK (ENABLED_MODULES IS JSON),
  CONSTRAINT CK_ORGANIZATIONS_ROLE_PERMISSIONS CHECK (ROLE_PERMISSIONS IS JSON)
);


-- ----------------------------------------------------------------------------
-- 2. USERS (Profissionais, Administradores, Equipe e Conta Paciente)
-- ----------------------------------------------------------------------------
CREATE TABLE USERS (
  ID                       VARCHAR2(36 CHAR)            NOT NULL,
  ORGANIZATION_ID          VARCHAR2(36 CHAR)            NOT NULL,
  TITLE                    VARCHAR2(20 CHAR),
  FULL_NAME                VARCHAR2(160 CHAR)           NOT NULL,
  USERNAME                 VARCHAR2(60 CHAR)            NOT NULL,
  EMAIL                    VARCHAR2(160 CHAR),
  PASSWORD_HASH            VARCHAR2(255 CHAR)           NOT NULL,
  ROLE                     VARCHAR2(20 CHAR)            NOT NULL,
  CARGO                    VARCHAR2(20 CHAR)            DEFAULT 'DONO_CLINICA' NOT NULL,
  PODE_ACESSAR_PRONTUARIO  NUMBER(1)                    DEFAULT 1 NOT NULL,
  COUNCIL_TYPE             VARCHAR2(20 CHAR),
  COUNCIL_NUMBER           VARCHAR2(40 CHAR),
  SPECIALTY                VARCHAR2(100 CHAR),
  ROOM_NUMBER              VARCHAR2(50 CHAR),
  IS_CLINICAL              NUMBER(1)                    DEFAULT 0 NOT NULL,
  MFA_ENABLED              NUMBER(1)                    DEFAULT 0 NOT NULL,
  MFA_SECRET_ENCRYPTED     CLOB,
  ACCOUNT_STATUS           VARCHAR2(20 CHAR)            DEFAULT 'ACTIVE' NOT NULL,
  MUST_CHANGE_PASSWORD     NUMBER(1)                    DEFAULT 1 NOT NULL,
  LAST_LOGIN_AT            TIMESTAMP(6) WITH TIME ZONE,
  -- Rastreabilidade e Soft Delete
  CREATED_AT               TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  UPDATED_AT               TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  DELETED_AT               TIMESTAMP(6) WITH TIME ZONE,
  CREATED_BY               VARCHAR2(36 CHAR),
  UPDATED_BY               VARCHAR2(36 CHAR),

  CONSTRAINT PK_USERS PRIMARY KEY (ID),
  CONSTRAINT UQ_USERS_USERNAME UNIQUE (USERNAME),
  CONSTRAINT UQ_USERS_EMAIL UNIQUE (EMAIL),
  CONSTRAINT FK_USERS_ORGANIZATION
    FOREIGN KEY (ORGANIZATION_ID) REFERENCES ORGANIZATIONS (ID),
  CONSTRAINT CK_USERS_ROLE CHECK (ROLE IN (
    'SUPER_ADMIN', 'CLINIC_ADMIN', 'ADMIN', 'DOCTOR',
    'NUTRITIONIST', 'RECEPTIONIST', 'STAFF', 'PATIENT')),
  CONSTRAINT CK_USERS_CARGO
    CHECK (CARGO IN ('DONO_CLINICA', 'MEDICO', 'SECRETARIA', 'ADMINISTRADOR')),
  CONSTRAINT CK_USERS_ACCOUNT_STATUS
    CHECK (ACCOUNT_STATUS IN ('PENDING_INVITE', 'ACTIVE', 'REVOKED', 'LOCKED')),
  CONSTRAINT CK_USERS_PODE_ACESSAR_PRONT CHECK (PODE_ACESSAR_PRONTUARIO IN (0, 1)),
  CONSTRAINT CK_USERS_IS_CLINICAL CHECK (IS_CLINICAL IN (0, 1)),
  CONSTRAINT CK_USERS_MFA_ENABLED CHECK (MFA_ENABLED IN (0, 1)),
  CONSTRAINT CK_USERS_MUST_CHANGE_PASSWORD CHECK (MUST_CHANGE_PASSWORD IN (0, 1))
);

CREATE INDEX IX_USERS_ORG_ROLE ON USERS (ORGANIZATION_ID, ROLE);


-- ----------------------------------------------------------------------------
-- 3. PATIENTS (Cadastro Clínico e Demográfico de Pacientes)
-- ----------------------------------------------------------------------------
CREATE TABLE PATIENTS (
  ID                           VARCHAR2(36 CHAR)            NOT NULL,
  ORGANIZATION_ID              VARCHAR2(36 CHAR)            NOT NULL,
  USER_ID                      VARCHAR2(36 CHAR),
  RECORD_CODE                  VARCHAR2(40 CHAR)            NOT NULL,
  FULL_NAME                    VARCHAR2(160 CHAR)           NOT NULL,
  SOCIAL_NAME                  VARCHAR2(160 CHAR),
  CPF                          VARCHAR2(14 CHAR),
  RG                           VARCHAR2(20 CHAR),
  BIRTH_DATE                   DATE,
  BIOLOGICAL_SEX               VARCHAR2(10 CHAR),
  ESTADO_CIVIL                 VARCHAR2(30 CHAR),
  PROFISSAO                    VARCHAR2(100 CHAR),
  CONVENIO                     VARCHAR2(50 CHAR)            DEFAULT 'Particular' NOT NULL,
  PLANO_FAAZ                   NUMBER(1)                    DEFAULT 0 NOT NULL,
  HEIGHT_CM                    NUMBER(5, 2),
  PHONE_WHATSAPP               VARCHAR2(30 CHAR),           -- era NOT NULL DEFAULT '' ('' = NULL no Oracle)
  TELEFONE_SECUNDARIO          VARCHAR2(30 CHAR),
  EMAIL                        VARCHAR2(160 CHAR),
  CONTATO_EMERGENCIA_NOME      VARCHAR2(160 CHAR),
  CONTATO_EMERGENCIA_TELEFONE  VARCHAR2(30 CHAR),
  PHOTO_URL                    CLOB,
  AVATAR_URL                   CLOB,
  CLINICAL_FOCUS               VARCHAR2(200 CHAR),
  TREATMENT_OBJECTIVE          VARCHAR2(200 CHAR),
  -- Diretrizes de Atividade Física / Treinos (Habit Tracker)
  WORKOUT_TYPE                 VARCHAR2(100 CHAR),
  WORKOUT_FREQUENCY            NUMBER(10),
  WORKOUT_DURATION             NUMBER(10),
  WORKOUT_RESTRICTIONS         CLOB,
  -- Endereço Residencial (ViaCEP)
  ZIP_CODE                     VARCHAR2(10 CHAR),
  STREET                       VARCHAR2(200 CHAR),
  ADDRESS_NUMBER               VARCHAR2(30 CHAR),           -- era "number" (palavra reservada)
  COMPLEMENT                   VARCHAR2(100 CHAR),
  NEIGHBORHOOD                 VARCHAR2(100 CHAR),
  CITY                         VARCHAR2(100 CHAR),
  STATE                        VARCHAR2(2 CHAR),

  PRIMARY_DOCTOR_ID            VARCHAR2(36 CHAR),
  PRIMARY_NUTRITIONIST_ID      VARCHAR2(36 CHAR),
  META_DIARIA_ML               NUMBER(10)                   DEFAULT 2500 NOT NULL,
  PATIENT_STATUS               VARCHAR2(20 CHAR)            DEFAULT 'ACTIVE' NOT NULL,
  ACTIVE_MODULES               CLOB                         DEFAULT '[]' NOT NULL,  -- era String[]
  -- Rastreabilidade e Soft Delete
  CREATED_AT                   TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  UPDATED_AT                   TIMESTAMP(6) WITH TIME ZONE  DEFAULT SYSTIMESTAMP NOT NULL,
  DELETED_AT                   TIMESTAMP(6) WITH TIME ZONE,
  CREATED_BY                   VARCHAR2(36 CHAR),
  UPDATED_BY                   VARCHAR2(36 CHAR),

  CONSTRAINT PK_PATIENTS PRIMARY KEY (ID),
  CONSTRAINT UQ_PATIENTS_USER_ID UNIQUE (USER_ID),
  CONSTRAINT UQ_PATIENTS_RECORD_CODE UNIQUE (RECORD_CODE),
  CONSTRAINT FK_PATIENTS_ORGANIZATION
    FOREIGN KEY (ORGANIZATION_ID) REFERENCES ORGANIZATIONS (ID),
  CONSTRAINT FK_PATIENTS_USER
    FOREIGN KEY (USER_ID) REFERENCES USERS (ID) ON DELETE SET NULL,
  CONSTRAINT FK_PATIENTS_PRIMARY_DOCTOR
    FOREIGN KEY (PRIMARY_DOCTOR_ID) REFERENCES USERS (ID) ON DELETE SET NULL,
  CONSTRAINT FK_PATIENTS_PRIMARY_NUTRITIONIST
    FOREIGN KEY (PRIMARY_NUTRITIONIST_ID) REFERENCES USERS (ID) ON DELETE SET NULL,
  CONSTRAINT CK_PATIENTS_BIOLOGICAL_SEX
    CHECK (BIOLOGICAL_SEX IN ('FEMALE', 'MALE', 'OTHER')),
  CONSTRAINT CK_PATIENTS_PATIENT_STATUS
    CHECK (PATIENT_STATUS IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  CONSTRAINT CK_PATIENTS_PLANO_FAAZ CHECK (PLANO_FAAZ IN (0, 1)),
  CONSTRAINT CK_PATIENTS_ACTIVE_MODULES CHECK (ACTIVE_MODULES IS JSON)
);

-- @@unique([organizationId, cpf]) — só indexa linhas com CPF preenchido,
-- reproduzindo o comportamento do PostgreSQL (vários pacientes sem CPF na mesma clínica).
CREATE UNIQUE INDEX UQ_PATIENTS_ORG_CPF ON PATIENTS (
  CASE WHEN CPF IS NOT NULL THEN ORGANIZATION_ID END,
  CPF
);

CREATE INDEX IX_PATIENTS_ORG_FULL_NAME ON PATIENTS (ORGANIZATION_ID, FULL_NAME);
-- Índices em FKs (o Oracle não os cria automaticamente; evita locks em DELETE/UPDATE de USERS)
CREATE INDEX IX_PATIENTS_PRIMARY_DOCTOR ON PATIENTS (PRIMARY_DOCTOR_ID);
CREATE INDEX IX_PATIENTS_PRIMARY_NUTRITIONIST ON PATIENTS (PRIMARY_NUTRITIONIST_ID);


-- ----------------------------------------------------------------------------
-- ROLLBACK DO LOTE 1 (somente se precisar recriar do zero — APAGA DADOS)
-- ----------------------------------------------------------------------------
-- DROP TABLE PATIENTS CASCADE CONSTRAINTS PURGE;
-- DROP TABLE USERS CASCADE CONSTRAINTS PURGE;
-- DROP TABLE ORGANIZATIONS CASCADE CONSTRAINTS PURGE;
