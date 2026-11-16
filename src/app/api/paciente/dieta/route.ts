export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pacienteIdParam = searchParams.get("pacienteId");
    const cpfParam = searchParams.get("cpf");

    let pacienteId = pacienteIdParam;

    // Se fornecido CPF, busca o ID do paciente
    if (!pacienteId && cpfParam) {
      const cleanCpf = cpfParam.replace(/\D/g, "");
      const pacienteByCpf = await prisma.patient.findFirst({
        where: {
          OR: [{ cpf: cleanCpf }, { cpf: cpfParam }],
          deletedAt: null,
        },
        select: { id: true },
      });
      if (pacienteByCpf) {
        pacienteId = pacienteByCpf.id;
      }
    }

    // Se nenhum paciente foi informado, busca o primeiro paciente ativo com plano alimentar
    if (!pacienteId) {
      const planoExistente = await prisma.planoAlimentar.findFirst({
        where: { ativo: true },
        select: { pacienteId: true },
        orderBy: { updatedAt: "desc" },
      });
      if (planoExistente) {
        pacienteId = planoExistente.pacienteId;
      } else {
        // Fallback: primeiro paciente ativo cadastrado
        const primeiroPaciente = await prisma.patient.findFirst({
          where: { patientStatus: "ACTIVE", deletedAt: null },
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
        { status: 404 }
      );
    }

    // Busca dados do paciente
    const paciente = await prisma.patient.findUnique({
      where: { id: pacienteId },
      select: {
        id: true,
        fullName: true,
        socialName: true,
        cpf: true,
        clinicalFocus: true,
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
        { sucesso: false, error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    // Busca o plano alimentar ativo com variações, refeições, itens e alimentos TACO
    let plano = await prisma.planoAlimentar.findFirst({
      where: { pacienteId, ativo: true },
      include: {
        variacoes: {
          where: { ativo: true },
          orderBy: [{ createdAt: "asc" }, { ordem: "asc" }, { id: "asc" }],
          include: {
            refeicoes: {
              orderBy: { ordem: "asc" },
              include: {
                itens: {
                  include: {
                    alimento: true,
                  },
                  orderBy: { createdAt: "asc" },
                },
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
          medico: paciente.primaryDoctor?.fullName || "Dr. Carlos Fantini",
          especialidade:
            paciente.primaryDoctor?.specialty || "Endocrinologia & Nutrologia",
        },
        plano: null,
      });
    }

    // Enriquece os dados com totais calculados para cada refeição e variação
    const variacoesComTotais = plano.variacoes.map((variacao) => {
      let totalCalorias = 0;
      let totalProteinas = 0;
      let totalCarboidratos = 0;
      let totalGorduras = 0;
      let totalFibras = 0;

      const refeicoesComTotais = variacao.refeicoes.map((refeicao) => {
        let mealCal = 0;
        let mealProt = 0;
        let mealCarb = 0;
        let mealFat = 0;
        let mealFib = 0;

        const itensFormatados = refeicao.itens.map((item) => {
          const alimento = item.alimento;
          const fator = item.quantidadeGramas / 100;
          const cal = Math.round(alimento.calorias * fator);
          const prot = parseFloat((alimento.proteinas * fator).toFixed(1));
          const carb = parseFloat((alimento.carboidratos * fator).toFixed(1));
          const fat = parseFloat((alimento.gorduras * fator).toFixed(1));
          const fib = parseFloat(((alimento.fibras || 0) * fator).toFixed(1));

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
              id: alimento.id,
              nome: alimento.nome,
              categoria: alimento.categoria,
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
  } catch (error: any) {
    console.error("[API_PACIENTE_DIETA_ERROR]", error);
    return NextResponse.json(
      {
        sucesso: false,
        error: "Erro ao buscar dados do plano alimentar do paciente.",
        detalhes: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
