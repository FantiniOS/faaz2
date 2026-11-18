export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Raw } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { AlimentoEntity } from "@/lib/db/entities";

/**
 * GET /api/alimentos?q=termo
 * Rota oficial de busca no banco de alimentos (Tabela TACO / UNICAMP).
 * Case-insensitive via LOWER(NOME) LIKE no Oracle.
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const termoDeBusca = (searchParams.get("q") || "").trim();

    console.log("Buscando por:", termoDeBusca);

    const alimentoRepo = await getRepository(AlimentoEntity);

    let resultados = await alimentoRepo.find({
      where: termoDeBusca
        ? {
            nome: Raw((alias) => `LOWER(${alias}) LIKE :q`, {
              q: `%${termoDeBusca.toLowerCase()}%`,
            }),
          }
        : {},
      take: 50,
      order: { nome: "ASC" },
      select: ALIMENTO_SELECT,
    });

    if (resultados.length === 0 && termoDeBusca.includes(" ")) {
      const tokens = termoDeBusca
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const params: Record<string, string> = {};
      tokens.forEach((tok, idx) => {
        params[`t${idx}`] = `%${tok}%`;
      });

      resultados = await alimentoRepo.find({
        where: {
          nome: Raw(
            (alias) =>
              tokens.map((_, idx) => `LOWER(${alias}) LIKE :t${idx}`).join(" AND "),
            params,
          ),
        },
        take: 50,
        order: { nome: "ASC" },
        select: ALIMENTO_SELECT,
      });
    }

    console.log("Resultados:", resultados.length);

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
