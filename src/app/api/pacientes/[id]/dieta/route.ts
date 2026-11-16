export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const REFEICOES_BASE = [
  { nome: "Desjejum / Café da Manhã", horario: "07:30", ordem: 1 },
  { nome: "Almoço", horario: "12:30", ordem: 2 },
  { nome: "Lanche da Tarde", horario: "16:00", ordem: 3 },
  { nome: "Jantar", horario: "19:30", ordem: 4 },
];

/**
 * GET /api/pacientes/[id]/dieta
 * Retorna o plano alimentar ativo com todas as Variações de Cardápio e suas Refeições.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    // Validação de RBAC Clínico
    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error: "Acesso negado. A aba Dieta é restrita ao corpo médico.",
          bloqueado: true,
        },
        { status: 403 }
      );
    }

    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        primaryDoctor: {
          select: {
            fullName: true,
            specialty: true,
          },
        },
      },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    // Busca plano alimentar ativo com variações, refeições e itens
    let plano = await prisma.planoAlimentar.findFirst({
      where: { pacienteId: id, ativo: true },
      include: {
        variacoes: {
          orderBy: [{ createdAt: "asc" }, { ordem: "asc" }, { id: "asc" }],
          include: {
            refeicoes: {
              orderBy: { ordem: "asc" },
              include: {
                itens: {
                  include: {
                    alimento: true,
                    substituicoes: {
                      orderBy: { createdAt: "desc" },
                      take: 1,
                      include: { substituteFood: true },
                    },
                  },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
        },
      },
    });

    // Se não existir plano, cria um com Variação Padrão
    if (!plano) {
      plano = await prisma.planoAlimentar.create({
        data: {
          pacienteId: id,
          titulo: "Plano Alimentar Individualizado",
          objetivo: "Equilíbrio de macronutrientes e otimização metabólica.",
          ativo: true,
          variacoes: {
            create: [
              {
                nome: "Opção 1 (Padrão)",
                descricao: "Cardápio principal do plano alimentar",
                ordem: 1,
                refeicoes: {
                  create: REFEICOES_BASE,
                },
              },
              {
                nome: "Opção 2 (Variada)",
                descricao: "Alternativas para variação da rotina",
                ordem: 2,
                refeicoes: {
                  create: REFEICOES_BASE,
                },
              },
            ],
          },
        },
        include: {
          variacoes: {
            orderBy: [{ createdAt: "asc" }, { ordem: "asc" }, { id: "asc" }],
            include: {
              refeicoes: {
                orderBy: { ordem: "asc" },
                include: {
                  itens: {
                    include: {
                      alimento: true,
                      substituicoes: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        include: { substituteFood: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    // Enriquece os dados com totais calculados (calorias, pontos e macros)
    const variacoesComTotais = (plano.variacoes || []).map((variacao) => {
      let totalCalorias = 0;
      let totalProteinas = 0;
      let totalCarboidratos = 0;
      let totalGorduras = 0;
      let totalFibras = 0;

      const refeicoesComTotais = (variacao.refeicoes || []).map((refeicao) => {
        let mealCal = 0;
        let mealProt = 0;
        let mealCarb = 0;
        let mealFat = 0;
        let mealFib = 0;

        const itensFormatados = (refeicao.itens || []).map((item) => {
          const alimento = item.alimento || {};
          const qtd = Number(item.quantidadeGramas) || 0;
          const fator = qtd > 0 ? qtd / 100 : 1;

          // Valores base por 100g (Tabela TACO / Prisma)
          const basePortion = Number((alimento as any).porcaoBase ?? (alimento as any).basePortion) || 100;
          const baseKcal = Number((alimento as any).calorias ?? (alimento as any).calories) || 0;
          const baseProt = Number((alimento as any).proteinas ?? (alimento as any).proteins ?? (alimento as any).protein) || 0;
          const baseCarb = Number((alimento as any).carboidratos ?? (alimento as any).carbohydrates ?? (alimento as any).carbohydrate) || 0;
          const baseFat = Number((alimento as any).gorduras ?? (alimento as any).fats ?? (alimento as any).lipid) || 0;
          const baseFib = Number((alimento as any).fibras ?? (alimento as any).fiber) || 0;

          // Valores calculados proporcionais para a porção
          const cal = Math.round(baseKcal * fator);
          const prot = parseFloat(((baseProt / 100) * qtd).toFixed(1));
          const carb = parseFloat(((baseCarb / 100) * qtd).toFixed(1));
          const fat = parseFloat(((baseFat / 100) * qtd).toFixed(1));
          const fib = parseFloat(((baseFib / 100) * qtd).toFixed(1));

          mealCal += cal;
          mealProt += prot;
          mealCarb += carb;
          mealFat += fat;
          mealFib += fib;

          const subRecente = (item as any).substituicoes?.[0] || null;

          return {
            id: item.id,
            quantidadeGramas: item.quantidadeGramas,
            observacao: item.observacao,
            alimento: {
              ...alimento,
              id: alimento.id || "",
              nome: (alimento as any).nome || (alimento as any).name || "Alimento",
              categoria: (alimento as any).categoria || (alimento as any).category || "Geral",
              porcaoBase: basePortion,
              // Valores base per 100g para cálculos no frontend
              calorias: baseKcal,
              proteinas: baseProt,
              carboidratos: baseCarb,
              gorduras: baseFat,
              fibras: baseFib,
              // Aliases TACO / Inglês para máxima compatibilidade
              protein: baseProt,
              proteins: baseProt,
              carbohydrate: baseCarb,
              carbohydrates: baseCarb,
              lipid: baseFat,
              lipids: baseFat,
              fats: baseFat,
              calories: baseKcal,
              // Valores proporcionais da porção prescrita
              caloriasPorcao: cal,
              proteinasPorcao: prot,
              carboidratosPorcao: carb,
              gordurasPorcao: fat,
              fibrasPorcao: fib,
            },
            substituicoes: (item as any).substituicoes || [],
            substituicao: subRecente
              ? {
                  id: subRecente.id,
                  prescribedDietItemId: subRecente.prescribedDietItemId,
                  substituteFoodId: subRecente.substituteFoodId,
                  substituteFoodName: subRecente.substituteFoodName,
                  quantityGrams: subRecente.quantityGrams,
                  calories: subRecente.calories,
                  proteins: subRecente.proteins,
                  carbohydrates: subRecente.carbohydrates,
                  fats: subRecente.fats,
                  createdAt: subRecente.createdAt,
                }
              : null,
          };
        });

        totalCalorias += mealCal;
        totalProteinas += mealProt;
        totalCarboidratos += mealCarb;
        totalGorduras += mealFat;
        totalFibras += mealFib;

        const roundMealCal = Math.round(mealCal);

        return {
          id: refeicao.id,
          nome: refeicao.nome,
          horario: refeicao.horario,
          ordem: refeicao.ordem,
          observacoes: refeicao.observacoes,
          pontos: roundMealCal,
          calorias: roundMealCal,
          totais: {
            calorias: roundMealCal,
            pontos: roundMealCal,
            proteinas: parseFloat(mealProt.toFixed(1)),
            carboidratos: parseFloat(mealCarb.toFixed(1)),
            gorduras: parseFloat(mealFat.toFixed(1)),
            fibras: parseFloat(mealFib.toFixed(1)),
          },
          itens: itensFormatados,
        };
      });

      const roundTotalCal = Math.round(totalCalorias);

      return {
        id: variacao.id,
        nome: variacao.nome,
        descricao: variacao.descricao,
        ordem: variacao.ordem,
        pontos: roundTotalCal,
        calorias: roundTotalCal,
        totais: {
          calorias: roundTotalCal,
          pontos: roundTotalCal,
          proteinas: parseFloat(totalProteinas.toFixed(1)),
          carboidratos: parseFloat(totalCarboidratos.toFixed(1)),
          gorduras: parseFloat(totalGorduras.toFixed(1)),
          fibras: parseFloat(totalFibras.toFixed(1)),
        },
        refeicoes: refeicoesComTotais,
      };
    });

    return NextResponse.json({
      sucesso: true,
      temPlano: true,
      paciente: {
        id: paciente.id,
        nome: paciente.fullName,
        medico: paciente.primaryDoctor?.fullName || "Dr. Carlos Fantini",
        especialidade: paciente.primaryDoctor?.specialty || "Endocrinologia & Nutrologia",
      },
      plano: {
        ...plano,
        variacoes: variacoesComTotais,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar dieta:", error);
    return NextResponse.json(
      { error: "Erro interno ao carregar dados da dieta." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pacientes/[id]/dieta
 * - Ação 1: Adicionar alimento a uma refeição
 *   Body: { acao: 'adicionar_item', refeicaoId, alimentoId, quantidadeGramas, observacao? }
 * - Ação 2: Criar nova variação de dieta
 *   Body: { acao: 'criar_variacao', planoAlimentarId, nome, descricao?, clonarDeVariacaoId? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Ação restrita a médicos." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const acao = body.acao || (body.refeicaoId ? "adicionar_item" : "criar_variacao");

    // 1. CRIAR NOVA VARIAÇÃO DE DIETA
    if (acao === "criar_variacao") {
      const { planoAlimentarId, nome = "Nova Opção", descricao, clonarDeVariacaoId } = body;

      if (!planoAlimentarId) {
        return NextResponse.json(
          { error: "planoAlimentarId é obrigatório." },
          { status: 400 }
        );
      }

      const ultimaOrdem = await prisma.variacaoDieta.aggregate({
        where: { planoAlimentarId },
        _max: { ordem: true },
      });
      const proximaOrdem = (ultimaOrdem._max.ordem ?? 0) + 1;

      let refeicoesParaCriar: any[] = REFEICOES_BASE;

      // Se clonar de uma variação existente, copia refeições e itens
      if (clonarDeVariacaoId) {
        const varOrigem = await prisma.variacaoDieta.findUnique({
          where: { id: clonarDeVariacaoId },
          include: { refeicoes: { include: { itens: true } } },
        });

        if (varOrigem && varOrigem.refeicoes.length > 0) {
          refeicoesParaCriar = varOrigem.refeicoes.map((ref) => ({
            nome: ref.nome,
            horario: ref.horario,
            ordem: ref.ordem,
            observacoes: ref.observacoes,
            itens: {
              create: ref.itens.map((it) => ({
                alimentoId: it.alimentoId,
                quantidadeGramas: it.quantidadeGramas,
                observacao: it.observacao,
              })),
            },
          }));
        }
      }

      const novaVariacao = await prisma.variacaoDieta.create({
        data: {
          planoAlimentarId,
          nome: String(nome).trim().toUpperCase(),
          descricao: descricao ? String(descricao).trim().toUpperCase() : null,
          ordem: proximaOrdem,
          refeicoes: {
            create: refeicoesParaCriar,
          },
        },
        include: {
          refeicoes: {
            orderBy: { ordem: "asc" },
            include: {
              itens: {
                include: { alimento: true },
              },
            },
          },
        },
      });

      return NextResponse.json({
        sucesso: true,
        variacao: novaVariacao,
      });
    }

    // 2. SUBSTITUIR ITEM (TROCA EFETUADA PELO PACIENTE / MÉDICA)
    if (acao === "substituir_item") {
      const {
        prescribedDietItemId,
        substituteFoodId,
        substituteFoodName,
        quantidadeGramas = 100,
        calories,
        calorias,
        proteins = 0,
        proteinas = 0,
        carbohydrates = 0,
        carboidratos = 0,
        fats = 0,
        gorduras = 0,
      } = body;

      if (!prescribedDietItemId || (!substituteFoodName && !substituteFoodId)) {
        return NextResponse.json(
          { error: "prescribedDietItemId e substituteFoodName são obrigatórios." },
          { status: 400 }
        );
      }

      let nomeSub = substituteFoodName;
      let finalCal = Number(calories ?? calorias) || 0;
      let finalProt = Number(proteins ?? proteinas) || 0;
      let finalCarb = Number(carbohydrates ?? carboidratos) || 0;
      let finalFat = Number(fats ?? gorduras) || 0;

      if (substituteFoodId && (!nomeSub || finalCal === 0)) {
        const alimDb = await prisma.alimento.findUnique({
          where: { id: substituteFoodId },
        });
        if (alimDb) {
          if (!nomeSub) nomeSub = alimDb.nome;
          const fator = (Number(quantidadeGramas) || 100) / (alimDb.porcaoBase || 100);
          if (finalCal === 0) finalCal = Math.round(alimDb.calorias * fator);
          if (finalProt === 0) finalProt = parseFloat((alimDb.proteinas * fator).toFixed(1));
          if (finalCarb === 0) finalCarb = parseFloat((alimDb.carboidratos * fator).toFixed(1));
          if (finalFat === 0) finalFat = parseFloat((alimDb.gorduras * fator).toFixed(1));
        }
      }

      const novaSub = await prisma.dietSubstitution.create({
        data: {
          patientId: id,
          prescribedDietItemId,
          substituteFoodId: substituteFoodId || null,
          substituteFoodName: String(nomeSub).trim(),
          quantityGrams: Number(quantidadeGramas) || 100,
          calories: finalCal,
          proteins: finalProt,
          carbohydrates: finalCarb,
          fats: finalFat,
        },
        include: {
          substituteFood: true,
          prescribedDietItem: { include: { alimento: true } },
        },
      });

      return NextResponse.json({
        sucesso: true,
        substituicao: novaSub,
      });
    }

    // 2. ADICIONAR ITEM À REFEIÇÃO
    const { refeicaoId, alimentoId, quantidadeGramas = 100, observacao } = body;

    if (!refeicaoId || !alimentoId) {
      return NextResponse.json(
        { error: "refeicaoId e alimentoId são obrigatórios." },
        { status: 400 }
      );
    }

    const novoItem = await prisma.itemRefeicao.create({
      data: {
        refeicaoId,
        alimentoId,
        quantidadeGramas: Number(quantidadeGramas) || 100,
        observacao: observacao ? String(observacao).trim().toUpperCase() : null,
      },
      include: {
        alimento: true,
      },
    });

    const alim = novoItem.alimento;
    const baseProt = Number((alim as any)?.proteinas ?? (alim as any)?.proteins ?? (alim as any)?.protein) || 0;
    const baseCarb = Number((alim as any)?.carboidratos ?? (alim as any)?.carbohydrates ?? (alim as any)?.carbohydrate) || 0;
    const baseFat = Number((alim as any)?.gorduras ?? (alim as any)?.fats ?? (alim as any)?.lipid) || 0;
    const baseKcal = Number((alim as any)?.calorias ?? (alim as any)?.calories) || 0;
    const basePortion = Number((alim as any)?.porcaoBase ?? (alim as any)?.basePortion) || 100;

    const itemFormatado = {
      ...novoItem,
      alimento: {
        ...alim,
        porcaoBase: basePortion,
        calorias: baseKcal,
        proteinas: baseProt,
        carboidratos: baseCarb,
        gorduras: baseFat,
        protein: baseProt,
        proteins: baseProt,
        carbohydrate: baseCarb,
        carbohydrates: baseCarb,
        lipid: baseFat,
        lipids: baseFat,
        fats: baseFat,
        calories: baseKcal,
      },
    };

    return NextResponse.json({
      sucesso: true,
      item: itemFormatado,
    });
  } catch (error) {
    console.error("Erro no POST dieta:", error);
    return NextResponse.json(
      { error: "Erro ao processar requisição da dieta." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pacientes/[id]/dieta
 * Atualiza item da refeição ou dados de uma variação
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Ação restrita a médicos." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const acao = body.acao || (body.itemId ? "atualizar_item" : "atualizar_variacao");

    if (acao === "atualizar_variacao") {
      const { variacaoId, nome, descricao } = body;
      if (!variacaoId) {
        return NextResponse.json({ error: "variacaoId obrigatório." }, { status: 400 });
      }

      const trimmedNome = typeof nome === "string" ? nome.trim() : "";
      if (nome !== undefined && !trimmedNome) {
        return NextResponse.json(
          { error: "O título da variação não pode ficar vazio." },
          { status: 400 }
        );
      }

      const existingVariacao = await prisma.variacaoDieta.findFirst({
        where: {
          id: variacaoId,
          planoAlimentar: { pacienteId: id },
        },
        select: { id: true },
      });

      if (!existingVariacao) {
        return NextResponse.json(
          { error: "Variação não encontrada para este paciente." },
          { status: 404 }
        );
      }

      const varAtualizada = await prisma.variacaoDieta.update({
        where: { id: existingVariacao.id },
        data: {
          ...(trimmedNome && { nome: trimmedNome.slice(0, 100) }),
          ...(descricao !== undefined && {
            descricao: descricao ? String(descricao).trim().slice(0, 255) : null,
          }),
        },
      });

      return NextResponse.json({ sucesso: true, variacao: varAtualizada });
    }

    // Atualiza item
    const { itemId, quantidadeGramas, observacao } = body;
    if (!itemId) {
      return NextResponse.json({ error: "itemId obrigatório." }, { status: 400 });
    }

    const itemAtualizado = await prisma.itemRefeicao.update({
      where: { id: itemId },
      data: {
        ...(quantidadeGramas !== undefined && {
          quantidadeGramas: Math.max(0, Number(quantidadeGramas)),
        }),
        ...(observacao !== undefined && {
          observacao: observacao ? String(observacao).trim().toUpperCase() : null,
        }),
      },
      include: {
        alimento: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      item: itemAtualizado,
    });
  } catch (error) {
    console.error("Erro no PUT dieta:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar dieta." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pacientes/[id]/dieta?itemId=... OU ?variacaoId=...
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Ação restrita a médicos." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    const variacaoId = searchParams.get("variacaoId");

    if (variacaoId) {
      const variacao = await prisma.variacaoDieta.findFirst({
        where: {
          id: variacaoId,
          planoAlimentar: { pacienteId: id },
        },
        select: { id: true, planoAlimentarId: true },
      });

      if (!variacao) {
        return NextResponse.json(
          { error: "Variação não encontrada para este paciente." },
          { status: 404 }
        );
      }

      const totalVariacoes = await prisma.variacaoDieta.count({
        where: { planoAlimentarId: variacao.planoAlimentarId },
      });

      if (totalVariacoes <= 1) {
        return NextResponse.json(
          { error: "O paciente deve possuir pelo menos uma variação de dieta." },
          { status: 400 }
        );
      }

      await prisma.variacaoDieta.delete({
        where: { id: variacao.id },
      });
      return NextResponse.json({ sucesso: true, removidoVariacaoId: variacao.id });
    }

    if (itemId) {
      await prisma.itemRefeicao.delete({
        where: { id: itemId },
      });
      return NextResponse.json({ sucesso: true, removidoId: itemId });
    }

    return NextResponse.json(
      { error: "itemId ou variacaoId são obrigatórios." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Erro no DELETE dieta:", error);
    return NextResponse.json(
      { error: "Erro ao remover item/variação." },
      { status: 500 }
    );
  }
}
