export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { withRepositoryRetry } from "@/lib/db/data-source";
import {
  AlimentoEntity,
  ModeloDietaEntity,
  type ModeloDieta,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import { buildInitialSeedModels } from "@/lib/modelos-dieta-seed";
import type {
  CategoriaRefeicaoModelo,
  EscopoModeloDieta,
  ModeloDietaConteudo,
  ModeloDietaDTO,
  ObjetivoTagModelo,
} from "@/lib/modelos-dieta-types";

const ESCOPOS_VALIDOS: readonly EscopoModeloDieta[] = [
  "REFEICAO",
  "PLANO_COMPLETO",
];
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
      { error: "Não autenticado. Faça login clínico para acessar os modelos." },
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

// Lock in-process para evitar seed duplicado caso 2 abas abram simultaneamente na primeira leitura
let seedPromise: Promise<void> | null = null;

async function garantirSeedInicial(organizationId: string | null) {
  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    const total = await withRepositoryRetry(
      ModeloDietaEntity,
      (repo) => repo.count(),
      { label: "modelos-dieta:count" },
    );
    if (total > 0) return;

    const alimentos = await withRepositoryRetry(
      AlimentoEntity,
      (repo) =>
        repo.find({
          select: {
            id: true,
            nome: true,
            categoria: true,
            thumbnailUrl: true,
            porcaoBase: true,
            calorias: true,
            proteinas: true,
            carboidratos: true,
            gorduras: true,
            fibras: true,
          },
        }),
      { label: "modelos-dieta:seed-alimentos" },
    );

    if (alimentos.length === 0) return;

    const modelosSeed = buildInitialSeedModels(alimentos, organizationId);
    await withRepositoryRetry(
      ModeloDietaEntity,
      async (repo) => {
        const recheck = await repo.count();
        if (recheck > 0) return;
        const entitiesToSave = modelosSeed.map((item) => repo.create(item));
        await repo.save(entitiesToSave);
      },
      { label: "modelos-dieta:seed-insert" },
    );
  })().finally(() => {
    seedPromise = null;
  });

  await seedPromise;
}

/**
 * GET /api/modelos-dieta?escopo=REFEICAO&categoria=DESJEJUM
 * Lista modelos da biblioteca clínica (com seed inicial idempotente usando TACO real).
 */
