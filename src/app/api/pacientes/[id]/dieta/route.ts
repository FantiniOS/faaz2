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
  SubstituicaoItemRefeicaoEntity,
  VariacaoDietaEntity,
  type SubstituicaoItemRefeicao,
  type UnidadeMedidaDieta,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const REFEICOES_BASE = [
  { nome: "Desjejum / Café da Manhã", horario: "07:30", ordem: 1, opcional: false },
  { nome: "Almoço", horario: "12:30", ordem: 2, opcional: false },
  { nome: "Lanche da Tarde", horario: "16:00", ordem: 3, opcional: false },
  { nome: "Jantar", horario: "19:30", ordem: 4, opcional: false },
];

function normalizarUnidade(val?: unknown): UnidadeMedidaDieta {
  if (val === "ml" || val === "un") return val;
  return "g";
}

function formatarSubstituicaoPrescrita(sub: SubstituicaoItemRefeicao) {
  const alim = sub.alimento;
  const qtd = Number(sub.quantidade) || 0;
  const base = Number(alim?.porcaoBase) || 100;
  const fator = base > 0 ? qtd / base : qtd / 100;

  return {
    id: sub.id,
    itemRefeicaoId: sub.itemRefeicaoId,
    alimentoId: sub.alimentoId ?? null,
    nomeExibicao: sub.nomeExibicao,
    quantidade: qtd,
    unidade: normalizarUnidade(sub.unidade),
    medidaCaseira: sub.medidaCaseira ?? null,
    ordem: sub.ordem ?? 1,
    thumbnailUrl: alim?.thumbnailUrl ?? null,
    categoria: alim?.categoria ?? null,
    caloriasPorcao: alim ? Math.round((Number(alim.calorias) || 0) * fator) : null,
    proteinasPorcao: alim
      ? parseFloat(((Number(alim.proteinas) || 0) * fator).toFixed(1))
      : null,
    carboidratosPorcao: alim
      ? parseFloat(((Number(alim.carboidratos) || 0) * fator).toFixed(1))
      : null,
    gordurasPorcao: alim
      ? parseFloat(((Number(alim.gorduras) || 0) * fator).toFixed(1))
      : null,
  };
}

