export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  PatientEntity,
  PlanoAlimentarEntity,
  type SubstituicaoItemRefeicao,
  type UnidadeMedidaDieta,
} from "@/lib/db/entities";

function normalizarUnidade(val?: string | null): UnidadeMedidaDieta {
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pacienteIdParam = searchParams.get("pacienteId");
    const cpfParam = searchParams.get("cpf");

    const patientRepo = await getRepository(PatientEntity);
    const planoRepo = await getRepository(PlanoAlimentarEntity);

    let pacienteId = pacienteIdParam;

    if (!pacienteId && cpfParam) {
      const cleanCpf = cpfParam.replace(/\D/g, "");
      const pacienteByCpf = await patientRepo.findOne({
        where: [
          { cpf: cleanCpf, deletedAt: IsNull() },
          { cpf: cpfParam, deletedAt: IsNull() },
        ],
        select: { id: true },
      });
      if (pacienteByCpf) {
        pacienteId = pacienteByCpf.id;
      }
    }

    if (!pacienteId) {
      const planoExistente = await planoRepo.findOne({
        where: { ativo: true },
        select: { id: true, pacienteId: true, updatedAt: true },
        order: { updatedAt: "DESC" },
      });
      if (planoExistente) {
        pacienteId = planoExistente.pacienteId;
      } else {
        const primeiroPaciente = await patientRepo.findOne({
          where: { patientStatus: "ACTIVE", deletedAt: IsNull() },
          select: { id: true },
        });
        if (primeiroPaciente) {
          pacienteId = primeiroPaciente.id;
        }
      }
    }

    if (!pacienteId) {
      return NextResponse.json(
        { sucesso: false, error: "Nenhum paciente cadastrado no sistema." },
        { status: 404 },
      );
    }

    const paciente = await patientRepo.findOne({
      where: { id: pacienteId },
      relations: { primaryDoctor: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { sucesso: false, error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const plano = await planoRepo.findOne({
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

    if (!plano) {
      return NextResponse.json({
        sucesso: true,
        temPlano: false,
        mensagem: "Nenhum plano alimentar prescrito ainda para este paciente.",
        paciente: {
          id: paciente.id,
          nome: paciente.fullName,
          medico: paciente.primaryDoctor?.fullName || null,
          especialidade: paciente.primaryDoctor?.specialty || null,
        },
        plano: null,
      });
    }

    const variacoesAtivas = (plano.variacoes || [])
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
          const base = Number(alimento?.porcaoBase) || 100;
          const fator = base > 0 ? item.quantidadeGramas / base : item.quantidadeGramas / 100;
          const cal = Math.round((alimento?.calorias || 0) * fator);
          const prot = parseFloat(((alimento?.proteinas || 0) * fator).toFixed(1));
          const carb = parseFloat(
            ((alimento?.carboidratos || 0) * fator).toFixed(1),
          );
          const fat = parseFloat(((alimento?.gorduras || 0) * fator).toFixed(1));
          const fib = parseFloat(((alimento?.fibras || 0) * fator).toFixed(1));

          mealCal += cal;
          mealProt += prot;
          mealCarb += carb;
          mealFat += fat;
          mealFib += fib;

          const subsPrescritas = [...(item.substituicoesPrescritas || [])]
            .sort(
              (a, b) =>
                a.ordem - b.ordem ||
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            )
            .map(formatarSubstituicaoPrescrita);

          const subsPaciente = [...(item.substituicoes || [])].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          const subRecente = subsPaciente[0] || null;

          return {
            id: item.id,
            quantidadeGramas: item.quantidadeGramas,
            unidade: normalizarUnidade(item.unidade),
            medidaCaseira: item.medidaCaseira ?? null,
            observacao: item.observacao,
            alimento: {
              id: alimento?.id || "",
              nome: alimento?.nome || "Alimento",
              categoria: alimento?.categoria || "Geral",
              thumbnailUrl: alimento?.thumbnailUrl ?? null,
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
            substituicoesPaciente: subsPaciente,
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
          focoClinico: paciente.clinicalFocus,
        },
        plano: {
          id: plano.id,
          nome: plano.titulo,
          titulo: plano.titulo,
          objetivo: plano.objetivo,
          caloriasAlvo: variacoesComTotais[0]?.totais?.calorias || 2000,
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
  } catch (error: unknown) {
    console.error("[API_PACIENTE_DIETA_ERROR]", error);
    const detalhes = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        sucesso: false,
        error: "Erro ao buscar dados do plano alimentar do paciente.",
        detalhes,
      },
      { status: 500 },
    );
  }
}
