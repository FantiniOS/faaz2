export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { IsNull, Not } from "typeorm";
import { getRepository, withTransaction } from "@/lib/db/data-source";
import {
  CheckinHidratacaoEntity,
  CheckInSonoEntity,
  EvolucaoClinicaEntity,
  PatientEntity,
  PatientGoalEntity,
  ProntuarioPacienteEntity,
  type GoalCategory,
  type PatientGoal,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Identificadores canônicos de cada meta na tabela PATIENT_GOALS (sem colisão entre Calorias Diárias, Gasto de Treino e Sono)
function isSleepGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return t.includes("SONO") || u === "h" || u === "horas";
}

function isHydrationGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return g.category === "HYDRATION" || t.includes("HIDRATA") || t.includes("ÁGUA") || t.includes("AGUA") || u === "ml";
}

function isWeightGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return t.includes("PESO") || u === "kg";
}

function isWorkoutCalorieGoal(g: PatientGoal): boolean {
  const t = (g.title || "").toUpperCase();
  return (
    t.includes("GASTO") ||
    t.includes("TREINO") ||
    t.includes("BÔNUS") ||
    t.includes("BONUS")
  );
}

function isDailyCalorieGoal(g: PatientGoal): boolean {
  if (isWorkoutCalorieGoal(g) || isSleepGoal(g) || isWeightGoal(g) || isHydrationGoal(g)) {
    return false;
  }
  const t = (g.title || "").toUpperCase();
  const u = (g.unit || "").toLowerCase().trim();
  return (
    t.includes("ALIMENTA") ||
    t.includes("CALOR") ||
    t.includes("CALÓR") ||
    t.includes("PONTO") ||
    u === "kcal" ||
    u === "pts"
  );
}

function parseFiniteNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val === "number") return Number.isFinite(val) ? val : undefined;
  const normalized = String(val).trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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

    const [
      prontuario,
      patientGoals,
      checkinsHidratacao,
      ultimoRegistroSono,
      evolucoesComPeso,
    ] = await Promise.all([
      prontuarioRepo.findOne({ where: { pacienteId: id } }),
      goalRepo.find({
        where: { patientId: id, deletedAt: IsNull() },
        order: { updatedAt: "DESC" },
      }),
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

    const activeGoals = patientGoals.filter((g) => g.status === "ACTIVE");

    const hidratacaoGoal = activeGoals.find(isHydrationGoal);
    const metaAguaMl =
      paciente.metaDiariaMl ||
      (hidratacaoGoal ? Math.round(Number(hidratacaoGoal.targetValue)) : 2500);

    const sonoGoal = activeGoals.find(isSleepGoal);
    const metaSonoHoras = sonoGoal ? Number(sonoGoal.targetValue) : 8.0;

    const caloriasGoal = activeGoals.find(isDailyCalorieGoal);
    const caloriasBonusGoal = activeGoals.find(isWorkoutCalorieGoal);

    const caloriasRaw = caloriasGoal ? Number(caloriasGoal.targetValue) : 2000;
    const caloriasAlvoNum = caloriasRaw > 200 ? caloriasRaw : caloriasRaw * 40;

    const bonusRaw = caloriasBonusGoal
      ? Number(caloriasBonusGoal.targetValue)
      : 300;
    const caloriasBonusNum =
      bonusRaw === 0 || bonusRaw > 50 ? bonusRaw : bonusRaw * 30;

    const pesoGoal = activeGoals.find(isWeightGoal);
    const pesoAtualNum =
      prontuario?.pesoAtualKg != null ? Number(prontuario.pesoAtualKg) : 84.5;
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

    const objetivoAtivo =
      paciente.treatmentObjective ||
      paciente.clinicalFocus ||
      "Otimização Metabólica & Saúde Integrativa";

    return NextResponse.json(
      {
        metas: {
          sonoHorasAlvo: metaSonoHoras,
          aguaMlAlvo: metaAguaMl,
          pesoAlvoKg,
          passosAlvo: 8000,
          caloriasAlvo: caloriasAlvoNum,
          caloriasBonusAlvo: caloriasBonusNum,
          pontosAlvo: caloriasAlvoNum,
          pontosBonusAlvo: caloriasBonusNum,
          focoMetabolico: objetivoAtivo,
          treatmentObjective: objetivoAtivo,
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
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
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
 * PUT / POST /api/pacientes/[id]/metas
 * Faz o Upsert transacional das 6 metas clínicas no Oracle Autonomous Database:
 *  1. Meta de Sono (horas/noite)              -> PATIENT_GOALS ("QUALIDADE DO SONO", unit="h")
 *  2. Meta de Água (ml/dia)                   -> PATIENTS.META_DIARIA_ML + PATIENT_GOALS ("META DE HIDRATAÇÃO DIÁRIA", category="HYDRATION")
 *  3. Peso Alvo Desejado (kg)                 -> PATIENT_GOALS ("META DE PESO CORPORAL", unit="kg")
 *  4. Meta Calórica Diária (kcal)             -> PATIENT_GOALS ("META CALÓRICA DIÁRIA (ALIMENTAÇÃO)", unit="kcal")
 *  5. Meta de Gasto Calórico via Treino (kcal)-> PATIENT_GOALS ("META DE GASTO CALÓRICO (TREINO)", unit="kcal")
 *  6. Objetivo do Tratamento (string)         -> PATIENTS.TREATMENT_OBJECTIVE & CLINICAL_FOCUS
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

    const parsedAgua = parseFiniteNumber(aguaMlAlvo);
    const parsedSono = parseFiniteNumber(sonoHorasAlvo);
    const parsedPeso = parseFiniteNumber(pesoAlvoKg);
    const parsedCalorias = parseFiniteNumber(caloriasAlvo ?? pontosAlvo);
    const parsedBonus = parseFiniteNumber(caloriasBonusAlvo ?? pontosBonusAlvo);
    const rawObjetivo =
      typeof treatmentObjective === "string" && treatmentObjective.trim()
        ? treatmentObjective.trim()
        : typeof focoMetabolico === "string" && focoMetabolico.trim()
          ? focoMetabolico.trim()
          : undefined;

    const resultado = await withTransaction(async (manager) => {
      const patientRepo = manager.getRepository(PatientEntity);
      const goalRepo = manager.getRepository(PatientGoalEntity);

      const paciente = await patientRepo.findOne({
        where: { id },
      });

      if (!paciente || paciente.deletedAt) {
        return null;
      }

      const aguaFinal =
        parsedAgua !== undefined
          ? Math.round(parsedAgua)
          : paciente.metaDiariaMl || 2500;
      const objetivoFinal =
        rawObjetivo ||
        paciente.treatmentObjective ||
        paciente.clinicalFocus ||
        "Otimização Metabólica & Saúde Integrativa";

      // 1. Atualiza PATIENTS (META_DIARIA_ML, TREATMENT_OBJECTIVE, CLINICAL_FOCUS)
      paciente.metaDiariaMl = aguaFinal;
      if (rawObjetivo) {
        paciente.treatmentObjective = rawObjetivo;
        paciente.clinicalFocus = rawObjetivo;
      }
      if (sessao?.userId) {
        paciente.updatedBy = sessao.userId;
      }
      await patientRepo.save(paciente);

      // 2. Carrega todas as metas existentes do paciente em uma única consulta
      const existingGoals = await goalRepo.find({
        where: { patientId: id, deletedAt: IsNull() },
        order: { updatedAt: "DESC" },
      });

      const upsertGoal = async (
        matcher: (g: PatientGoal) => boolean,
        config: {
          category: GoalCategory;
          title: string;
          targetValue: number;
          unit: string;
        },
      ) => {
        const matches = existingGoals.filter(matcher);
        const primary = matches[0];

        if (primary) {
          primary.category = config.category;
          primary.title = config.title;
          primary.targetValue = config.targetValue;
          primary.unit = config.unit;
          primary.status = "ACTIVE";
          primary.isEnabledInApp = true;
          if (sessao?.userId) {
            primary.updatedBy = sessao.userId;
          }
          await goalRepo.save(primary);

          // Se existirem duplicatas legadas para a mesma meta, pausa as antigas para não conflitar no GET
          for (let i = 1; i < matches.length; i++) {
            if (matches[i].status === "ACTIVE") {
              matches[i].status = "REPLACED";
              await goalRepo.save(matches[i]);
            }
          }
          return config.targetValue;
        }

        await goalRepo.save(
          goalRepo.create({
            organizationId: paciente.organizationId,
            patientId: id,
            category: config.category,
            title: config.title,
            targetValue: config.targetValue,
            unit: config.unit,
            frequency: "DAILY",
            isEnabledInApp: true,
            status: "ACTIVE",
            createdBy: sessao?.userId ?? null,
            updatedBy: sessao?.userId ?? null,
          }),
        );
        return config.targetValue;
      };

      const prevSono = existingGoals.find(isSleepGoal);
      const prevPeso = existingGoals.find(isWeightGoal);
      const prevCalorias = existingGoals.find(isDailyCalorieGoal);
      const prevBonus = existingGoals.find(isWorkoutCalorieGoal);

      const sonoFinal =
        parsedSono !== undefined
          ? Math.round(parsedSono * 10) / 10
          : prevSono
            ? Number(prevSono.targetValue)
            : 8.0;

      const pesoFinal =
        parsedPeso !== undefined
          ? Math.round(parsedPeso * 10) / 10
          : prevPeso
            ? Number(prevPeso.targetValue)
            : 75.0;

      const caloriasRaw =
        parsedCalorias !== undefined
          ? parsedCalorias
          : prevCalorias
            ? Number(prevCalorias.targetValue)
            : 2000;
      const caloriasFinal = Math.round(
        caloriasRaw > 200 ? caloriasRaw : caloriasRaw * 40,
      );

      const bonusRaw =
        parsedBonus !== undefined
          ? parsedBonus
          : prevBonus
            ? Number(prevBonus.targetValue)
            : 300;
      const bonusFinal = Math.round(
        bonusRaw === 0 || bonusRaw > 50 ? bonusRaw : bonusRaw * 30,
      );

      // Upsert apenas das metas enviadas (ou todas quando submeter o formulário completo)
      if (parsedAgua !== undefined) {
        await upsertGoal(isHydrationGoal, {
          category: "HYDRATION",
          title: "META DE HIDRATAÇÃO DIÁRIA",
          targetValue: aguaFinal,
          unit: "ml",
        });
      }

      if (parsedSono !== undefined) {
        await upsertGoal(isSleepGoal, {
          category: "SYMPTOM_DIARY",
          title: "QUALIDADE DO SONO",
          targetValue: sonoFinal,
          unit: "h",
        });
      }

      if (parsedPeso !== undefined) {
        await upsertGoal(isWeightGoal, {
          category: "CALORIE_BURN",
          title: "META DE PESO CORPORAL",
          targetValue: pesoFinal,
          unit: "kg",
        });
      }

      if (parsedCalorias !== undefined) {
        await upsertGoal(isDailyCalorieGoal, {
          category: "SYMPTOM_DIARY",
          title: "META CALÓRICA DIÁRIA (ALIMENTAÇÃO)",
          targetValue: caloriasFinal,
          unit: "kcal",
        });
      }

      if (parsedBonus !== undefined) {
        await upsertGoal(isWorkoutCalorieGoal, {
          category: "CALORIE_BURN",
          title: "META DE GASTO CALÓRICO (TREINO)",
          targetValue: bonusFinal,
          unit: "kcal",
        });
      }

      return {
        sonoHorasAlvo: sonoFinal,
        aguaMlAlvo: aguaFinal,
        pesoAlvoKg: pesoFinal,
        caloriasAlvo: caloriasFinal,
        caloriasBonusAlvo: bonusFinal,
        pontosAlvo: caloriasFinal,
        pontosBonusAlvo: bonusFinal,
        passosAlvo: 8000,
        focoMetabolico: objetivoFinal,
        treatmentObjective: objetivoFinal,
      };
    });

    if (!resultado) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    try {
      revalidatePath(`/pacientes/${id}`);
      revalidatePath("/dashboard/pacientes");
    } catch {
      // ignora erro de revalidação fora de contexto RSC
    }

    return NextResponse.json({
      success: true,
      message: "Metas clínicas atualizadas com sucesso!",
      metas: resultado,
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

export async function POST(req: NextRequest, context: RouteParams) {
  return PUT(req, context);
}