async function carregarPlanoCompleto(pacienteId: string) {
  const planoRepo = await getRepository(PlanoAlimentarEntity);
  return planoRepo.findOne({
    where: { pacienteId, ativo: true },
    relations: {
      variacoes: {
        refeicoes: {
          itens: {
            alimento: true,
            substituicoesPrescritas: {
              alimento: true,
            },
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
 * Retorna o plano alimentar ativo com Variações, Refeições (opcional/observacoes),
 * Itens (unidade/medidaCaseira) e Substituições prescritas 1:N com thumbnailUrl.
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
                opcional: ref.opcional,
              }),
            );
          }
        }
      });

      plano = await carregarPlanoCompleto(id);
    }

    if (plano && (!plano.variacoes || plano.variacoes.length === 0)) {
      await withTransaction(async (manager) => {
        const variacaoRepo = manager.getRepository(VariacaoDietaEntity);
        const refeicaoRepo = manager.getRepository(RefeicaoEntity);

        const variacao = await variacaoRepo.save(
          variacaoRepo.create({
            planoAlimentarId: plano!.id,
            nome: "Opção 1 (Padrão)",
            descricao: "Cardápio principal",
            ordem: 1,
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
              opcional: ref.opcional,
            }),
          );
        }
      });

      plano = await carregarPlanoCompleto(id);
    }

    const variacoesAtivas = (plano?.variacoes || [])
      .filter((v) => v.ativo !== false)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.ordem - b.ordem ||
          a.id.localeCompare(b.id),
      );

    const variacoesComTotais = variacoesAtivas.map((variacao) => {
      let totalCalorias = 0;
      let totalProteinas = 0;
      let totalCarboidratos = 0;
      let totalGorduras = 0;
      let totalFibras = 0;

      const refeicoesOrdenadas = [...(variacao.refeicoes || [])].sort(
        (a, b) =>
          a.ordem - b.ordem ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
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
          const basePortion = Number(alimento?.porcaoBase) || 100;
          const baseKcal = Number(alimento?.calorias) || 0;
          const baseProt = Number(alimento?.proteinas) || 0;
          const baseCarb = Number(alimento?.carboidratos) || 0;
          const baseFat = Number(alimento?.gorduras) || 0;
          const baseFib = Number(alimento?.fibras) || 0;

          const fator =
            basePortion > 0
              ? item.quantidadeGramas / basePortion
              : item.quantidadeGramas / 100;
          const cal = Math.round(baseKcal * fator);
          const prot = parseFloat((baseProt * fator).toFixed(1));
          const carb = parseFloat((baseCarb * fator).toFixed(1));
          const fat = parseFloat((baseFat * fator).toFixed(1));
          const fib = parseFloat((baseFib * fator).toFixed(1));

          mealCal += cal;
          mealProt += prot;
          mealCarb += carb;
          mealFat += fat;
          mealFib += fib;

          // Substituições 1:N prescritas pela médica (SUBSTITUICOES_ITENS_REFEICAO)
          const subsPrescritas = [...(item.substituicoesPrescritas || [])]
            .sort(
              (a, b) =>
                a.ordem - b.ordem ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            )
            .map(formatarSubstituicaoPrescrita);

          // Substituições legadas registradas pelo paciente (DIET_SUBSTITUTIONS)
          const subsPacienteOrdenadas = [...(item.substituicoes || [])].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          const subRecente = subsPacienteOrdenadas[0] || null;

          return {
            id: item.id,
            alimentoId: item.alimentoId,
            quantidadeGramas: item.quantidadeGramas,
            unidade: normalizarUnidade(item.unidade),
            medidaCaseira: item.medidaCaseira ?? null,
            observacao: item.observacao,
            alimento: {
              ...alimento,
              id: alimento?.id || "",
              nome: alimento?.nome || "Alimento",
              categoria: alimento?.categoria || "Geral",
              thumbnailUrl: alimento?.thumbnailUrl ?? null,
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
            substituicoes: subsPrescritas,
            substituicao: subRecente
              ? {
                  id: subRecente.id,
                  prescribedDietItemId: subRecente.prescribedDietItemId,
                  substituteFoodId: subRecente.substituteFoodId,
                  substituteFoodName: subRecente.substituteFoodName,
                  substituteThumbnailUrl:
                    subRecente.substituteFood?.thumbnailUrl ?? null,
                  quantityGrams: subRecente.quantityGrams,
                  calories: subRecente.calories,
                  proteins: subRecente.proteins,
                  carbohydrates: subRecente.carbohydrates,
                  fats: subRecente.fats,
                  createdAt: subRecente.createdAt,
                }
              : null,
            substituicoesPaciente: subsPacienteOrdenadas,
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
          opcional: Boolean(refeicao.opcional),
          observacoes: refeicao.observacoes ?? null,
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
        ativo: variacao.ativo !== false,
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

    return NextResponse.json(
      {
        sucesso: true,
        temPlano: true,
        paciente: {
          id: paciente.id,
          nome: paciente.fullName,
          medico: paciente.primaryDoctor?.fullName || null,
          especialidade: paciente.primaryDoctor?.specialty || null,
        },
        plano: {
          ...plano,
          nome: plano?.titulo,
          titulo: plano?.titulo,
          variacoes: variacoesComTotais,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
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
 * Ações: criar_variacao | criar_refeicao | adicionar_item | adicionar_substituicao_prescrita | substituir_item
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
        const subPrescRepo = manager.getRepository(SubstituicaoItemRefeicaoEntity);

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
            relations: {
              refeicoes: {
                itens: {
                  substituicoesPrescritas: true,
                },
              },
            },
          });

          if (varOrigem && varOrigem.refeicoes && varOrigem.refeicoes.length > 0) {
            const refsOrig = [...varOrigem.refeicoes].sort(
              (a, b) => a.ordem - b.ordem,
            );
            for (const ref of refsOrig) {
              const novaRef = await refeicaoRepo.save(
                refeicaoRepo.create({
                  variacaoDietaId: criada.id,
                  nome: ref.nome,
                  horario: ref.horario,
                  ordem: ref.ordem,
                  opcional: Boolean(ref.opcional),
                  observacoes: ref.observacoes,
                }),
              );
              for (const it of ref.itens || []) {
                const novoIt = await itemRepo.save(
                  itemRepo.create({
                    refeicaoId: novaRef.id,
                    alimentoId: it.alimentoId,
                    quantidadeGramas: it.quantidadeGramas,
                    unidade: normalizarUnidade(it.unidade),
                    medidaCaseira: it.medidaCaseira ?? null,
                    observacao: it.observacao,
                  }),
                );
                for (const sp of it.substituicoesPrescritas || []) {
                  await subPrescRepo.save(
                    subPrescRepo.create({
                      itemRefeicaoId: novoIt.id,
                      alimentoId: sp.alimentoId,
                      nomeExibicao: sp.nomeExibicao,
                      quantidade: sp.quantidade,
                      unidade: normalizarUnidade(sp.unidade),
                      medidaCaseira: sp.medidaCaseira,
                      ordem: sp.ordem,
                    }),
                  );
                }
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
                  opcional: ref.opcional,
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
                opcional: ref.opcional,
              }),
            );
          }
        }

        const carregada = await variacaoRepo.findOne({
          where: { id: criada.id },
          relations: {
            refeicoes: {
              itens: {
                alimento: true,
                substituicoesPrescritas: { alimento: true },
              },
            },
          },
        });

        if (!carregada) return null;

        return {
          ...carregada,
          refeicoes: [...(carregada.refeicoes || [])]
            .sort((a, b) => a.ordem - b.ordem)
            .map((r) => ({
              ...r,
              opcional: Boolean(r.opcional),
              observacoes: r.observacoes ?? null,
              itens: (r.itens || []).map((it) => ({
                ...it,
                unidade: normalizarUnidade(it.unidade),
                medidaCaseira: it.medidaCaseira ?? null,
                substituicoes: (it.substituicoesPrescritas || [])
                  .sort((a, b) => a.ordem - b.ordem)
                  .map(formatarSubstituicaoPrescrita),
              })),
            })),
        };
      });

      return NextResponse.json({
        sucesso: true,
        variacao: novaVariacao,
      });
    }

    // 1.5 CRIAR NOVA REFEIÇÃO NA VARIAÇÃO
    if (acao === "criar_refeicao") {
      const {
        variacaoDietaId,
        nome = "Nova Refeição",
        horario = "15:00",
        opcional = false,
        observacoes = null,
      } = body;

      if (!variacaoDietaId) {
        return NextResponse.json(
          { error: "variacaoDietaId é obrigatório." },
          { status: 400 },
        );
      }

      const variacaoRepo = await getRepository(VariacaoDietaEntity);
      const variacao = await variacaoRepo.findOne({
        where: {
          id: variacaoDietaId,
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

      const refeicaoRepo = await getRepository(RefeicaoEntity);
      const existentes = await refeicaoRepo.find({
        where: { variacaoDietaId },
        select: { id: true, ordem: true },
      });
      const maxOrdem = existentes.reduce(
        (max, r) => (r.ordem > max ? r.ordem : max),
        0,
      );

      const criada = await refeicaoRepo.save(
        refeicaoRepo.create({
          variacaoDietaId,
          nome: String(nome).trim().slice(0, 100) || "Nova Refeição",
          horario: horario ? String(horario).trim().slice(0, 10) : null,
          ordem: maxOrdem + 1,
          opcional: Boolean(opcional),
          observacoes: observacoes ? String(observacoes).trim() : null,
        }),
      );

      return NextResponse.json(
        {
          sucesso: true,
          refeicao: {
            id: criada.id,
            variacaoDietaId: criada.variacaoDietaId,
            nome: criada.nome,
            horario: criada.horario,
            ordem: criada.ordem,
            opcional: Boolean(criada.opcional),
            observacoes: criada.observacoes ?? null,
            itens: [],
          },
        },
        { status: 201 },
      );
    }

    // 1.8 ADICIONAR SUBSTITUIÇÃO PRESCRITA (1:N) A UM ITEM DA REFEIÇÃO
    if (acao === "adicionar_substituicao_prescrita") {
      const {
        itemRefeicaoId,
        alimentoId,
        nomeExibicao,
        quantidade = 100,
        unidade = "g",
        medidaCaseira = null,
      } = body;

      if (!itemRefeicaoId) {
        return NextResponse.json(
          { error: "itemRefeicaoId é obrigatório." },
          { status: 400 },
        );
      }

      const [itemRepo, alimentoRepo, subPrescRepo] = await Promise.all([
        getRepository(ItemRefeicaoEntity),
        getRepository(AlimentoEntity),
        getRepository(SubstituicaoItemRefeicaoEntity),
      ]);

      const itemExistente = await itemRepo.findOne({
        where: {
          id: itemRefeicaoId,
          refeicao: { variacaoDieta: { planoAlimentar: { pacienteId: id } } },
        },
        relations: { refeicao: { variacaoDieta: { planoAlimentar: true } } },
      });

      if (!itemExistente) {
        return NextResponse.json(
          { error: "Item da refeição não encontrado para este paciente." },
          { status: 404 },
        );
      }

      let resolvedNome =
        typeof nomeExibicao === "string" ? nomeExibicao.trim() : "";
      const validAlimentoId =
        typeof alimentoId === "string" && alimentoId.trim()
          ? alimentoId.trim()
          : null;

      if (validAlimentoId && !resolvedNome) {
        const alimDb = await alimentoRepo.findOne({
          where: { id: validAlimentoId },
          select: { id: true, nome: true },
        });
        if (alimDb) resolvedNome = alimDb.nome;
      }

      if (!resolvedNome) {
        return NextResponse.json(
          { error: "Informe o alimento substituto ou nome de exibição." },
          { status: 400 },
        );
      }

      const existentes = await subPrescRepo.find({
        where: { itemRefeicaoId },
        select: { id: true, ordem: true },
      });
      const maxOrdem = existentes.reduce(
        (max, s) => (s.ordem > max ? s.ordem : max),
        0,
      );

      const salva = await subPrescRepo.save(
        subPrescRepo.create({
          itemRefeicaoId,
          alimentoId: validAlimentoId,
          nomeExibicao: resolvedNome.slice(0, 200),
          quantidade: Math.max(0, Number(quantidade) || 0),
          unidade: normalizarUnidade(unidade),
          medidaCaseira: medidaCaseira
            ? String(medidaCaseira).trim().slice(0, 120)
            : null,
          ordem: maxOrdem + 1,
        }),
      );

      const carregada = await subPrescRepo.findOneOrFail({
        where: { id: salva.id },
        relations: { alimento: true },
      });

      return NextResponse.json(
        {
          sucesso: true,
          substituicaoPrescrita: formatarSubstituicaoPrescrita(carregada),
        },
        { status: 201 },
      );
    }

    // 2. SUBSTITUIR ITEM (TROCA EFETUADA PELO PACIENTE — LEGADO RETROCOMPATÍVEL)
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
    const {
      refeicaoId,
      alimentoId,
      quantidadeGramas = 100,
      unidade = "g",
      medidaCaseira = null,
      observacao,
    } = body;

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
        quantidadeGramas: Math.max(0, Number(quantidadeGramas) || 100),
        unidade: normalizarUnidade(unidade),
        medidaCaseira: medidaCaseira
          ? String(medidaCaseira).trim().slice(0, 120)
          : null,
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
      unidade: normalizarUnidade(novoItem.unidade),
      medidaCaseira: novoItem.medidaCaseira ?? null,
      substituicoes: [],
      substituicao: null,
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
 * Atualiza plano, variação, refeição, item ou substituição prescrita 1:N.
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
      (body.substituicaoPrescritaId
        ? "atualizar_substituicao_prescrita"
        : body.itemId
          ? "atualizar_item"
          : body.refeicaoId
            ? "atualizar_refeicao"
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

    if (acao === "atualizar_refeicao") {
      const { refeicaoId, nome, horario, opcional, observacoes, ordem } = body;
      if (!refeicaoId) {
        return NextResponse.json(
          { error: "refeicaoId obrigatório." },
          { status: 400 },
        );
      }

      const refeicaoRepo = await getRepository(RefeicaoEntity);
      const existingRef = await refeicaoRepo.findOne({
        where: {
          id: refeicaoId,
          variacaoDieta: { planoAlimentar: { pacienteId: id } },
        },
        relations: { variacaoDieta: { planoAlimentar: true } },
      });

      if (!existingRef) {
        return NextResponse.json(
          { error: "Refeição não encontrada para este paciente." },
          { status: 404 },
        );
      }

      if (nome !== undefined) {
        const trimmed = String(nome).trim();
        if (!trimmed) {
          return NextResponse.json(
            { error: "O nome da refeição não pode ficar vazio." },
            { status: 400 },
          );
        }
        existingRef.nome = trimmed.slice(0, 100);
      }
      if (horario !== undefined) {
        existingRef.horario = horario
          ? String(horario).trim().slice(0, 10)
          : null;
      }
      if (opcional !== undefined) {
        existingRef.opcional = Boolean(opcional);
      }
      if (observacoes !== undefined) {
        existingRef.observacoes = observacoes
          ? String(observacoes).trim()
          : null;
      }
      if (ordem !== undefined && Number.isFinite(Number(ordem))) {
        existingRef.ordem = Math.max(1, Math.round(Number(ordem)));
      }

      const atualizada = await refeicaoRepo.save(existingRef);

      return NextResponse.json({
        sucesso: true,
        refeicao: {
          id: atualizada.id,
          nome: atualizada.nome,
          horario: atualizada.horario,
          ordem: atualizada.ordem,
          opcional: Boolean(atualizada.opcional),
          observacoes: atualizada.observacoes ?? null,
        },
      });
    }

    if (acao === "atualizar_substituicao_prescrita") {
      const {
        substituicaoPrescritaId,
        nomeExibicao,
        quantidade,
        unidade,
        medidaCaseira,
        ordem,
      } = body;

      if (!substituicaoPrescritaId) {
        return NextResponse.json(
          { error: "substituicaoPrescritaId obrigatório." },
          { status: 400 },
        );
      }

      const subPrescRepo = await getRepository(SubstituicaoItemRefeicaoEntity);
      const existingSub = await subPrescRepo.findOne({
        where: {
          id: substituicaoPrescritaId,
          itemRefeicao: {
            refeicao: { variacaoDieta: { planoAlimentar: { pacienteId: id } } },
          },
        },
        relations: {
          alimento: true,
          itemRefeicao: {
            refeicao: { variacaoDieta: { planoAlimentar: true } },
          },
        },
      });

      if (!existingSub) {
        return NextResponse.json(
          { error: "Substituição prescrita não encontrada." },
          { status: 404 },
        );
      }

      if (nomeExibicao !== undefined && String(nomeExibicao).trim()) {
        existingSub.nomeExibicao = String(nomeExibicao).trim().slice(0, 200);
      }
      if (quantidade !== undefined) {
        existingSub.quantidade = Math.max(0, Number(quantidade) || 0);
      }
      if (unidade !== undefined) {
        existingSub.unidade = normalizarUnidade(unidade);
      }
      if (medidaCaseira !== undefined) {
        existingSub.medidaCaseira = medidaCaseira
          ? String(medidaCaseira).trim().slice(0, 120)
          : null;
      }
      if (ordem !== undefined && Number.isFinite(Number(ordem))) {
        existingSub.ordem = Math.max(1, Math.round(Number(ordem)));
      }

      const saved = await subPrescRepo.save(existingSub);
      const reloaded = await subPrescRepo.findOneOrFail({
        where: { id: saved.id },
        relations: { alimento: true },
      });

      return NextResponse.json({
        sucesso: true,
        substituicaoPrescrita: formatarSubstituicaoPrescrita(reloaded),
      });
    }

    const { itemId, quantidadeGramas, unidade, medidaCaseira, observacao } = body;
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
        ...(unidade !== undefined && {
          unidade: normalizarUnidade(unidade),
        }),
        ...(medidaCaseira !== undefined && {
          medidaCaseira: medidaCaseira
            ? String(medidaCaseira).trim().slice(0, 120)
            : null,
        }),
        ...(observacao !== undefined && {
          observacao: observacao ? String(observacao).trim().toUpperCase() : null,
        }),
      },
    );

    const itemAtualizado = await itemRepo.findOne({
      where: { id: itemId },
      relations: {
        alimento: true,
        substituicoesPrescritas: { alimento: true },
      },
    });

    return NextResponse.json({
      sucesso: true,
      item: itemAtualizado
        ? {
            ...itemAtualizado,
            unidade: normalizarUnidade(itemAtualizado.unidade),
            medidaCaseira: itemAtualizado.medidaCaseira ?? null,
            substituicoes: (itemAtualizado.substituicoesPrescritas || [])
              .sort((a, b) => a.ordem - b.ordem)
              .map(formatarSubstituicaoPrescrita),
          }
        : null,
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
 * DELETE /api/pacientes/[id]/dieta?itemId=... | ?variacaoId=... | ?refeicaoId=... | ?substituicaoPrescritaId=...
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
    const refeicaoId = searchParams.get("refeicaoId");
    const substituicaoPrescritaId = searchParams.get("substituicaoPrescritaId");

    if (substituicaoPrescritaId) {
      const subPrescRepo = await getRepository(SubstituicaoItemRefeicaoEntity);
      const sub = await subPrescRepo.findOne({
        where: {
          id: substituicaoPrescritaId,
          itemRefeicao: {
            refeicao: { variacaoDieta: { planoAlimentar: { pacienteId: id } } },
          },
        },
        relations: {
          itemRefeicao: {
            refeicao: { variacaoDieta: { planoAlimentar: true } },
          },
        },
      });

      if (!sub) {
        return NextResponse.json(
          { error: "Substituição prescrita não encontrada." },
          { status: 404 },
        );
      }

      await subPrescRepo.delete({ id: sub.id });
      return NextResponse.json({
        sucesso: true,
        removidaSubstituicaoId: sub.id,
      });
    }

    if (refeicaoId) {
      const refeicaoRepo = await getRepository(RefeicaoEntity);
      const refeicao = await refeicaoRepo.findOne({
        where: {
          id: refeicaoId,
          variacaoDieta: { planoAlimentar: { pacienteId: id } },
        },
        relations: { variacaoDieta: { planoAlimentar: true } },
      });

      if (!refeicao) {
        return NextResponse.json(
          { error: "Refeição não encontrada para este paciente." },
          { status: 404 },
        );
      }

      await refeicaoRepo.delete({ id: refeicao.id });
      return NextResponse.json({
        sucesso: true,
        removidaRefeicaoId: refeicao.id,
      });
    }

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
      {
        error:
          "itemId, variacaoId, refeicaoId ou substituicaoPrescritaId é obrigatório.",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("Erro no DELETE dieta:", error);
    return NextResponse.json(
      { error: "Erro ao remover registro da dieta." },
      { status: 500 },
    );
  }
}
