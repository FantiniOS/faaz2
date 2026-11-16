export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { invalidarCacheMetricaPeso } from "@/lib/metrica-peso-eliminado";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/pesagens
 * Retorna as pesagens recentes do paciente registradas no sistema.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        prontuario: {
          select: {
            pesoAtualKg: true,
            alturaCm: true,
            imc: true,
          },
        },
      },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "PACIENTE NÃO ENCONTRADO." },
        { status: 404 }
      );
    }

    const evolucoes = await prisma.evolucaoClinica.findMany({
      where: {
        pacienteId: id,
        pesoAtual: { not: null },
      },
      orderBy: { dataAtendimento: "desc" },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      pesoAtual: paciente.prontuario?.pesoAtualKg
        ? Number(paciente.prontuario.pesoAtualKg)
        : null,
      imc: paciente.prontuario?.imc ? Number(paciente.prontuario.imc) : null,
      historico: evolucoes.map((e) => ({
        id: e.id,
        data: e.dataAtendimento,
        peso: e.pesoAtual,
        imc: e.imc,
        observacao: e.condutaEvolucao,
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar pesagens do paciente:", error);
    return NextResponse.json(
      { error: "ERRO INTERNO AO CONSULTAR PESAGENS." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pacientes/[id]/pesagens
 * Salva a nova pesagem enviada pelo paciente via App Mobile ou Web.
 * Atualiza ProntuarioPaciente, cria EvolucaoClinica e BiometricMeasurement,
 * e invalida o cache do prontuário via revalidatePath('/pacientes/[id]').
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Aceita tanto { peso } quanto { pesoKg } (número ou string com vírgula/ponto)
    const rawPeso = body.peso ?? body.pesoKg ?? body.weightKg;
    if (rawPeso === undefined || rawPeso === null) {
      return NextResponse.json(
        { error: "CAMPO 'PESO' É OBRIGATÓRIO." },
        { status: 400 }
      );
    }

    const pesoSanitizado =
      typeof rawPeso === "string"
        ? parseFloat(rawPeso.replace(",", ".").trim())
        : Number(rawPeso);

    if (isNaN(pesoSanitizado) || pesoSanitizado <= 20 || pesoSanitizado >= 400) {
      return NextResponse.json(
        { error: "PESO INVÁLIDO. INFORME UM VALOR ENTRE 20 E 400 KG." },
        { status: 400 }
      );
    }

    // Busca paciente para verificar existência e coletar altura para cálculo de IMC
    const paciente = await prisma.patient.findUnique({
      where: { id },
      include: {
        prontuario: true,
      },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "PACIENTE NÃO ENCONTRADO." },
        { status: 404 }
      );
    }

    // Identifica altura em metros para cálculo de IMC
    const alturaCm =
      paciente.prontuario?.alturaCm != null
        ? Number(paciente.prontuario.alturaCm)
        : paciente.heightCm != null
        ? Number(paciente.heightCm)
        : 178;

    const alturaM = alturaCm > 3 ? alturaCm / 100 : alturaCm;
    const novoImc =
      alturaM > 0
        ? Math.round((pesoSanitizado / (alturaM * alturaM)) * 100) / 100
        : 25.0;

    // 1. Atualiza ou cria ProntuarioPaciente com o novo peso e IMC
    const prontuarioAtualizado = await prisma.prontuarioPaciente.upsert({
      where: { pacienteId: id },
      create: {
        pacienteId: id,
        pesoAtualKg: pesoSanitizado,
        alturaCm: alturaCm,
        imc: novoImc,
        evolucao: `PESAGEM DE AUTO-MONITORAMENTO REGISTRADA VIA APP MOBILE: ${pesoSanitizado.toFixed(1)} KG (IMC: ${novoImc.toFixed(2)}).`,
      },
      update: {
        pesoAtualKg: pesoSanitizado,
        imc: novoImc,
      },
    });

    // 2. Registra nova EvolucaoClinica na linha do tempo do paciente
    const novaEvolucao = await prisma.evolucaoClinica.create({
      data: {
        pacienteId: id,
        dataAtendimento: new Date(),
        pesoAtual: pesoSanitizado,
        alturaCm: alturaCm,
        imc: novoImc,
        queixaPrincipal: "AUTO-MONITORAMENTO DE PESO (APP MOBILE)",
        condutaEvolucao: `PESAGEM REGISTRADA DIRETAMENTE PELO PACIENTE VIA APP MOBILE: ${pesoSanitizado.toFixed(1)} KG. JORNADA DE METAS ATUALIZADA EM TEMPO REAL.`,
        medicoResponsavel: "AUTO-MONITORAMENTO (APP)",
      },
    });

    // 3. Registra BiometricMeasurement se a organização existir
    if (paciente.organizationId) {
      try {
        await prisma.biometricMeasurement.create({
          data: {
            organizationId: paciente.organizationId,
            patientId: id,
            measuredAt: new Date(),
            weightKg: pesoSanitizado,
            bmi: novoImc,
            sourceType: "PATIENT_APP_SELF_REPORT",
            isValidatedByStaff: false,
          },
        });
      } catch (bioErr) {
        console.warn("Aviso: Falha não-crítica ao registrar BiometricMeasurement:", bioErr);
      }
    }

    // 4. Invalidação de cache obrigatória para o prontuário Web e métrica global
    try {
      invalidarCacheMetricaPeso();
      revalidatePath(`/pacientes/${id}`);
      revalidatePath(`/pacientes/${id}/metas`);
      revalidatePath("/dashboard");
    } catch (cacheErr) {
      console.warn("Aviso ao invalidar cache da rota:", cacheErr);
    }

    return NextResponse.json({
      success: true,
      mensagem: "PESO ATUALIZADO COM SUCESSO!",
      pesoAtual: pesoSanitizado,
      imc: novoImc,
      prontuarioId: prontuarioAtualizado.id,
      evolucaoId: novaEvolucao.id,
    });
  } catch (error) {
    console.error("Erro ao registrar pesagem do paciente:", error);
    return NextResponse.json(
      { error: "ERRO INTERNO AO PROCESSAR NOVA PESAGEM." },
      { status: 500 }
    );
  }
}
