export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import { invalidarCacheMetricaPeso } from "@/lib/metrica-peso-eliminado";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/prontuario
 * Busca o prontuário clínico e os dados essenciais do paciente.
 * Acesso restrito: DONO_CLINICA, MEDICO.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    // Validação de RBAC Clínico
    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error: "Acesso negado. O prontuário clínico é restrito ao corpo médico e ao responsável clínico.",
          bloqueado: true,
        },
        { status: 403 }
      );
    }

    // 1. Busca paciente
    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: {
        id: true,
        recordCode: true,
        fullName: true,
        socialName: true,
        cpf: true,
        birthDate: true,
        biologicalSex: true,
        convenio: true,
        patientStatus: true,
        phoneWhatsapp: true,
        heightCm: true,
        clinicalFocus: true,
        treatmentObjective: true,
        avatarUrl: true,
        photoUrl: true,
        deletedAt: true,
        prontuario: true,
        evolucoesClinicas: {
          orderBy: [{ dataAtendimento: "desc" }, { createdAt: "desc" }],
        },
        registrosGlicemia: {
          orderBy: [{ dataRegistro: "desc" }, { createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            dataRegistro: true,
            valor: true,
            momento: true,
            createdAt: true,
          },
        },
        biometricMeasurements: {
          orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            measuredAt: true,
            waistCircumferenceCm: true,
            bodyFatPercentage: true,
            createdAt: true,
          },
        },
        measurements: {
          orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            patientId: true,
            measuredAt: true,
            bodyFatPercentage: true,
            waist: true,
            abdomen: true,
            hips: true,
            rightArm: true,
            leftArm: true,
            rightThigh: true,
            leftThigh: true,
            notes: true,
          },
        },
        goalCheckins: {
          where: {
            patientGoal: {
              category: "CAPILLARY_GLUCOSE",
            },
          },
          orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            referenceDate: true,
            recordedValue: true,
            createdAt: true,
          },
        },
      },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    // Cálculo da idade se birthDate existir
    let idade: number | null = null;
    if (paciente.birthDate) {
      const hoje = new Date();
      const nascimento = new Date(paciente.birthDate);
      idade = hoje.getFullYear() - nascimento.getFullYear();
      const m = hoje.getMonth() - nascimento.getMonth();
      if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
        idade--;
      }
    }

    const statusFormatado = paciente.patientStatus === "ACTIVE" ? "Ativo" : "Inativo";
    const sexoFormatado =
      paciente.biologicalSex === "FEMALE"
        ? "Feminino"
        : paciente.biologicalSex === "MALE"
        ? "Masculino"
        : "Outro";

    // Mapeamento dos dados do prontuário
    const prontuario = paciente.prontuario;

    const pesoAtualKg = prontuario?.pesoAtualKg ? Number(prontuario.pesoAtualKg) : null;
    const alturaCm = prontuario?.alturaCm
      ? Number(prontuario.alturaCm)
      : paciente.heightCm
      ? Number(paciente.heightCm)
      : null;
    const imc = prontuario?.imc ? Number(prontuario.imc) : null;

    const latestMeasurement = paciente.measurements?.[0];
    const bioRecente = paciente.biometricMeasurements?.[0];
    const regGlicemiaRecente = paciente.registrosGlicemia?.[0];
    const glicemiaRecente =
      regGlicemiaRecente?.valor != null
        ? Number(regGlicemiaRecente.valor)
        : paciente.goalCheckins?.[0]?.recordedValue != null
        ? Number(paciente.goalCheckins[0].recordedValue)
        : null;
    const circunferenciaAbdominal =
      latestMeasurement?.waist != null
        ? Number(latestMeasurement.waist)
        : latestMeasurement?.abdomen != null
        ? Number(latestMeasurement.abdomen)
        : bioRecente?.waistCircumferenceCm != null
        ? Number(bioRecente.waistCircumferenceCm)
        : null;
    const percentualGordura =
      latestMeasurement?.bodyFatPercentage != null
        ? Number(latestMeasurement.bodyFatPercentage)
        : bioRecente?.bodyFatPercentage != null
        ? Number(bioRecente.bodyFatPercentage)
        : null;

    const momentoLabel = (m?: string | null) => {
      if (m === "POS_PRANDIAL") return "Pós-Refeição";
      if (m === "CASUAL") return "Casual";
      return "Em Jejum";
    };

    const glicemiaStatus =
      glicemiaRecente !== null
        ? glicemiaRecente < 70
          ? "Hipoglicemia"
          : glicemiaRecente > 180
          ? "Hiperglicemia"
          : regGlicemiaRecente?.momento === "POS_PRANDIAL"
          ? glicemiaRecente <= 140
            ? "Pós-Ref. Normal"
            : "Pós-Ref. Elevada"
          : glicemiaRecente < 100
          ? "Jejum Normal"
          : glicemiaRecente <= 125
          ? "Pré-Diabetes"
          : "Alterada"
        : null;

    const biometriaHistorico = (paciente.biometricMeasurements || []).map((b) => ({
      id: b.id,
      measuredAt: b.measuredAt.toISOString(),
      waistCircumferenceCm: b.waistCircumferenceCm != null ? Number(b.waistCircumferenceCm) : null,
      bodyFatPercentage: b.bodyFatPercentage != null ? Number(b.bodyFatPercentage) : null,
    }));

    const measurementsHistorico = (paciente.measurements || []).map((m) => ({
      id: m.id,
      patientId: m.patientId,
      measuredAt: m.measuredAt.toISOString(),
      bodyFatPercentage: m.bodyFatPercentage ?? null,
      waist: m.waist ?? null,
      abdomen: m.abdomen ?? null,
      hips: m.hips ?? null,
      rightArm: m.rightArm ?? null,
      leftArm: m.leftArm ?? null,
      rightThigh: m.rightThigh ?? null,
      leftThigh: m.leftThigh ?? null,
      notes: m.notes ?? null,
    }));

    const glicemiaHistorico =
      paciente.registrosGlicemia && paciente.registrosGlicemia.length > 0
        ? paciente.registrosGlicemia.map((g) => ({
            id: g.id,
            referenceDate: g.dataRegistro.toISOString(),
            recordedValue: Number(g.valor),
            momento: g.momento,
            notes: `Medição: ${momentoLabel(g.momento)}`,
          }))
        : (paciente.goalCheckins || []).map((g) => ({
            id: g.id,
            referenceDate: g.referenceDate.toISOString(),
            recordedValue: g.recordedValue != null ? Number(g.recordedValue) : null,
            momento: "JEJUM",
            notes: null,
          }));

    return NextResponse.json({
      success: true,
      paciente: {
        id: paciente.id,
        recordCode: paciente.recordCode,
        nome: paciente.socialName || paciente.fullName,
        cpf: paciente.cpf,
        birthDate: paciente.birthDate ? paciente.birthDate.toISOString().split("T")[0] : null,
        idade,
        sexo: sexoFormatado,
        status: statusFormatado,
        convenio: paciente.convenio,
        telefoneWhatsapp: paciente.phoneWhatsapp,
        heightCm: paciente.heightCm ? Number(paciente.heightCm) : null,
        clinicalFocus: paciente.treatmentObjective || paciente.clinicalFocus,
        treatmentObjective: paciente.treatmentObjective || paciente.clinicalFocus,
        avatarUrl: paciente.avatarUrl || paciente.photoUrl || null,
        glicemiaRecente,
        glicemiaStatus,
        circunferenciaAbdominal,
        percentualGordura,
      },
      prontuario: {
        pesoAtualKg,
        alturaCm,
        imc,
        objetivo: prontuario?.objetivo || paciente.treatmentObjective || paciente.clinicalFocus || "",
        comorbidades: prontuario?.comorbidades || "",
        alergias: prontuario?.alergias || "",
        medicacoes: prontuario?.medicacoes || "",
        evolucao: prontuario?.evolucao || "",
        ultimaAtualizacao: prontuario?.updatedAt || null,
      },
      historico: paciente.evolucoesClinicas || [],
      biometriaHistorico,
      measurementsHistorico,
      glicemiaHistorico,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: any) {
    console.error("[PRONTUARIO/GET] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao buscar prontuário do paciente.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pacientes/[id]/prontuario
 * Salva ou atualiza a ficha clínica do paciente (Aba 1).
 * Acesso restrito: DONO_CLINICA, MEDICO.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    // Validação de RBAC Clínico
    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error: "Acesso negado. Apenas o corpo médico e o dono da clínica podem salvar prontuários.",
          bloqueado: true,
        },
        { status: 403 }
      );
    }

    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      pesoAtualKg,
      alturaCm,
      objetivo,
      comorbidades,
      alergias,
      medicacoes,
      evolucao,
      queixaPrincipal,
      registrarAtendimento = true,
    } = body;

    const pesoNum = pesoAtualKg !== undefined && pesoAtualKg !== null && pesoAtualKg !== ""
      ? parseFloat(String(pesoAtualKg).replace(",", "."))
      : null;

    const alturaNum = alturaCm !== undefined && alturaCm !== null && alturaCm !== ""
      ? parseFloat(String(alturaCm).replace(",", "."))
      : null;

    // Cálculo automático de IMC: Peso (kg) / [Altura (m)]²
    let imcCalculado: number | null = null;
    if (pesoNum && alturaNum && pesoNum > 0 && alturaNum > 0) {
      const alturaM = alturaNum > 3 ? alturaNum / 100 : alturaNum; // Normaliza se digitado em cm ou metros
      imcCalculado = Math.round((pesoNum / (alturaM * alturaM)) * 100) / 100;
    }

    // Persistência no Prisma via Upsert (Ficha Base)
    const prontuarioSalvo = await prisma.prontuarioPaciente.upsert({
      where: { pacienteId: id },
      create: {
        pacienteId: id,
        pesoAtualKg: pesoNum,
        alturaCm: alturaNum,
        imc: imcCalculado,
        objetivo: objetivo ? String(objetivo).trim().toUpperCase() : null,
        comorbidades: comorbidades ? String(comorbidades).trim().toUpperCase() : null,
        alergias: alergias ? String(alergias).trim().toUpperCase() : null,
        medicacoes: medicacoes ? String(medicacoes).trim().toUpperCase() : null,
        evolucao: evolucao ? String(evolucao).trim().toUpperCase() : null,
      },
      update: {
        pesoAtualKg: pesoNum,
        alturaCm: alturaNum,
        imc: imcCalculado,
        objetivo: objetivo ? String(objetivo).trim().toUpperCase() : null,
        comorbidades: comorbidades ? String(comorbidades).trim().toUpperCase() : null,
        alergias: alergias ? String(alergias).trim().toUpperCase() : null,
        medicacoes: medicacoes ? String(medicacoes).trim().toUpperCase() : null,
        evolucao: evolucao ? String(evolucao).trim().toUpperCase() : null,
      },
    });

    // Mantém a altura e o objetivo clínico sincronizados no cadastro geral do paciente
    const patientUpdateData: Record<string, any> = {};
    if (alturaNum && alturaNum > 0) {
      patientUpdateData.heightCm = alturaNum;
    }
    if (objetivo) {
      patientUpdateData.treatmentObjective = String(objetivo).trim();
      patientUpdateData.clinicalFocus = String(objetivo).trim();
    }
    if (Object.keys(patientUpdateData).length > 0) {
      await prisma.patient.update({
        where: { id },
        data: patientUpdateData,
      });
    }

    // Grava novo registro no Histórico Clínico (Linha do Tempo de Atendimentos)
    if (registrarAtendimento && (evolucao || queixaPrincipal || pesoNum)) {
      await prisma.evolucaoClinica.create({
        data: {
          pacienteId: id,
          dataAtendimento: new Date(),
          pesoAtual: pesoNum,
          alturaCm: alturaNum,
          imc: imcCalculado,
          queixaPrincipal: queixaPrincipal
            ? String(queixaPrincipal).trim().toUpperCase()
            : objetivo
            ? String(objetivo).trim().toUpperCase()
            : null,
          condutaEvolucao:
            evolucao && String(evolucao).trim().length > 0
              ? String(evolucao).trim().toUpperCase()
              : "CONSULTA E ATENDIMENTO CLÍNICO REGISTRADO.",
          medicoResponsavel: sessao?.nome || "Dr. Carlos Fantini",
        },
      });
    }

    // Invalida cache da métrica global de peso eliminado
    invalidarCacheMetricaPeso();

    // Busca o histórico consolidado atualizado
    const historicoAtualizado = await prisma.evolucaoClinica.findMany({
      where: { pacienteId: id },
      orderBy: { dataAtendimento: "desc" },
    });

    return NextResponse.json({
      success: true,
      message: "Atendimento registrado e prontuário salvo com sucesso!",
      prontuario: {
        ...prontuarioSalvo,
        pesoAtualKg: prontuarioSalvo.pesoAtualKg ? Number(prontuarioSalvo.pesoAtualKg) : null,
        alturaCm: prontuarioSalvo.alturaCm ? Number(prontuarioSalvo.alturaCm) : null,
        imc: prontuarioSalvo.imc ? Number(prontuarioSalvo.imc) : null,
      },
      historico: historicoAtualizado,
    });
  } catch (error: any) {
    console.error("[PRONTUARIO/PUT] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao salvar prontuário.", details: error?.message },
      { status: 500 }
    );
  }
}
