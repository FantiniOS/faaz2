export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/dieta/substituicao
 * Lista as substituições registradas para o paciente
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const substituicoes = await prisma.dietSubstitution.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        prescribedDietItem: {
          include: {
            alimento: true,
            refeicao: true,
          },
        },
        substituteFood: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      substituicoes,
    });
  } catch (error) {
    console.error("[GET Substituicoes] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao buscar substituições da dieta." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pacientes/[id]/dieta/substituicao
 * Registra a troca / substituição de um alimento prescrito pelo paciente
 * Payload esperado:
 * {
 *   prescribedDietItemId: string, // ID do ItemRefeicao prescrito
 *   substituteFoodId?: string,     // ID do Alimento substituto na tabela TACO
 *   substituteFoodName: string,   // Nome do alimento substituto
 *   quantityGrams?: number,       // Quantidade em gramas (padrão 100)
 *   calories?: number,            // Calorias totais da porção
 *   proteins?: number,
 *   carbohydrates?: number,
 *   fats?: number
 * }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: patientId } = await params;
    const body = await req.json();

    const {
      prescribedDietItemId,
      substituteFoodId,
      substituteFoodName,
      quantityGrams = 100,
      calories,
      proteins = 0,
      carbohydrates = 0,
      fats = 0,
    } = body;

    // 1. Validação dos campos obrigatórios
    if (!prescribedDietItemId) {
      return NextResponse.json(
        { error: "prescribedDietItemId é obrigatório para ancorar a troca ao item prescrito." },
        { status: 400 }
      );
    }

    if (!substituteFoodName || String(substituteFoodName).trim() === "") {
      return NextResponse.json(
        { error: "Nome do alimento substituto (substituteFoodName) é obrigatório." },
        { status: 400 }
      );
    }

    // 2. Valida se o item prescrito existe no banco
    const prescribedItem = await prisma.itemRefeicao.findUnique({
      where: { id: prescribedDietItemId },
      include: {
        alimento: true,
        refeicao: true,
      },
    });

    if (!prescribedItem) {
      return NextResponse.json(
        { error: `Item prescrito com ID ${prescribedDietItemId} não foi encontrado.` },
        { status: 404 }
      );
    }

    // 3. Se temos o ID do alimento substituto, calcula calorias e macros caso não tenham vindo
    let finalCalories = Number(calories) || 0;
    let finalProteins = Number(proteins) || 0;
    let finalCarbs = Number(carbohydrates) || 0;
    let finalFats = Number(fats) || 0;

    if (substituteFoodId && (!calories || calories === 0)) {
      const foodDb = await prisma.alimento.findUnique({
        where: { id: substituteFoodId },
      });
      if (foodDb) {
        const proporcao = (Number(quantityGrams) || 100) / (foodDb.porcaoBase || 100);
        finalCalories = Math.round(foodDb.calorias * proporcao);
        finalProteins = parseFloat((foodDb.proteinas * proporcao).toFixed(1));
        finalCarbs = parseFloat((foodDb.carboidratos * proporcao).toFixed(1));
        finalFats = parseFloat((foodDb.gorduras * proporcao).toFixed(1));
      }
    }

    // 4. Cria o registro de DietSubstitution vinculado a prescribedDietItemId
    const novaSubstituicao = await prisma.dietSubstitution.create({
      data: {
        patientId,
        prescribedDietItemId,
        substituteFoodId: substituteFoodId || null,
        substituteFoodName: String(substituteFoodName).trim(),
        quantityGrams: Number(quantityGrams) || 100,
        calories: finalCalories,
        proteins: finalProteins,
        carbohydrates: finalCarbs,
        fats: finalFats,
      },
      include: {
        prescribedDietItem: {
          include: {
            alimento: true,
          },
        },
        substituteFood: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Substituição registrada com sucesso.",
      substituicao: novaSubstituicao,
    });
  } catch (error) {
    console.error("[POST Substituicao] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao registrar substituição de alimento." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pacientes/[id]/dieta/substituicao
 * Reverte uma substituição, voltando a exibir o alimento prescrito normalmente
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: patientId } = await params;
    const { searchParams } = new URL(req.url);
    const substitutionId = searchParams.get("substitutionId") || searchParams.get("id");

    if (!substitutionId) {
      return NextResponse.json(
        { error: "substitutionId é obrigatório." },
        { status: 400 }
      );
    }

    const sub = await prisma.dietSubstitution.findUnique({
      where: { id: substitutionId },
    });

    if (!sub || sub.patientId !== patientId) {
      return NextResponse.json(
        { error: "Substituição não encontrada." },
        { status: 404 }
      );
    }

    await prisma.dietSubstitution.delete({
      where: { id: substitutionId },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Substituição removida com sucesso. O item original voltou a ser exibido normalmente.",
    });
  } catch (error) {
    console.error("[DELETE Substituicao] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao remover substituição." },
      { status: 500 }
    );
  }
}
