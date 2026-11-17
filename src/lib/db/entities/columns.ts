import type { EntitySchemaColumnOptions, ValueTransformer } from "typeorm";

// ============================================================================
// HELPERS DE COLUNA — convenções Oracle compartilhadas por todas as entidades
// ============================================================================
// • Nomes de tabela/coluna em MAIÚSCULAS: o TypeORM envolve identificadores em
//   aspas duplas no Oracle (case-sensitive), e o DDL cria objetos sem aspas
//   (que o Oracle armazena em maiúsculas). Os dois precisam bater.
// • O schema é gerenciado pelo DDL em database/oracle/*.sql (synchronize: false).

/** Chave primária UUID (VARCHAR2(36)). O TypeORM gera o UUID v4 no Node. */
export const uuidPrimary: EntitySchemaColumnOptions = {
  name: "ID",
  type: "varchar2",
  length: 36,
  primary: true,
  generated: "uuid",
};

/** Referência UUID para outra tabela (FK). */
export function uuidRef(name: string, nullable = false): EntitySchemaColumnOptions {
  return { name, type: "varchar2", length: 36, nullable };
}

export function varchar(name: string, length: number, nullable = false): EntitySchemaColumnOptions {
  return { name, type: "varchar2", length, nullable };
}

export function clob(name: string, nullable = true): EntitySchemaColumnOptions {
  return { name, type: "clob", nullable };
}

/** TIMESTAMP(6) WITH TIME ZONE — equivalente direto ao Timestamptz(6) do PostgreSQL. */
export function timestampTz(name: string, nullable = false): EntitySchemaColumnOptions {
  return { name, type: "timestamp with time zone", precision: 6, nullable };
}

/** NUMBER(p,s). Usar o tipo string "number" evita o parseInt que o driver aplica ao tipo Number. */
export function decimal(
  name: string,
  precision: number,
  scale: number,
  nullable = false,
): EntitySchemaColumnOptions {
  return { name, type: "number", precision, scale, nullable };
}

export function integer(name: string, nullable = false): EntitySchemaColumnOptions {
  return { name, type: "number", precision: 10, scale: 0, nullable };
}

/** Ponto flutuante (BINARY_DOUBLE / FLOAT no Oracle) sem truncamento de casas decimais. */
export function float(name: string, nullable = true): EntitySchemaColumnOptions {
  return { name, type: "float", nullable };
}

/** NUMBER(1) 0/1 ↔ boolean (conversão feita pelo driver Oracle do TypeORM). */
export function bool(name: string): EntitySchemaColumnOptions {
  return { name, type: Boolean, nullable: false };
}

/** CLOB com CHECK (IS JSON) ↔ objeto/array JS (serialização feita pelo TypeORM). */
export function json(name: string, nullable = false): EntitySchemaColumnOptions {
  return { name, type: "simple-json", nullable };
}

/**
 * No Oracle, string vazia ('') é gravada como NULL. Colunas que o PostgreSQL
 * tratava como NOT NULL DEFAULT '' viram anuláveis no DDL, e este transformer
 * devolve '' para o código, preservando o contrato antigo da API.
 */
export const emptyStringAsNull: ValueTransformer = {
  to: (value: string | null | undefined) => (value === "" ? null : value),
  from: (value: string | null) => value ?? "",
};

/** Colunas obrigatórias de Rastreabilidade e Soft Delete. */
export const auditColumns = {
  createdAt: { ...timestampTz("CREATED_AT"), createDate: true },
  updatedAt: { ...timestampTz("UPDATED_AT"), updateDate: true },
  deletedAt: timestampTz("DELETED_AT", true),
  createdBy: uuidRef("CREATED_BY", true),
  updatedBy: uuidRef("UPDATED_BY", true),
} satisfies Record<string, EntitySchemaColumnOptions>;

export interface AuditFields {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
}
