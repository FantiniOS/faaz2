export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  PatientEntity,
  PlanoAlimentarEntity,
} from "@/lib/db/entities";

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
          medico: paciente.primaryDoctor?.fullName || "Dr. Carlos Fantini",
          especialidade:
            paciente.primaryDoctor?.specialty || "Endocrinologia & Nutrologia",
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
          const fator = item.quantidadeGramas / 100;
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

          return {
            id: item.id,
            quantidadeGramas: item.quantidadeGramas,
            observacao: item.observacao,
            alimento: {
              id: alimento?.id || "",
              nome: alimento?.nome || "Alimento",
              categoria: alimento?.categoria || "Geral",
              caloriasPorcao: cal,
              proteinasPorcao: prot,
              carboidratosPorcao: carb,
              gordurasPorcao: fat,
              fibrasPorcao: fib,
            },
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
        focoClinico: paciente.clinicalFocus,
      },
      plano: {
        id: plano.id,
        titulo: plano.titulo,
        objetivo: plano.objetivo,
        caloriasAlvo: variacoesComTotais[0]?.totais?.calorias || 2000,
        variacoes: variacoesComTotais,
      },
    });
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
