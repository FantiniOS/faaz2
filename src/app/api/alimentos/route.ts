export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Raw } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { AlimentoEntity } from "@/lib/db/entities";

/**
 * GET /api/alimentos?q=termo
 * Rota oficial de busca no banco de alimentos (Tabela TACO / UNICAMP).
 * Insensível a acentos, caixa e vírgulas/hífens (Oracle TRANSLATE + ordenação por relevância).
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

// Mapeamento 1:1 para TRANSLATE no Oracle (mesmo comprimento; independe de ALTER SESSION no pool)
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

function relevanceRank(nome: string, normQuery: string, tokens: string[]): number {
  const normName = normalizeSearchText(nome);
  if (normName === normQuery) return 0;
  if (normName.startsWith(`${normQuery} `)) return 1;
  if (normName.startsWith(normQuery)) return 2;

  const words = normName.split(" ");
  const firstToken = tokens[0];
  if (words[0] === firstToken) return 3;
  if (normName.startsWith(firstToken)) return 4;
  if (tokens.every((t) => words.includes(t))) return 5;
  if (normName.includes(` ${firstToken}`)) return 6;
  return 7;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const termoOriginal = (searchParams.get("q") || "").trim();
    const normQuery = normalizeSearchText(termoOriginal);
    const tokens = normQuery ? normQuery.split(" ").filter(Boolean).slice(0, 8) : [];

    const alimentoRepo = await getRepository(AlimentoEntity);

    if (tokens.length === 0) {
      const resultados = await alimentoRepo.find({
        take: 50,
        order: { nome: "ASC" },
        select: ALIMENTO_SELECT,
      });

      return NextResponse.json({
        sucesso: true,
        total: resultados.length,
        alimentos: resultados,
      });
    }

    const params: Record<string, string> = {};
    tokens.forEach((tok, idx) => {
      params[`t${idx}`] = `%${tok}%`;
    });

    // Busca sem LIMIT antes de ranquear por relevância para não cortar prefixos exatos (ex.: "sal", "maca", "pao")
    const candidatos = await alimentoRepo.find({
      where: {
        nome: Raw(
          (alias) => {
            const normCol = oracleNormalizedExpr(alias);
            return tokens.map((_, idx) => `${normCol} LIKE :t${idx}`).join(" AND ");
          },
          params,
        ),
      },
      order: { nome: "ASC" },
      select: ALIMENTO_SELECT,
    });

    candidatos.sort((a, b) => {
      const diff =
        relevanceRank(a.nome, normQuery, tokens) -
        relevanceRank(b.nome, normQuery, tokens);
      if (diff !== 0) return diff;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

    const resultados = candidatos.slice(0, 50);

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
