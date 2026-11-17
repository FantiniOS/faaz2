export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { IsNull, Not } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  BiometricMeasurementEntity,
  EvolucaoClinicaEntity,
  PatientEntity,
  ProntuarioPacienteEntity,
} from "@/lib/db/entities";
import { invalidarCacheMetricaPeso } from "@/lib/metrica-peso-eliminado";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/pesagens
 * Retorna as pesagens recentes do paciente registradas no sistema.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const patientRepo = await getRepository(PatientEntity);
    const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
    const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);

    const paciente = await patientRepo.findOne({
      where: { id },
      select: { id: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { error: "PACIENTE NÃO ENCONTRADO." },
        { status: 404 },
      );
    }

    const [prontuario, evolucoes] = await Promise.all([
      prontuarioRepo.findOne({
        where: { pacienteId: id },
        select: { id: true, pesoAtualKg: true, alturaCm: true, imc: true },
      }),
      evolucaoRepo.find({
        where: {
          pacienteId: id,
          pesoAtual: Not(IsNull()),
        },
        order: { dataAtendimento: "DESC" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      success: true,
      pesoAtual:
        prontuario?.pesoAtualKg != null
          ? Number(prontuario.pesoAtualKg)
          : null,
      imc: prontuario?.imc != null ? Number(prontuario.imc) : null,
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
      { status: 500 },
    );
  }
}

/**
 * POST /api/pacientes/[id]/pesagens
 * Salva a nova pesagem enviada pelo paciente via App Mobile ou Web.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();

    const rawPeso = body.peso ?? body.pesoKg ?? body.weightKg;
    if (rawPeso === undefined || rawPeso === null) {
      return NextResponse.json(
        { error: "CAMPO 'PESO' É OBRIGATÓRIO." },
        { status: 400 },
      );
    }

    const pesoSanitizado =
      typeof rawPeso === "string"
        ? parseFloat(rawPeso.replace(",", ".").trim())
        : Number(rawPeso);

    if (isNaN(pesoSanitizado) || pesoSanitizado <= 20 || pesoSanitizado >= 400) {
      return NextResponse.json(
        { error: "PESO INVÁLIDO. INFORME UM VALOR ENTRE 20 E 400 KG." },
        { status: 400 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);
    const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
    const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);
    const bioRepo = await getRepository(BiometricMeasurementEntity);

    const paciente = await patientRepo.findOne({
      where: { id },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "PACIENTE NÃO ENCONTRADO." },
        { status: 404 },
      );
    }

    const existingProntuario = await prontuarioRepo.findOne({
      where: { pacienteId: id },
    });

    const alturaCm =
      existingProntuario?.alturaCm != null
        ? Number(existingProntuario.alturaCm)
        : paciente.heightCm != null
          ? Number(paciente.heightCm)
          : 178;

    const alturaM = alturaCm > 3 ? alturaCm / 100 : alturaCm;
    const novoImc =
      alturaM > 0
        ? Math.round((pesoSanitizado / (alturaM * alturaM)) * 100) / 100
        : 25.0;

    const prontuarioAtualizado = existingProntuario
      ? await prontuarioRepo.save({
          ...existingProntuario,
          pesoAtualKg: pesoSanitizado,
          imc: novoImc,
        })
      : await prontuarioRepo.save(
          prontuarioRepo.create({
            pacienteId: id,
            pesoAtualKg: pesoSanitizado,
            alturaCm: alturaCm,
            imc: novoImc,
            evolucao: `PESAGEM DE AUTO-MONITORAMENTO REGISTRADA VIA APP MOBILE: ${pesoSanitizado.toFixed(1)} KG (IMC: ${novoImc.toFixed(2)}).`,
          }),
        );

    const novaEvolucao = await evolucaoRepo.save(
      evolucaoRepo.create({
        pacienteId: id,
        dataAtendimento: new Date(),
        pesoAtual: pesoSanitizado,
        alturaCm: alturaCm,
        imc: novoImc,
        queixaPrincipal: "AUTO-MONITORAMENTO DE PESO (APP MOBILE)",
        condutaEvolucao: `PESAGEM REGISTRADA DIRETAMENTE PELO PACIENTE VIA APP MOBILE: ${pesoSanitizado.toFixed(1)} KG. JORNADA DE METAS ATUALIZADA EM TEMPO REAL.`,
        medicoResponsavel: "AUTO-MONITORAMENTO (APP)",
      }),
    );

    if (paciente.organizationId) {
      try {
        await bioRepo.save(
          bioRepo.create({
            organizationId: paciente.organizationId,
            patientId: id,
            measuredAt: new Date(),
            weightKg: pesoSanitizado,
            bmi: novoImc,
            sourceType: "PATIENT_APP_SELF_REPORT",
            isValidatedByStaff: false,
          }),
        );
      } catch (bioErr) {
        console.warn(
          "Aviso: Falha não-crítica ao registrar BiometricMeasurement:",
          bioErr,
        );
      }
    }

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
      { status: 500 },
    );
  }
}
