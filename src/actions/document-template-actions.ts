"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
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
    createdAt: row.createdAt.toISOString(),
  };
}

async function ensureStarterTemplatesSeeded(): Promise<void> {
  const total = await prisma.documentTemplate.count();
  if (total > 0) return;

  const baseMs = Date.now();
  await prisma.documentTemplate.createMany({
    data: STARTER_DOCUMENT_TEMPLATES.map((tpl, idx) => ({
      title: tpl.title,
      content: tpl.content,
      category: tpl.category,
      documentTitle: tpl.documentTitle,
      organizationId: null,
      createdBy: null,
      createdAt: new Date(baseMs + idx * 10),
    })),
  });
}

/**
 * Carrega todos os modelos salvos (opcionalmente filtrados por categoria) para o emissor de documentos.
 */
export async function getDocumentTemplates(
  category?: string
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

    let categoryFilter: { in: string[] } | undefined;
    if (category?.trim()) {
      const normalized = toTemplateCategory(category);
      categoryFilter = { in: getCategoryQueryAliases(normalized) };
    }

    const rows = await prisma.documentTemplate.findMany({
      where: {
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(sessao.organizationId
          ? {
              OR: [
                { organizationId: sessao.organizationId },
                { organizationId: null },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
  input: SaveDocumentTemplateInput
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

    const created = await prisma.documentTemplate.create({
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        category: canonicalCategory,
        documentTitle: parsed.data.documentTitle || null,
        organizationId: sessao.organizationId ?? null,
        createdBy: sessao.userId,
      },
    });

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
