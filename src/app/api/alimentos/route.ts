export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/alimentos?q=termo
 * Rota oficial de busca no banco de alimentos (Tabela TACO / UNICAMP).
 * Case-insensitive ('insensitive') para suporte universal a CapsLock / Maiúsculas / Minúsculas.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Sanitização rigorosa do termo de busca (.trim())
    const termoDeBusca = (searchParams.get("q") || "").trim();

    // Log de depuração requerido para rastreamento no terminal
    console.log("Buscando por:", termoDeBusca);

    // Query principal com o modificador 'insensitive' no contains do Prisma
    let resultados = await prisma.alimento.findMany({
      where: termoDeBusca
        ? {
            nome: {
              contains: termoDeBusca,
              mode: "insensitive",
            },
          }
        : {},
      take: 50,
      orderBy: { nome: "asc" },
      select: {
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
      },
    });

    // Fallback resiliente caso o usuário digite múltiplas palavras (ex: "PEITO FRANGO" ou "BANANA PRATA")
    // que na tabela TACO possam estar separadas por vírgula (ex: "Banana, prata, crua")
    if (resultados.length === 0 && termoDeBusca.includes(" ")) {
      const tokens = termoDeBusca.split(/\s+/).filter(Boolean);
      resultados = await prisma.alimento.findMany({
        where: {
          AND: tokens.map((token) => ({
            nome: {
              contains: token,
              mode: "insensitive",
            },
          })),
        },
        take: 50,
        orderBy: { nome: "asc" },
        select: {
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
        },
      });
    }

    // Log de depuração pós-busca
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
      { status: 500 }
    );
  }
}
