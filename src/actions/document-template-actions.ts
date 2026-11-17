"use server";

import { revalidatePath } from "next/cache";
import { In, IsNull } from "typeorm";
import { z } from "zod";
import { getRepository } from "@/lib/db/data-source";
import { DocumentTemplateEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import {
  type DocumentTemplateCategory,
  type DocumentTemplateDTO,
  STARTER_DOCUMENT_TEMPLATES,
  getCategoryQueryAliases,
  toTemplateCategory,
} from "@/lib/document-template-types";

export interface GetDocumentTemplatesResult {
  success: boolean;
  templates: DocumentTemplateDTO[];
  error?: string;
}

export interface SaveDocumentTemplateInput {
  title: string;
  content: string;
  category: string;
  documentTitle?: string | null;
}

export interface SaveDocumentTemplateResult {
  success: boolean;
  template?: DocumentTemplateDTO;
  error?: string;
}

const SaveTemplateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(160, "O nome do modelo deve ter no máximo 160 caracteres."),
  content: z
    .string()
    .trim()
    .min(1, "O texto clínico não pode ficar vazio para salvar um modelo."),
  category: z.string().trim().min(1, "Categoria obrigatória."),
  documentTitle: z
    .string()
    .trim()
    .max(200, "O título do documento deve ter no máximo 200 caracteres.")
    .nullable()
    .optional(),
});

function toDTO(row: {
  id: string;
  title: string;
  content: string;
  category: string;
  documentTitle: string | null;
  createdAt: Date;
}): DocumentTemplateDTO {
  let category: DocumentTemplateCategory = "RECEITA";
  try {
    category = toTemplateCategory(row.category);
  } catch {
    category = "RECEITA";
  }

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category,
    documentTitle: row.documentTitle,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

async function ensureStarterTemplatesSeeded(): Promise<void> {
  const repo = await getRepository(DocumentTemplateEntity);
  const total = await repo.count();
  if (total > 0) return;

  const baseMs = Date.now();
  const entities = STARTER_DOCUMENT_TEMPLATES.map((tpl, idx) =>
    repo.create({
      title: tpl.title,
      content: tpl.content,
      category: tpl.category,
      documentTitle: tpl.documentTitle,
      organizationId: null,
      createdBy: null,
      createdAt: new Date(baseMs + idx * 10),
    }),
  );
  await repo.save(entities);
}

/**
 * Carrega todos os modelos salvos (opcionalmente filtrados por categoria) para o emissor de documentos.
 */
export async function getDocumentTemplates(
  category?: string,
): Promise<GetDocumentTemplatesResult> {
  try {
    const sessao = await getSessao();
    if (!sessao) {
      return {
        success: false,
        templates: [],
        error: "Sessão expirada. Faça login novamente para carregar modelos.",
      };
    }

    if (!podeAcessarDadosClinicos(sessao.cargo)) {
      return {
        success: false,
        templates: [],
        error: "Acesso negado aos modelos clínicos.",
      };
    }

    await ensureStarterTemplatesSeeded();

    let aliases: string[] | undefined;
    if (category?.trim()) {
      const normalized = toTemplateCategory(category);
      aliases = getCategoryQueryAliases(normalized);
    }

    const repo = await getRepository(DocumentTemplateEntity);
    const categoryClause = aliases ? { category: In(aliases) } : {};

    const rows = await repo.find({
      where: sessao.organizationId
        ? [
            { ...categoryClause, organizationId: sessao.organizationId },
            { ...categoryClause, organizationId: IsNull() },
          ]
        : categoryClause,
      order: { createdAt: "ASC", id: "ASC" },
    });

    return {
      success: true,
      templates: rows.map(toDTO),
    };
  } catch (err: unknown) {
    console.error("[DOCUMENT_TEMPLATE/GET] Erro ao carregar modelos:", err);
    return {
      success: false,
      templates: [],
      error:
        err instanceof Error
          ? err.message
          : "Erro inesperado ao carregar modelos salvos.",
    };
  }
}

/**
 * Persiste o texto clínico atual como novo DocumentTemplate na categoria ativa e revalida a rota.
 */
export async function saveDocumentTemplate(
  input: SaveDocumentTemplateInput,
): Promise<SaveDocumentTemplateResult> {
  try {
    const sessao = await getSessao();
    if (!sessao) {
      return {
        success: false,
        error: "Sessão expirada. Faça login novamente para salvar o modelo.",
      };
    }

    if (!podeAcessarDadosClinicos(sessao.cargo)) {
      return {
        success: false,
        error: "Acesso negado. Apenas médicos podem salvar modelos clínicos.",
      };
    }

    const parsed = SaveTemplateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Dados do modelo inválidos.",
      };
    }

    const canonicalCategory = toTemplateCategory(parsed.data.category);

    await ensureStarterTemplatesSeeded();

    const repo = await getRepository(DocumentTemplateEntity);
    const created = await repo.save(
      repo.create({
        title: parsed.data.title,
        content: parsed.data.content,
        category: canonicalCategory,
        documentTitle: parsed.data.documentTitle || null,
        organizationId: sessao.organizationId ?? null,
        createdBy: sessao.userId,
      }),
    );

    revalidatePath("/dashboard/pacientes");

    return {
      success: true,
      template: toDTO(created),
    };
  } catch (err: unknown) {
    console.error("[DOCUMENT_TEMPLATE/SAVE] Erro ao salvar modelo:", err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Erro inesperado ao salvar modelo clínico.",
    };
  }
}
