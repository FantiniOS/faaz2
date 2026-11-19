export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Raw } from "typeorm";
import { z } from "zod";
import { getRepository } from "@/lib/db/data-source";
import { AlimentoEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

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
