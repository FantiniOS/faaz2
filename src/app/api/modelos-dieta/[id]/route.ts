export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withRepositoryRetry } from "@/lib/db/data-source";
import { ModeloDietaEntity, type ModeloDieta } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import type {
  CategoriaRefeicaoModelo,
  ModeloDietaConteudo,
  ModeloDietaDTO,
  ObjetivoTagModelo,
} from "@/lib/modelos-dieta-types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const CATEGORIAS_VALIDAS: readonly CategoriaRefeicaoModelo[] = [
  "DESJEJUM",
  "COLACAO",
  "ALMOCO",
  "LANCHE",
  "JANTAR",
  "CEIA",
  "GERAL",
];

const OBJETIVOS_VALIDOS: readonly ObjetivoTagModelo[] = [
  "EMAGRECIMENTO",
  "HIPERTROFIA",
  "CONTROLE_GLICEMICO",
  "MANUTENCAO",
  "GERAL",
];

function serializeModelo(row: ModeloDieta): ModeloDietaDTO {
  let parsed: ModeloDietaConteudo = { itens: [] };
  try {
    const raw =
      typeof row.conteudoJson === "string"
        ? JSON.parse(row.conteudoJson)
        : row.conteudoJson;
    if (raw && typeof raw === "object") {
      parsed = raw as ModeloDietaConteudo;
    }
  } catch {
    parsed = row.escopo === "PLANO_COMPLETO" ? { refeicoes: [] } : { itens: [] };
  }

  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    medicoId: row.medicoId ?? null,
    escopo: row.escopo,
    categoriaRefeicao: row.categoriaRefeicao ?? null,
    titulo: row.titulo,
    objetivoTag: row.objetivoTag || "GERAL",
    descricao: row.descricao ?? null,
    conteudo: parsed,
    padraoSistema: Boolean(row.padraoSistema),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
  };
}

function autorizarClinico(sessao: Awaited<ReturnType<typeof getSessao>>) {
  if (!sessao) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 },
    );
  }
  const sessaoRole = (sessao as { role?: string }).role;
  if (
    !podeAcessarDadosClinicos(sessao.cargo) ||
    sessao.cargo === "SECRETARIA" ||
    sessaoRole === "SECRETARIA" ||
    sessaoRole === "RECEPTIONIST"
  ) {
    return NextResponse.json(
      {
        error: "Acesso negado (LGPD/RBAC).",
        motivo: "Modelos de prescrição dietética são restritos ao corpo médico.",
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * PATCH /api/modelos-dieta/[id]
 * Renomeia título, altera descrição, tag de objetivo ou categoria do modelo.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const sessao = await getSessao(req);
    const bloqueio = autorizarClinico(sessao);
    if (bloqueio) return bloqueio;

    const { id } = await params;
    const body = await req.json();

    const existente = await withRepositoryRetry(
      ModeloDietaEntity,
      (repo) => repo.findOne({ where: { id } }),
      { label: "modelos-dieta:find-patch" },
    );

    if (!existente) {
      return NextResponse.json(
        { error: "Modelo de dieta não encontrado." },
        { status: 404 },
      );
    }

    if (
      sessao?.organizationId &&
      existente.organizationId &&
      existente.organizationId !== sessao.organizationId
    ) {
      return NextResponse.json(
        { error: "Modelo pertence a outra organização." },
        { status: 403 },
      );
    }

    if (body?.titulo !== undefined) {
      const titulo = String(body.titulo).trim();
      if (titulo.length < 2) {
        return NextResponse.json(
          { error: "O título precisa ter pelo menos 2 caracteres." },
          { status: 400 },
        );
      }
      existente.titulo = titulo.slice(0, 140);
    }

    if (body?.descricao !== undefined) {
      existente.descricao = body.descricao
        ? String(body.descricao).trim().slice(0, 300)
        : null;
    }

    if (body?.objetivoTag !== undefined) {
      const obj = String(body.objetivoTag).toUpperCase().trim();
      if ((OBJETIVOS_VALIDOS as readonly string[]).includes(obj)) {
        existente.objetivoTag = obj as ObjetivoTagModelo;
      }
    }

    if (body?.categoriaRefeicao !== undefined) {
      const cat = String(body.categoriaRefeicao).toUpperCase().trim();
      if ((CATEGORIAS_VALIDAS as readonly string[]).includes(cat)) {
        existente.categoriaRefeicao = cat as CategoriaRefeicaoModelo;
      }
    }

    if (body?.conteudo && typeof body.conteudo === "object") {
      existente.conteudoJson = JSON.stringify(body.conteudo);
    }

    const atualizado = await withRepositoryRetry(
      ModeloDietaEntity,
      (repo) => repo.save(existente),
      { label: "modelos-dieta:save-patch" },
    );

    return NextResponse.json({
      sucesso: true,
      modelo: serializeModelo(atualizado),
    });
  } catch (error: unknown) {
    console.error("[MODELOS_DIETA/PATCH] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar modelo de dieta." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/modelos-dieta/[id]
 * Exclui um modelo da biblioteca da clínica.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const sessao = await getSessao(req);
    const bloqueio = autorizarClinico(sessao);
    if (bloqueio) return bloqueio;

    const { id } = await params;

    const existente = await withRepositoryRetry(
      ModeloDietaEntity,
      (repo) => repo.findOne({ where: { id } }),
      { label: "modelos-dieta:find-delete" },
    );

    if (!existente) {
      return NextResponse.json(
        { error: "Modelo de dieta não encontrado." },
        { status: 404 },
      );
    }

    if (
      sessao?.organizationId &&
      existente.organizationId &&
      existente.organizationId !== sessao.organizationId
    ) {
      return NextResponse.json(
        { error: "Modelo pertence a outra organização." },
        { status: 403 },
      );
    }

    await withRepositoryRetry(
      ModeloDietaEntity,
      (repo) => repo.delete({ id }),
      { label: "modelos-dieta:delete" },
    );

    return NextResponse.json({ sucesso: true, id });
  } catch (error: unknown) {
    console.error("[MODELOS_DIETA/DELETE] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao excluir modelo de dieta." },
      { status: 500 },
    );
  }
}
