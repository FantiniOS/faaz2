export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRepository, withTransaction } from "@/lib/db/data-source";
import {
  AlimentoEntity,
  DietSubstitutionEntity,
  ItemRefeicaoEntity,
  PatientEntity,
  PlanoAlimentarEntity,
  RefeicaoEntity,
  VariacaoDietaEntity,
} from "@/lib/db/entities";
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

async function carregarPlanoCompleto(pacienteId: string) {
  const planoRepo = await getRepository(PlanoAlimentarEntity);
  return planoRepo.findOne({
    where: { pacienteId, ativo: true },
    relations: {
      variacoes: {
        refeicoes: {
          itens: {
            alimento: true,
            substituicoes: {
              substituteFood: true,
            },
          },
        },
      },
    },
  });
}

/**
 * GET /api/pacientes/[id]/dieta
 * Retorna o plano alimentar ativo com todas as Variações de Cardápio e suas Refeições.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error: "Acesso negado. A aba Dieta é restrita ao corpo médico.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);
    const paciente = await patientRepo.findOne({
      where: { id },
      relations: { primaryDoctor: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    let plano = await carregarPlanoCompleto(id);

    if (!plano) {
      await withTransaction(async (manager) => {
        const planoRepo = manager.getRepository(PlanoAlimentarEntity);
        const variacaoRepo = manager.getRepository(VariacaoDietaEntity);
        const refeicaoRepo = manager.getRepository(RefeicaoEntity);

        const novoPlano = await planoRepo.save(
          planoRepo.create({
            pacienteId: id,
            titulo: "Plano Alimentar Individualizado",
            objetivo: "Equilíbrio de macronutrientes e otimização metabólica.",
            ativo: true,
          }),
        );

        const opcoesIniciais = [
          {
            nome: "Opção 1 (Padrão)",
            descricao: "Cardápio principal do plano alimentar",
            ordem: 1,
          },
          {
            nome: "Opção 2 (Variada)",
            descricao: "Alternativas para variação da rotina",
            ordem: 2,
          },
        ];

        for (const op of opcoesIniciais) {
          const variacao = await variacaoRepo.save(
            variacaoRepo.create({
              planoAlimentarId: novoPlano.id,
              nome: op.nome,
              descricao: op.descricao,
              ordem: op.ordem,
              ativo: true,
            }),
          );

          for (const ref of REFEICOES_BASE) {
            await refeicaoRepo.save(
              refeicaoRepo.create({
                variacaoDietaId: variacao.id,
                nome: ref.nome,
                horario: ref.horario,
                ordem: ref.ordem,
              }),
            );
          }
        }
      });

      plano = await carregarPlanoCompleto(id);
    }

    if (!plano) {
      return NextResponse.json(
        { error: "Erro ao inicializar plano alimentar." },
        { status: 500 },
      );
    }

    const variacoesOrdenadas = [...(plano.variacoes || [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.ordem - b.ordem ||
        a.id.localeCompare(b.id),
    );

    const variacoesComTotais = variacoesOrdenadas.map((variacao) => {
      let totalCalorias = 0;
      let totalProteinas = 0;
      let totalCarboidratos = 0;
      let totalGorduras = 0;
      let totalFibras = 0;

      const refeicoesOrdenadas = [...(variacao.refeicoes || [])].sort(
        (a, b) => a.ordem - b.ordem,
      );

      const refeicoesComTotais = refeicoesOrdenadas.map((refeicao) => {
        let mealCal = 0;
        let mealProt = 0;
        let mealCarb = 0;
        let mealFat = 0;
        let mealFib = 0;

        const itensOrdenados = [...(refeicao.itens || [])].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        const itensFormatados = itensOrdenados.map((item) => {
          const alimento = item.alimento;
          const qtd = Number(item.quantidadeGramas) || 0;
          const fator = qtd > 0 ? qtd / 100 : 1;

          const basePortion = Number(alimento?.porcaoBase) || 100;
          const baseKcal = Number(alimento?.calorias) || 0;
          const baseProt = Number(alimento?.proteinas) || 0;
          const baseCarb = Number(alimento?.carboidratos) || 0;
          const baseFat = Number(alimento?.gorduras) || 0;
          const baseFib = Number(alimento?.fibras) || 0;

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

          const subsOrdenadas = [...(item.substituicoes || [])].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          const subRecente = subsOrdenadas[0] || null;

          return {
            id: item.id,
            quantidadeGramas: item.quantidadeGramas,
            observacao: item.observacao,
            alimento: {
              ...alimento,
              id: alimento?.id || "",
              nome: alimento?.nome || "Alimento",
              categoria: alimento?.categoria || "Geral",
              porcaoBase: basePortion,
              calorias: baseKcal,
              proteinas: baseProt,
              carboidratos: baseCarb,
              gorduras: baseFat,
              fibras: baseFib,
              protein: baseProt,
              proteins: baseProt,
              carbohydrate: baseCarb,
              carbohydrates: baseCarb,
              lipid: baseFat,
              lipids: baseFat,
              fats: baseFat,
              calories: baseKcal,
              caloriasPorcao: cal,
              proteinasPorcao: prot,
              carboidratosPorcao: carb,
              gordurasPorcao: fat,
              fibrasPorcao: fib,
            },
            substituicoes: subsOrdenadas,
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
        especialidade:
          paciente.primaryDoctor?.specialty || "Endocrinologia & Nutrologia",
      },
      plano: {
        ...plano,
        nome: plano.titulo,
        titulo: plano.titulo,
        variacoes: variacoesComTotais,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar dieta:", error);
    return NextResponse.json(
      { error: "Erro interno ao carregar dados da dieta." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pacientes/[id]/dieta
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Ação restrita a médicos." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const acao =
      body.acao || (body.refeicaoId ? "adicionar_item" : "criar_variacao");

    // 1. CRIAR NOVA VARIAÇÃO DE DIETA
    if (acao === "criar_variacao") {
      const {
        planoAlimentarId,
        nome = "Nova Opção",
        descricao,
        clonarDeVariacaoId,
      } = body;

      if (!planoAlimentarId) {
        return NextResponse.json(
          { error: "planoAlimentarId é obrigatório." },
          { status: 400 },
        );
      }

      const novaVariacao = await withTransaction(async (manager) => {
        const variacaoRepo = manager.getRepository(VariacaoDietaEntity);
        const refeicaoRepo = manager.getRepository(RefeicaoEntity);
        const itemRepo = manager.getRepository(ItemRefeicaoEntity);

        const existentes = await variacaoRepo.find({
          where: { planoAlimentarId },
          select: { id: true, ordem: true },
        });
        const maxOrdem = existentes.reduce(
          (max, v) => (v.ordem > max ? v.ordem : max),
          0,
        );
        const proximaOrdem = maxOrdem + 1;

        const criada = await variacaoRepo.save(
          variacaoRepo.create({
            planoAlimentarId,
            nome: String(nome).trim().toUpperCase(),
            descricao: descricao ? String(descricao).trim().toUpperCase() : null,
            ordem: proximaOrdem,
            ativo: true,
          }),
        );

        if (clonarDeVariacaoId) {
          const varOrigem = await variacaoRepo.findOne({
            where: { id: clonarDeVariacaoId },
            relations: { refeicoes: { itens: true } },
          });

          if (varOrigem && varOrigem.refeicoes && varOrigem.refeicoes.length > 0) {
            for (const ref of varOrigem.refeicoes) {
              const novaRef = await refeicaoRepo.save(
                refeicaoRepo.create({
                  variacaoDietaId: criada.id,
                  nome: ref.nome,
                  horario: ref.horario,
                  ordem: ref.ordem,
                  observacoes: ref.observacoes,
                }),
              );
              for (const it of ref.itens || []) {
                await itemRepo.save(
                  itemRepo.create({
                    refeicaoId: novaRef.id,
                    alimentoId: it.alimentoId,
                    quantidadeGramas: it.quantidadeGramas,
                    observacao: it.observacao,
                  }),
                );
              }
            }
          } else {
            for (const ref of REFEICOES_BASE) {
              await refeicaoRepo.save(
                refeicaoRepo.create({
                  variacaoDietaId: criada.id,
                  nome: ref.nome,
                  horario: ref.horario,
                  ordem: ref.ordem,
                }),
              );
            }
          }
        } else {
          for (const ref of REFEICOES_BASE) {
            await refeicaoRepo.save(
              refeicaoRepo.create({
                variacaoDietaId: criada.id,
                nome: ref.nome,
                horario: ref.horario,
                ordem: ref.ordem,
              }),
            );
          }
        }

        return variacaoRepo.findOne({
          where: { id: criada.id },
          relations: {
            refeicoes: {
              itens: {
                alimento: true,
              },
            },
          },
        });
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
          { status: 400 },
        );
      }

      const alimentoRepo = await getRepository(AlimentoEntity);
      const subRepo = await getRepository(DietSubstitutionEntity);

      let nomeSub = substituteFoodName;
      let finalCal = Number(calories ?? calorias) || 0;
      let finalProt = Number(proteins ?? proteinas) || 0;
      let finalCarb = Number(carbohydrates ?? carboidratos) || 0;
      let finalFat = Number(fats ?? gorduras) || 0;

      if (substituteFoodId && (!nomeSub || finalCal === 0)) {
        const alimDb = await alimentoRepo.findOne({
          where: { id: substituteFoodId },
        });
        if (alimDb) {
          if (!nomeSub) nomeSub = alimDb.nome;
          const fator =
            (Number(quantidadeGramas) || 100) / (alimDb.porcaoBase || 100);
          if (finalCal === 0) finalCal = Math.round(alimDb.calorias * fator);
          if (finalProt === 0)
            finalProt = parseFloat((alimDb.proteinas * fator).toFixed(1));
          if (finalCarb === 0)
            finalCarb = parseFloat((alimDb.carboidratos * fator).toFixed(1));
          if (finalFat === 0)
            finalFat = parseFloat((alimDb.gorduras * fator).toFixed(1));
        }
      }

      const criada = await subRepo.save(
        subRepo.create({
          patientId: id,
          prescribedDietItemId,
          substituteFoodId: substituteFoodId || null,
          substituteFoodName: String(nomeSub).trim(),
          quantityGrams: Number(quantidadeGramas) || 100,
          calories: finalCal,
          proteins: finalProt,
          carbohydrates: finalCarb,
          fats: finalFat,
        }),
      );

      const novaSub = await subRepo.findOne({
        where: { id: criada.id },
        relations: {
          substituteFood: true,
          prescribedDietItem: { alimento: true },
        },
      });

      return NextResponse.json({
        sucesso: true,
        substituicao: novaSub,
      });
    }

    // 3. ADICIONAR ITEM À REFEIÇÃO
    const { refeicaoId, alimentoId, quantidadeGramas = 100, observacao } = body;

    if (!refeicaoId || !alimentoId) {
      return NextResponse.json(
        { error: "refeicaoId e alimentoId são obrigatórios." },
        { status: 400 },
      );
    }

    const itemRepo = await getRepository(ItemRefeicaoEntity);
    const salvo = await itemRepo.save(
      itemRepo.create({
        refeicaoId,
        alimentoId,
        quantidadeGramas: Number(quantidadeGramas) || 100,
        observacao: observacao ? String(observacao).trim().toUpperCase() : null,
      }),
    );

    const novoItem = await itemRepo.findOneOrFail({
      where: { id: salvo.id },
      relations: { alimento: true },
    });

    const alim = novoItem.alimento;
    const baseProt = Number(alim?.proteinas) || 0;
    const baseCarb = Number(alim?.carboidratos) || 0;
    const baseFat = Number(alim?.gorduras) || 0;
    const baseKcal = Number(alim?.calorias) || 0;
    const basePortion = Number(alim?.porcaoBase) || 100;

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
      { status: 500 },
    );
  }
}

/**
 * PUT / PATCH /api/pacientes/[id]/dieta
 * Atualiza o nome/título do Plano Alimentar, dados de uma variação ou item da refeição
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Ação restrita a médicos." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const acao =
      body.acao ||
      (body.itemId
        ? "atualizar_item"
        : body.variacaoId
          ? "atualizar_variacao"
          : "atualizar_plano");

    if (acao === "atualizar_plano") {
      const { planoId, nome, titulo, objetivo } = body;
      const novoNomeRaw = nome ?? titulo;
      const trimmedNome =
        typeof novoNomeRaw === "string" ? novoNomeRaw.trim() : "";

      if (!trimmedNome) {
        return NextResponse.json(
          { error: "O nome do plano alimentar não pode ficar vazio." },
          { status: 400 },
        );
      }

      const planoRepo = await getRepository(PlanoAlimentarEntity);
      const planoExistente = await planoRepo.findOne({
        where: planoId
          ? { id: planoId, pacienteId: id }
          : { pacienteId: id, ativo: true },
      });

      if (!planoExistente) {
        return NextResponse.json(
          { error: "Plano alimentar não encontrado para este paciente." },
          { status: 404 },
        );
      }

      planoExistente.titulo = trimmedNome.slice(0, 160);
      if (objetivo !== undefined) {
        planoExistente.objetivo = objetivo
          ? String(objetivo).trim().slice(0, 255)
          : null;
      }

      const planoAtualizado = await planoRepo.save(planoExistente);

      return NextResponse.json({
        sucesso: true,
        plano: {
          ...planoAtualizado,
          nome: planoAtualizado.titulo,
          titulo: planoAtualizado.titulo,
        },
      });
    }

    if (acao === "atualizar_variacao") {
      const { variacaoId, nome, descricao } = body;
      if (!variacaoId) {
        return NextResponse.json(
          { error: "variacaoId obrigatório." },
          { status: 400 },
        );
      }

      const trimmedNome = typeof nome === "string" ? nome.trim() : "";
      if (nome !== undefined && !trimmedNome) {
        return NextResponse.json(
          { error: "O título da variação não pode ficar vazio." },
          { status: 400 },
        );
      }

      const variacaoRepo = await getRepository(VariacaoDietaEntity);
      const existingVariacao = await variacaoRepo.findOne({
        where: {
          id: variacaoId,
          planoAlimentar: { pacienteId: id },
        },
        relations: { planoAlimentar: true },
      });

      if (!existingVariacao) {
        return NextResponse.json(
          { error: "Variação não encontrada para este paciente." },
          { status: 404 },
        );
      }

      if (trimmedNome) {
        existingVariacao.nome = trimmedNome.slice(0, 100);
      }
      if (descricao !== undefined) {
        existingVariacao.descricao = descricao
          ? String(descricao).trim().slice(0, 255)
          : null;
      }

      const varAtualizada = await variacaoRepo.save(existingVariacao);

      return NextResponse.json({ sucesso: true, variacao: varAtualizada });
    }

    const { itemId, quantidadeGramas, observacao } = body;
    if (!itemId) {
      return NextResponse.json(
        { error: "itemId obrigatório." },
        { status: 400 },
      );
    }

    const itemRepo = await getRepository(ItemRefeicaoEntity);
    await itemRepo.update(
      { id: itemId },
      {
        ...(quantidadeGramas !== undefined && {
          quantidadeGramas: Math.max(0, Number(quantidadeGramas)),
        }),
        ...(observacao !== undefined && {
          observacao: observacao ? String(observacao).trim().toUpperCase() : null,
        }),
      },
    );

    const itemAtualizado = await itemRepo.findOne({
      where: { id: itemId },
      relations: { alimento: true },
    });

    return NextResponse.json({
      sucesso: true,
      item: itemAtualizado,
    });
  } catch (error) {
    console.error("Erro no PUT dieta:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar dieta." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteParams) {
  return PUT(req, context);
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
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    const variacaoId = searchParams.get("variacaoId");

    if (variacaoId) {
      const variacaoRepo = await getRepository(VariacaoDietaEntity);
      const variacao = await variacaoRepo.findOne({
        where: {
          id: variacaoId,
          planoAlimentar: { pacienteId: id },
        },
        relations: { planoAlimentar: true },
      });

      if (!variacao) {
        return NextResponse.json(
          { error: "Variação não encontrada para este paciente." },
          { status: 404 },
        );
      }

      const totalVariacoes = await variacaoRepo.count({
        where: { planoAlimentarId: variacao.planoAlimentarId },
      });

      if (totalVariacoes <= 1) {
        return NextResponse.json(
          { error: "O paciente deve possuir pelo menos uma variação de dieta." },
          { status: 400 },
        );
      }

      await variacaoRepo.delete({ id: variacao.id });
      return NextResponse.json({
        sucesso: true,
        removidoVariacaoId: variacao.id,
      });
    }

    if (itemId) {
      const itemRepo = await getRepository(ItemRefeicaoEntity);
      await itemRepo.delete({ id: itemId });
      return NextResponse.json({ sucesso: true, removidoId: itemId });
    }

    return NextResponse.json(
      { error: "itemId ou variacaoId são obrigatórios." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Erro no DELETE dieta:", error);
    return NextResponse.json(
      { error: "Erro ao remover item/variação." },
      { status: 500 },
    );
  }
}