export async function GET(req: NextRequest) {
  try {
    const sessao = await getSessao(req);
    const bloqueio = autorizarClinico(sessao);
    if (bloqueio) return bloqueio;

    const { searchParams } = new URL(req.url);
    const escopoParam = searchParams.get("escopo")?.trim().toUpperCase();
    const categoriaParam = searchParams.get("categoria")?.trim().toUpperCase();

    let rows = await withRepositoryRetry(
      ModeloDietaEntity,
      (repo) =>
        repo.find({
          where: {
            ...(escopoParam &&
            (ESCOPOS_VALIDOS as readonly string[]).includes(escopoParam)
              ? { escopo: escopoParam as EscopoModeloDieta }
              : {}),
            ...(categoriaParam &&
            (CATEGORIAS_VALIDAS as readonly string[]).includes(categoriaParam)
              ? { categoriaRefeicao: categoriaParam as CategoriaRefeicaoModelo }
              : {}),
          },
          order: { padraoSistema: "ASC", updatedAt: "DESC" },
        }),
      { label: "modelos-dieta:list" },
    );

    // Seed inicial automático apenas se a tabela estiver completamente vazia na primeira leitura
    if (rows.length === 0) {
      await garantirSeedInicial(sessao?.organizationId ?? null);
      rows = await withRepositoryRetry(
        ModeloDietaEntity,
        (repo) =>
          repo.find({
            where: {
              ...(escopoParam &&
              (ESCOPOS_VALIDOS as readonly string[]).includes(escopoParam)
                ? { escopo: escopoParam as EscopoModeloDieta }
                : {}),
              ...(categoriaParam &&
              (CATEGORIAS_VALIDAS as readonly string[]).includes(categoriaParam)
                ? {
                    categoriaRefeicao:
                      categoriaParam as CategoriaRefeicaoModelo,
                  }
                : {}),
            },
            order: { padraoSistema: "ASC", updatedAt: "DESC" },
          }),
        { label: "modelos-dieta:list-after-seed" },
      );
    }

    // Filtra por organização quando preenchida (mantendo modelos globais/seed com organizationId null)
    const orgId = sessao?.organizationId ?? null;
    const filtrados = orgId
      ? rows.filter((r) => !r.organizationId || r.organizationId === orgId)
      : rows;

    return NextResponse.json(
      {
        sucesso: true,
        modelos: filtrados.map(serializeModelo),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error: unknown) {
    console.error("[MODELOS_DIETA/GET] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao carregar biblioteca de modelos de dieta." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/modelos-dieta
 * Salva uma refeição específica (REFEICAO) ou variação completa (PLANO_COMPLETO) na biblioteca.
 */
export async function POST(req: NextRequest) {
  try {
    const sessao = await getSessao(req);
    const bloqueio = autorizarClinico(sessao);
    if (bloqueio) return bloqueio;

    const body = await req.json();
    const escopoRaw = String(body?.escopo || "REFEICAO").toUpperCase().trim();
    const escopo: EscopoModeloDieta = (
      ESCOPOS_VALIDOS as readonly string[]
    ).includes(escopoRaw)
      ? (escopoRaw as EscopoModeloDieta)
      : "REFEICAO";

    const titulo = String(body?.titulo || "").trim();
    if (titulo.length < 2) {
      return NextResponse.json(
        { error: "Informe um título com pelo menos 2 caracteres para o modelo." },
        { status: 400 },
      );
    }

    const catRaw = body?.categoriaRefeicao
      ? String(body.categoriaRefeicao).toUpperCase().trim()
      : escopo === "PLANO_COMPLETO"
        ? "GERAL"
        : "GERAL";
    const categoriaRefeicao: CategoriaRefeicaoModelo = (
      CATEGORIAS_VALIDAS as readonly string[]
    ).includes(catRaw)
      ? (catRaw as CategoriaRefeicaoModelo)
      : "GERAL";

    const objRaw = String(body?.objetivoTag || "GERAL").toUpperCase().trim();
    const objetivoTag: ObjetivoTagModelo = (
      OBJETIVOS_VALIDOS as readonly string[]
    ).includes(objRaw)
      ? (objRaw as ObjetivoTagModelo)
      : "GERAL";

    const descricao = body?.descricao
      ? String(body.descricao).trim().slice(0, 300)
      : null;

    const conteudo = body?.conteudo;
    if (!conteudo || typeof conteudo !== "object") {
      return NextResponse.json(
        { error: "Conteúdo nutricional do modelo inválido." },
        { status: 400 },
      );
    }

    if (escopo === "REFEICAO") {
      const itens = Array.isArray(conteudo.itens) ? conteudo.itens : [];
      if (itens.length === 0) {
        return NextResponse.json(
          { error: "Adicione ao menos 1 alimento antes de salvar o modelo de refeição." },
          { status: 400 },
        );
      }
    } else {
      const refeicoes = Array.isArray(conteudo.refeicoes)
        ? conteudo.refeicoes
        : [];
      const totalItens = refeicoes.reduce(
        (acc: number, r: { itens?: unknown[] }) =>
          acc + (Array.isArray(r?.itens) ? r.itens.length : 0),
        0,
      );
      if (refeicoes.length === 0 || totalItens === 0) {
        return NextResponse.json(
          { error: "A variação precisa ter ao menos 1 alimento para salvar como modelo completo." },
          { status: 400 },
        );
      }
    }

    const criado = await withRepositoryRetry(
      ModeloDietaEntity,
      async (repo) => {
        const entity = repo.create({
          id: crypto.randomUUID(),
          organizationId: sessao?.organizationId ?? null,
          medicoId: sessao?.userId ?? null,
          escopo,
          categoriaRefeicao,
          titulo: titulo.slice(0, 140),
          objetivoTag,
          descricao,
          conteudoJson: JSON.stringify(conteudo),
          padraoSistema: false,
        });
        return repo.save(entity);
      },
      { label: "modelos-dieta:create" },
    );

    return NextResponse.json(
      {
        sucesso: true,
        modelo: serializeModelo(criado),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[MODELOS_DIETA/POST] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao salvar modelo de dieta." },
      { status: 500 },
    );
  }
}
