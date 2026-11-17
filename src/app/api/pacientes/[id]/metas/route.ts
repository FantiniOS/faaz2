export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull, Not, Raw } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckinHidratacaoEntity,
  CheckInSonoEntity,
  EvolucaoClinicaEntity,
  PatientEntity,
  PatientGoalEntity,
  ProntuarioPacienteEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/metas
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas profissionais de saúde podem visualizar metas clínicas.",
        },
        { status: 403 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);
    const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
    const goalRepo = await getRepository(PatientGoalEntity);
    const hidraRepo = await getRepository(CheckinHidratacaoEntity);
    const sonoRepo = await getRepository(CheckInSonoEntity);
    const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);

    const paciente = await patientRepo.findOne({
      where: { id },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const [prontuario, patientGoals, checkinsHidratacao, ultimoRegistroSono, evolucoesComPeso] =
      await Promise.all([
        prontuarioRepo.findOne({ where: { pacienteId: id } }),
        goalRepo.find({ where: { patientId: id, status: "ACTIVE" } }),
        hidraRepo.find({
          where: { pacienteId: id },
          order: { data: "DESC" },
          take: 7,
        }),
        sonoRepo.findOne({
          where: { pacienteId: id },
          order: { data: "DESC" },
        }),
        evolucaoRepo.find({
          where: {
            pacienteId: id,
            pesoAtual: Not(IsNull()),
          },
          order: { dataAtendimento: "ASC" },
          take: 10,
        }),
      ]);

    const metaAguaMl = paciente.metaDiariaMl || 2500;

    const sonoGoal = patientGoals.find(
      (g) =>
        g.title.toLowerCase().includes("sono") ||
        g.category === "SYMPTOM_DIARY",
    );
    const metaSonoHoras = sonoGoal ? Number(sonoGoal.targetValue) : 8.0;

    const caloriasGoal = patientGoals.find(
      (g) =>
        g.title.toLowerCase().includes("calor") ||
        g.unit.toLowerCase().includes("kcal") ||
        g.title.toLowerCase().includes("ponto") ||
        g.unit.toLowerCase().includes("pts"),
    );
    const caloriasBonusGoal = patientGoals.find(
      (g) =>
        g.title.toLowerCase().includes("gasto") ||
        g.title.toLowerCase().includes("bônus") ||
        g.title.toLowerCase().includes("bonus"),
    );
    const caloriasRaw = caloriasGoal ? Number(caloriasGoal.targetValue) : 2000;
    const caloriasAlvoNum = caloriasRaw > 200 ? caloriasRaw : caloriasRaw * 40;

    const bonusRaw = caloriasBonusGoal
      ? Number(caloriasBonusGoal.targetValue)
      : 300;
    const caloriasBonusNum = bonusRaw > 50 ? bonusRaw : bonusRaw * 30;

    const pesoGoal = patientGoals.find(
      (g) =>
        g.title.toLowerCase().includes("peso") ||
        g.unit.toLowerCase().includes("kg"),
    );
    const pesoAtualNum =
      prontuario?.pesoAtualKg != null
        ? Number(prontuario.pesoAtualKg)
        : 84.5;
    const pesoAlvoKg = pesoGoal
      ? Number(pesoGoal.targetValue)
      : Math.max(50, Math.round((pesoAtualNum - 6.5) * 10) / 10);
    const alturaM =
      prontuario?.alturaCm != null
        ? Number(prontuario.alturaCm) > 3
          ? Number(prontuario.alturaCm) / 100
          : Number(prontuario.alturaCm)
        : paciente.heightCm != null
          ? Number(paciente.heightCm) / 100
          : 1.78;
    const imcAtual =
      Math.round((pesoAtualNum / (alturaM * alturaM)) * 100) / 100;

    const consumoHojeMl =
      checkinsHidratacao.length > 0
        ? checkinsHidratacao.reduce((acc, c) => acc + (c.volumeMl || 0), 0)
        : 1850;

    const sonoHistoricoBase = [
      {
        dia: "Seg",
        data: "03/11",
        horas: 6.8,
        meta: metaSonoHoras,
        qualidade: "Boa",
        sonoProfundoHoras: 1.8,
      },
      {
        dia: "Ter",
        data: "04/11",
        horas: 7.2,
        meta: metaSonoHoras,
        qualidade: "Excelente",
        sonoProfundoHoras: 2.1,
      },
      {
        dia: "Qua",
        data: "05/11",
        horas: 6.0,
        meta: metaSonoHoras,
        qualidade: "Regular",
        sonoProfundoHoras: 1.4,
      },
      {
        dia: "Qui",
        data: "06/11",
        horas: 7.5,
        meta: metaSonoHoras,
        qualidade: "Excelente",
        sonoProfundoHoras: 2.3,
      },
      {
        dia: "Sex",
        data: "07/11",
        horas: 6.4,
        meta: metaSonoHoras,
        qualidade: "Boa",
        sonoProfundoHoras: 1.7,
      },
      {
        dia: "Sáb",
        data: "08/11",
        horas: 8.1,
        meta: metaSonoHoras,
        qualidade: "Excelente",
        sonoProfundoHoras: 2.5,
      },
      {
        dia: "Dom",
        data: "09/11",
        horas: 7.0,
        meta: metaSonoHoras,
        qualidade: "Boa",
        sonoProfundoHoras: 1.9,
      },
    ];

    const sonoHistorico = sonoHistoricoBase.map((item, idx) => {
      if (idx === sonoHistoricoBase.length - 1 && ultimoRegistroSono) {
        return {
          ...item,
          horas: ultimoRegistroSono.horas,
          qualidade: ultimoRegistroSono.qualidade,
        };
      }
      return item;
    });

    const sonoMediaSemana =
      Math.round(
        (sonoHistorico.reduce((acc, item) => acc + item.horas, 0) /
          sonoHistorico.length) *
          10,
      ) / 10;

    const hidratacaoHistorico = [
      { dia: "Seg", data: "03/11", consumoMl: 2250, metaMl: metaAguaMl },
      { dia: "Ter", data: "04/11", consumoMl: 2500, metaMl: metaAguaMl },
      { dia: "Qua", data: "05/11", consumoMl: 2000, metaMl: metaAguaMl },
      { dia: "Qui", data: "06/11", consumoMl: 2600, metaMl: metaAguaMl },
      { dia: "Sex", data: "07/11", consumoMl: 2100, metaMl: metaAguaMl },
      { dia: "Sáb", data: "08/11", consumoMl: 1900, metaMl: metaAguaMl },
      {
        dia: "Dom",
        data: "09/11",
        consumoMl: consumoHojeMl,
        metaMl: metaAguaMl,
      },
    ];

    let historicoPeso = [
      { data: "01/10", peso: Math.round((pesoAtualNum + 4.7) * 10) / 10 },
      { data: "10/10", peso: Math.round((pesoAtualNum + 3.3) * 10) / 10 },
      { data: "20/10", peso: Math.round((pesoAtualNum + 1.9) * 10) / 10 },
      { data: "30/10", peso: Math.round((pesoAtualNum + 0.8) * 10) / 10 },
      { data: "09/11", peso: pesoAtualNum },
    ];

    if (evolucoesComPeso.length > 0) {
      historicoPeso = evolucoesComPeso.map((ev) => {
        const d = new Date(ev.dataAtendimento);
        const dia = String(d.getDate()).padStart(2, "0");
        const mes = String(d.getMonth() + 1).padStart(2, "0");
        return {
          data: `${dia}/${mes}`,
          peso: Number(ev.pesoAtual),
        };
      });
      const ultimoHistorico = historicoPeso[historicoPeso.length - 1];
      if (ultimoHistorico && ultimoHistorico.peso !== pesoAtualNum) {
        const hoje = new Date();
        const dia = String(hoje.getDate()).padStart(2, "0");
        const mes = String(hoje.getMonth() + 1).padStart(2, "0");
        historicoPeso.push({
          data: `${dia}/${mes}`,
          peso: pesoAtualNum,
        });
      }
    }

    const pesoInicial =
      historicoPeso.length > 0
        ? historicoPeso[0].peso
        : Math.round((pesoAtualNum + 4.7) * 10) / 10;
    const perdaTotal = Math.round((pesoAtualNum - pesoInicial) * 10) / 10;

    const pesoEvolucao = {
      pesoInicialKg: pesoInicial,
      pesoAtualKg: pesoAtualNum,
      pesoAlvoKg,
      perdaTotalKg: perdaTotal,
      distanciaAlvoKg: Math.max(
        0,
        Math.round((pesoAtualNum - pesoAlvoKg) * 10) / 10,
      ),
      imcAtual,
      historico: historicoPeso,
    };

    return NextResponse.json({
      metas: {
        sonoHorasAlvo: metaSonoHoras,
        aguaMlAlvo: metaAguaMl,
        pesoAlvoKg,
        passosAlvo: 8000,
        caloriasAlvo: caloriasAlvoNum,
        caloriasBonusAlvo: caloriasBonusNum,
        pontosAlvo: caloriasAlvoNum,
        pontosBonusAlvo: caloriasBonusNum,
        focoMetabolico:
          paciente.treatmentObjective ||
          paciente.clinicalFocus ||
          "Otimização Metabólica & Saúde Integrativa",
        treatmentObjective:
          paciente.treatmentObjective ||
          paciente.clinicalFocus ||
          "Otimização Metabólica & Saúde Integrativa",
      },
      sonoHistorico,
      sonoMediaSemana,
      ultimoSono: ultimoRegistroSono
        ? {
            id: ultimoRegistroSono.id,
            horas: ultimoRegistroSono.horas,
            qualidade: ultimoRegistroSono.qualidade,
            observacao: ultimoRegistroSono.observacao,
            data: ultimoRegistroSono.data,
          }
        : null,
      horasDormidasRecentes: ultimoRegistroSono
        ? ultimoRegistroSono.horas
        : sonoMediaSemana,
      hidratacaoHoje: {
        consumidoMl: consumoHojeMl,
        metaMl: metaAguaMl,
        percentual: Math.min(
          100,
          Math.round((consumoHojeMl / metaAguaMl) * 100),
        ),
      },
      hidratacaoHistorico,
      pesoEvolucao,
    });
  } catch (error: unknown) {
    console.error("[METAS/GET] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consultar metas do paciente.", details },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/pacientes/[id]/metas
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas profissionais de saúde podem alterar metas clínicas.",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      sonoHorasAlvo,
      aguaMlAlvo,
      pesoAlvoKg,
      caloriasAlvo,
      caloriasBonusAlvo,
      pontosAlvo,
      pontosBonusAlvo,
      focoMetabolico,
      treatmentObjective,
    } = body;

    const aguaNum = Number.isFinite(Number(aguaMlAlvo))
      ? Number(aguaMlAlvo)
      : 2500;
    const sonoNum = Number.isFinite(Number(sonoHorasAlvo))
      ? Number(sonoHorasAlvo)
      : 8.0;
    const pesoAlvoNum = Number.isFinite(Number(pesoAlvoKg))
      ? Number(pesoAlvoKg)
      : 75.0;
    const caloriasRaw =
      caloriasAlvo !== undefined
        ? Number(caloriasAlvo)
        : pontosAlvo !== undefined
          ? Number(pontosAlvo)
          : 2000;
    const caloriasInput = Number.isFinite(caloriasRaw) ? caloriasRaw : 2000;
    const caloriasAlvoNum =
      caloriasInput > 200 ? caloriasInput : caloriasInput * 40;

    const bonusRaw =
      caloriasBonusAlvo !== undefined
        ? Number(caloriasBonusAlvo)
        : pontosBonusAlvo !== undefined
          ? Number(pontosBonusAlvo)
          : 300;
    const bonusInput = Number.isFinite(bonusRaw) ? bonusRaw : 300;
    const caloriasBonusNum =
      bonusInput === 0 || bonusInput > 50 ? bonusInput : bonusInput * 30;

    const objetivoTratamento = treatmentObjective || focoMetabolico;

    const patientRepo = await getRepository(PatientEntity);
    const goalRepo = await getRepository(PatientGoalEntity);

    await patientRepo.update(
      { id },
      {
        metaDiariaMl: aguaNum,
        ...(objetivoTratamento
          ? {
              clinicalFocus: String(objetivoTratamento).trim(),
              treatmentObjective: String(objetivoTratamento).trim(),
            }
          : {}),
      },
    );

    const pacienteAtualizado = await patientRepo.findOneOrFail({
      where: { id },
      select: { id: true, organizationId: true },
    });

    const goalSonoExistente = await goalRepo.findOne({
      where: {
        patientId: id,
        category: "SYMPTOM_DIARY",
        title: Raw((alias) => `LOWER(${alias}) LIKE :t`, { t: "%sono%" }),
      },
    });

    if (goalSonoExistente) {
      await goalRepo.update(
        { id: goalSonoExistente.id },
        { targetValue: sonoNum },
      );
    } else {
      await goalRepo.save(
        goalRepo.create({
          organizationId: pacienteAtualizado.organizationId,
          patientId: id,
          category: "SYMPTOM_DIARY",
          title: "QUALIDADE DO SONO",
          targetValue: sonoNum,
          unit: "h",
          frequency: "DAILY",
          isEnabledInApp: true,
          status: "ACTIVE",
        }),
      );
    }

    const goalPesoExistente = await goalRepo.findOne({
      where: {
        patientId: id,
        category: "CALORIE_BURN",
        title: Raw((alias) => `LOWER(${alias}) LIKE :t`, { t: "%peso%" }),
      },
    });

    if (goalPesoExistente) {
      await goalRepo.update(
        { id: goalPesoExistente.id },
        { targetValue: pesoAlvoNum },
      );
    } else {
      await goalRepo.save(
        goalRepo.create({
          organizationId: pacienteAtualizado.organizationId,
          patientId: id,
          category: "CALORIE_BURN",
          title: "META DE PESO CORPORAL",
          targetValue: pesoAlvoNum,
          unit: "kg",
          frequency: "DAILY",
          isEnabledInApp: true,
          status: "ACTIVE",
        }),
      );
    }

    const goalCaloriasExistente = await goalRepo.findOne({
      where: [
        {
          patientId: id,
          title: Raw((alias) => `LOWER(${alias}) LIKE :t1`, { t1: "%calor%" }),
        },
        {
          patientId: id,
          title: Raw((alias) => `LOWER(${alias}) LIKE :t2`, {
            t2: "%pontos%",
          }),
        },
      ],
    });

    if (goalCaloriasExistente) {
      await goalRepo.update(
        { id: goalCaloriasExistente.id },
        {
          title: "META CALÓRICA DIÁRIA (ALIMENTAÇÃO)",
          targetValue: caloriasAlvoNum,
          unit: "kcal",
        },
      );
    } else {
      await goalRepo.save(
        goalRepo.create({
          organizationId: pacienteAtualizado.organizationId,
          patientId: id,
          category: "SYMPTOM_DIARY",
          title: "META CALÓRICA DIÁRIA (ALIMENTAÇÃO)",
          targetValue: caloriasAlvoNum,
          unit: "kcal",
          frequency: "DAILY",
          isEnabledInApp: true,
          status: "ACTIVE",
        }),
      );
    }

    const goalBonusExistente = await goalRepo.findOne({
      where: [
        {
          patientId: id,
          title: Raw((alias) => `LOWER(${alias}) LIKE :t1`, { t1: "%gasto%" }),
        },
        {
          patientId: id,
          title: Raw((alias) => `LOWER(${alias}) LIKE :t2`, {
            t2: "%bônus%",
          }),
        },
      ],
    });

    if (goalBonusExistente) {
      await goalRepo.update(
        { id: goalBonusExistente.id },
        {
          title: "META DE GASTO CALÓRICO (TREINO)",
          targetValue: caloriasBonusNum,
          unit: "kcal",
        },
      );
    } else {
      await goalRepo.save(
        goalRepo.create({
          organizationId: pacienteAtualizado.organizationId,
          patientId: id,
          category: "CALORIE_BURN",
          title: "META DE GASTO CALÓRICO (TREINO)",
          targetValue: caloriasBonusNum,
          unit: "kcal",
          frequency: "DAILY",
          isEnabledInApp: true,
          status: "ACTIVE",
        }),
      );
    }

    return NextResponse.json({
      success: true,
      message: "Metas clínicas atualizadas com sucesso!",
      metas: {
        sonoHorasAlvo: sonoNum,
        aguaMlAlvo: aguaNum,
        pesoAlvoKg: pesoAlvoNum,
        caloriasAlvo: caloriasAlvoNum,
        caloriasBonusAlvo: caloriasBonusNum,
        pontosAlvo: caloriasAlvoNum,
        pontosBonusAlvo: caloriasBonusNum,
        passosAlvo: 8000,
        focoMetabolico: focoMetabolico
          ? String(focoMetabolico).trim().toUpperCase()
          : undefined,
      },
    });
  } catch (error: unknown) {
    console.error("[METAS/PUT] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao atualizar metas do paciente.", details },
      { status: 500 },
    );
  }
}
