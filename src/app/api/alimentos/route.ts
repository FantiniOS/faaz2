export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Raw } from "typeorm";
import { z } from "zod";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import { AlimentoEntity, type Alimento } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

/**
 * GET /api/alimentos?q=termo
 * Rota oficial de busca no banco de alimentos (TACO/UNICAMP + TBCA/POF-IBGE + FRdoc Clínico).
 * Insensível a acentos, caixa, vírgulas, hífens e conectivos opcionais, com cache leve em memória
 * (TTL 120s) para buscas sub-milissegundo sem sobrecarregar o pool do Oracle ADB.
 */
const ALIMENTO_SELECT = {
  id: true,
  nome: true,
  porcaoBase: true,
  calorias: true,
  proteinas: true,
  carboidratos: true,
  gorduras: true,
  fibras: true,
  categoria: true,
  fonte: true,
  thumbnailUrl: true,
} as const;

type AlimentoResumo = Pick<Alimento, keyof typeof ALIMENTO_SELECT>;

interface IndexedAlimento {
  item: AlimentoResumo;
  normFull: string;
  normBase: string;
  words: string[];
  paddedBase: string;
}

const CATALOG_CACHE_TTL_MS = 120_000;
let catalogCache: { expiresAt: number; entries: IndexedAlimento[] } | null = null;
let catalogLoadingPromise: Promise<IndexedAlimento[]> | null = null;

// Conectivos curtos ignorados quando há tokens significativos (ex.: "file de tilapia" -> ["file", "tilapia"])
const SEARCH_STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "no", "na"]);

// Mapeamento 1:1 para TRANSLATE no Oracle (usado na verificação de duplicidade do POST)
const ORACLE_FROM_CHARS =
  "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ,-/().%";
const ORACLE_TO_CHARS =
  "aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn       ";

function oracleNormalizedExpr(alias: string): string {
  return `REGEXP_REPLACE(LOWER(TRANSLATE(${alias}, '${ORACLE_FROM_CHARS}', '${ORACLE_TO_CHARS}')), '\\s+', ' ')`;
}

function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function indexAlimento(item: AlimentoResumo): IndexedAlimento {
  const normFull = normalizeSearchText(item.nome);
  const normBase = normalizeSearchText(item.nome.replace(/\(.*?\)/g, " ")) || normFull;
  const words = normBase ? normBase.split(" ") : [];
  return {
    item,
    normFull,
    normBase,
    words,
    paddedBase: ` ${normBase} `,
  };
}

function invalidateCatalogCache() {
  catalogCache = null;
}

async function getIndexedCatalog(): Promise<IndexedAlimento[]> {
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) {
    return catalogCache.entries;
  }

  if (!catalogLoadingPromise) {
    catalogLoadingPromise = withRepositoryRetry(
      AlimentoEntity,
      (repo) =>
        repo.find({
          order: { nome: "ASC" },
          select: ALIMENTO_SELECT,
        }),
      { label: "alimentos:catalog-cache" },
    )
      .then((rows) => {
        const entries = rows.map(indexAlimento);
        catalogCache = {
          expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
          entries,
        };
        return entries;
      })
      .finally(() => {
        catalogLoadingPromise = null;
      });
  }

  return catalogLoadingPromise;
}

function matchesAllTokens(entry: IndexedAlimento, tokens: string[]): boolean {
  for (const tok of tokens) {
    if (!entry.normFull.includes(tok)) return false;
  }
  return true;
}

function relevanceRank(
  entry: IndexedAlimento,
  normQuery: string,
  sigTokens: string[],
): number {
  const { normBase, normFull, words, paddedBase } = entry;
  if (normBase === normQuery || normFull === normQuery) return 0;
  if (normBase.startsWith(`${normQuery} `)) return 1;
  if (normBase.startsWith(normQuery)) return 2;

  const firstToken = sigTokens[0];
  const allWholeWords = sigTokens.every((t) => words.includes(t));
  if (firstToken && words[0] === firstToken && allWholeWords) return 3;
  if (paddedBase.includes(` ${normQuery} `)) return 4;
  if (firstToken && words[0] === firstToken) return 5;
  if (allWholeWords) return 6;
  if (sigTokens.every((t) => words.some((w) => w.startsWith(t)))) return 7;
  if (firstToken && normBase.startsWith(firstToken)) return 8;
  return 9;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const termoOriginal = (searchParams.get("q") || "").trim();
    const normQuery = normalizeSearchText(termoOriginal);
    const rawTokens = normQuery ? normQuery.split(" ").filter(Boolean).slice(0, 8) : [];
    const sigTokens = rawTokens.filter((t) => !SEARCH_STOPWORDS.has(t));
    const effectiveTokens = sigTokens.length > 0 ? sigTokens : rawTokens;

    const catalog = await getIndexedCatalog();

    if (effectiveTokens.length === 0) {
      const resultados = catalog.slice(0, 50).map((e) => e.item);
      return NextResponse.json({
        sucesso: true,
        total: resultados.length,
        alimentos: resultados,
      });
    }

    // Prioriza busca com todos os tokens originais; se não houver match (ex.: "file de tilapia"),
    // utiliza os tokens significativos sem conectivos curtos.
    let candidatos = catalog.filter((e) => matchesAllTokens(e, rawTokens));
    if (candidatos.length === 0 && effectiveTokens.length !== rawTokens.length) {
      candidatos = catalog.filter((e) => matchesAllTokens(e, effectiveTokens));
    }

    const normSigQuery = effectiveTokens.join(" ");
    candidatos.sort((a, b) => {
      const diff =
        relevanceRank(a, normQuery, effectiveTokens) -
        relevanceRank(b, normQuery, effectiveTokens);
      if (diff !== 0) return diff;

      const posA = a.paddedBase.indexOf(` ${normQuery} `);
      const posB = b.paddedBase.indexOf(` ${normQuery} `);
      if (posA !== -1 && posB !== -1 && posA !== posB) return posA - posB;

      const exactA = a.paddedBase.includes(` ${normSigQuery} `) ? 0 : 1;
      const exactB = b.paddedBase.includes(` ${normSigQuery} `) ? 0 : 1;
      if (exactA !== exactB) return exactA - exactB;

      return a.item.nome.localeCompare(b.item.nome, "pt-BR");
    });

    const resultados = candidatos.slice(0, 50).map((e) => e.item);

    return NextResponse.json({
      sucesso: true,
      total: resultados.length,
      alimentos: resultados,
    });
  } catch (error) {
    console.error("Erro na busca de alimentos:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar banco de alimentos." },
      { status: 500 },
    );
  }
}

const createAlimentoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome do alimento ou suplemento (mín. 2 caracteres).")
    .max(200, "O nome deve ter no máximo 200 caracteres."),
  categoria: z.string().trim().max(100).optional().default("Suplementos"),
  porcaoBase: z.coerce.number().positive("Porção base deve ser maior que zero.").max(5000).optional().default(100),
  calorias: z.coerce.number().min(0, "Calorias não podem ser negativas.").max(10000),
  proteinas: z.coerce.number().min(0).max(1000).optional().default(0),
  carboidratos: z.coerce.number().min(0).max(1000).optional().default(0),
  gorduras: z.coerce.number().min(0).max(1000).optional().default(0),
  fibras: z.coerce.number().min(0).max(1000).optional().default(0),
  fonte: z.string().trim().max(50).optional().default("CLINICA"),
});

/**
 * POST /api/alimentos
 * Cadastro rápido de suplementos e alimentos próprios fora da TACO (restrito à equipe clínica).
 */
export async function POST(req: NextRequest) {
  try {
    const sessao = await getSessao();
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado. Faça login para cadastrar alimentos." },
        { status: 401 },
      );
    }

    if (!podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas profissionais clínicos podem cadastrar alimentos ou suplementos.",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = createAlimentoSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || "Dados inválidos.";
      return NextResponse.json(
        { error: firstIssue, issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const nomeLimpo = data.nome.replace(/\s+/g, " ").trim();
    const normNovo = normalizeSearchText(nomeLimpo);

    const alimentoRepo = await getRepository(AlimentoEntity);

    // Verifica duplicata exata (case/accent-insensitive) para evitar erro ORA-00001
    const existente = await alimentoRepo.findOne({
      where: {
        nome: Raw(
          (alias) => `${oracleNormalizedExpr(alias)} = :norm`,
          { norm: normNovo },
        ),
      },
      select: ALIMENTO_SELECT,
    });

    if (existente) {
      return NextResponse.json(
        {
          error: `Já existe um item cadastrado com nome equivalente: "${existente.nome}".`,
          alimentoExistente: existente,
        },
        { status: 409 },
      );
    }

    const criado = await alimentoRepo.save(
      alimentoRepo.create({
        nome: nomeLimpo,
        categoria: data.categoria || "Suplementos",
        porcaoBase: Math.round(data.porcaoBase * 100) / 100,
        calorias: Math.round(data.calorias * 10) / 10,
        proteinas: Math.round(data.proteinas * 10) / 10,
        carboidratos: Math.round(data.carboidratos * 10) / 10,
        gorduras: Math.round(data.gorduras * 10) / 10,
        fibras: Math.round(data.fibras * 10) / 10,
        fonte: data.fonte || "CLINICA",
        thumbnailUrl: null,
      }),
    );

    invalidateCatalogCache();

    return NextResponse.json(
      {
        sucesso: true,
        alimento: {
          id: criado.id,
          nome: criado.nome,
          porcaoBase: criado.porcaoBase,
          calorias: criado.calorias,
          proteinas: criado.proteinas,
          carboidratos: criado.carboidratos,
          gorduras: criado.gorduras,
          fibras: criado.fibras,
          categoria: criado.categoria,
          fonte: criado.fonte,
          thumbnailUrl: criado.thumbnailUrl ?? null,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[POST /api/alimentos] Erro:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("ORA-00001") || msg.includes("UQ_ALIMENTOS_NOME")) {
      return NextResponse.json(
        { error: "Já existe um alimento cadastrado com esse nome." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Erro interno ao cadastrar alimento/suplemento." },
      { status: 500 },
    );
  }
}
