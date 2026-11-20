export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Between, IsNull, MoreThanOrEqual } from "typeorm";
import { z } from "zod";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  CheckInSonoEntity,
  DietSubstitutionEntity,
  GoalCheckinEntity,
  PatientEntity,
  PatientGoalEntity,
  RegistroGlicemiaEntity,
  WorkoutLogEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { getDataDiaBR, getInicioFimDiaBR } from "@/lib/date-br";

async function calcularMetricasReaisClinica(
  startOfDay: Date,
  endOfDay: Date,
) {
  const sevenDaysAgo = new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    patientRepo,
    goalRepo,
    hidraRepo,
    dietaSubRepo,
    goalCheckinRepo,
    intestinoRepo,
    workoutRepo,
    sonoRepo,
    glicemiaRepo,
  ] = await Promise.all([
    getRepository(PatientEntity),
    getRepository(PatientGoalEntity),
    getRepository(CheckinHidratacaoEntity),
    getRepository(DietSubstitutionEntity),
    getRepository(GoalCheckinEntity),
    getRepository(CheckinIntestinalEntity),
    getRepository(WorkoutLogEntity),
    getRepository(CheckInSonoEntity),
    getRepository(RegistroGlicemiaEntity),
  ]);

  const [
    pacientesAtivos,
    activeGoals,
    todosRegistrosHoje,
    hidra7d,
    dietaSub7d,
    goalCheckins7d,
    intestino7d,
    workout7d,
    sono7d,
    glicemia7d,
  ] = await Promise.all([
    patientRepo.find({
      where: {
        patientStatus: "ACTIVE",
        deletedAt: IsNull(),
      },
      select: {
        id: true,
        cpf: true,
        recordCode: true,
        metaDiariaMl: true,
      },
    }),
    goalRepo.find({
      where: {
        status: "ACTIVE",
        deletedAt: IsNull(),
      },
      select: {
        patientId: true,
        category: true,
        title: true,
        unit: true,
        targetValue: true,
      },
    }),
    hidraRepo.find({
      where: {
        data: Between(startOfDay, endOfDay),
      },
      order: { data: "DESC" },
    }),
    hidraRepo.find({
      where: {
        data: MoreThanOrEqual(sevenDaysAgo),
      },
      select: { pacienteId: true },
    }),
    dietaSubRepo.find({
      where: {
        date: MoreThanOrEqual(sevenDaysAgo),
      },
      select: { patientId: true },
    }),
    goalCheckinRepo.find({
      where: {
        createdAt: MoreThanOrEqual(sevenDaysAgo),
      },
      select: { patientId: true },
    }),
    intestinoRepo.find({
      where: {
        data: MoreThanOrEqual(sevenDaysAgo),
      },
      select: { pacienteId: true },
    }),
    workoutRepo.find({
      where: {
        date: MoreThanOrEqual(sevenDaysAgo),
      },
      select: { patientId: true },
    }),
    sonoRepo.find({
      where: {
        data: MoreThanOrEqual(sevenDaysAgo),
      },
      select: { pacienteId: true },
    }),
    glicemiaRepo.find({
      where: {
        dataRegistro: MoreThanOrEqual(sevenDaysAgo),
      },
      select: { pacienteId: true },
    }),
  ]);

  // Mapa de metas hídricas individuais em PATIENT_GOALS
  const hidraGoalByPatient = new Map<string, number>();
  for (const g of activeGoals) {
    const t = (g.title || "").toUpperCase();
    const u = (g.unit || "").toLowerCase().trim();
    if (
      g.category === "HYDRATION" ||
      t.includes("HIDRATA") ||
      t.includes("ÁGUA") ||
      t.includes("AGUA") ||
      u === "ml"
    ) {
      if (!hidraGoalByPatient.has(g.patientId)) {
        hidraGoalByPatient.set(g.patientId, Math.round(Number(g.targetValue) || 0));
      }
    }
  }

  // Soma real da meta de água de todos os pacientes ativos no banco Oracle
  const pacientesAtivosProtocolo = pacientesAtivos.length;
  const metaTotalHojeMl = pacientesAtivos.reduce((sum, p) => {
    const metaGoal = hidraGoalByPatient.get(p.id);
    const metaPaciente =
      metaGoal && metaGoal > 0 ? metaGoal : Number(p.metaDiariaMl) || 0;
    return sum + metaPaciente;
  }, 0);
  const metaTotalHojeL = parseFloat((metaTotalHojeMl / 1000).toFixed(1));

  // Soma real (SUM) dos check-ins de água realizados na data de hoje
  const totalConsumidoHojeMl = todosRegistrosHoje.reduce(
    (sum, r) => sum + (Number(r.volumeMl) || 0),
    0,
  );
  const totalConsumidoHojeL = parseFloat(
    (totalConsumidoHojeMl / 1000).toFixed(1),
  );

  const percentualAderencia =
    metaTotalHojeMl > 0
      ? Math.min(100, Math.round((totalConsumidoHojeMl / metaTotalHojeMl) * 100))
      : 0;

  // Normaliza identificadores (UUID, CPF, recordCode) para o ID canônico do paciente ativo
  const lookupToPatientId = new Map<string, string>();
  for (const p of pacientesAtivos) {
    lookupToPatientId.set(p.id, p.id);
    if (p.recordCode) lookupToPatientId.set(p.recordCode, p.id);
    if (p.cpf) {
      lookupToPatientId.set(p.cpf, p.id);
      lookupToPatientId.set(p.cpf.replace(/\D/g, ""), p.id);
    }
  }

  const resolveActivePatientId = (rawId?: string | null): string | null => {
    if (!rawId) return null;
    return lookupToPatientId.get(rawId) || lookupToPatientId.get(rawId.replace(/\D/g, "")) || null;
  };

  // Engajamento no App: (Pacientes ativos que fizeram check-in alimentar/hídrico nos últimos 7 dias / Total de pacientes ativos) * 100
  const engajadosAlimentarHidricoSet = new Set<string>();
  for (const r of hidra7d) {
    const pid = resolveActivePatientId(r.pacienteId);
    if (pid) engajadosAlimentarHidricoSet.add(pid);
  }
  for (const r of dietaSub7d) {
    const pid = resolveActivePatientId(r.patientId);
    if (pid) engajadosAlimentarHidricoSet.add(pid);
  }
  for (const r of goalCheckins7d) {
    const pid = resolveActivePatientId(r.patientId);
    if (pid) engajadosAlimentarHidricoSet.add(pid);
  }

  const pacientesEngajados7d = engajadosAlimentarHidricoSet.size;
  const engajamentoPercentual =
    pacientesAtivosProtocolo > 0
      ? Math.min(
          100,
          Math.round((pacientesEngajados7d / pacientesAtivosProtocolo) * 100),
        )
      : 0;

  // Risco de Evasão: Pacientes ativos cujo último check-in/interação no app foi há mais de 7 dias (ou nunca interagiram)
  const ativosUltimos7dSet = new Set<string>(engajadosAlimentarHidricoSet);
  for (const r of intestino7d) {
    const pid = resolveActivePatientId(r.pacienteId);
    if (pid) ativosUltimos7dSet.add(pid);
  }
  for (const r of workout7d) {
    const pid = resolveActivePatientId(r.patientId);
    if (pid) ativosUltimos7dSet.add(pid);
  }
  for (const r of sono7d) {
    const pid = resolveActivePatientId(r.pacienteId);
    if (pid) ativosUltimos7dSet.add(pid);
  }
  for (const r of glicemia7d) {
    const pid = resolveActivePatientId(r.pacienteId);
    if (pid) ativosUltimos7dSet.add(pid);
  }

  const pacientesEmRiscoCount = pacientesAtivos.filter(
    (p) => !ativosUltimos7dSet.has(p.id),
  ).length;

  const pacientesQueRegistraramHojeSet = new Set<string>();
  for (const r of todosRegistrosHoje) {
    const pid = resolveActivePatientId(r.pacienteId) || r.pacienteId;
    if (pid) pacientesQueRegistraramHojeSet.add(pid);
  }

  return {
    todosRegistrosHoje,
    pacientesAtivosProtocolo,
    pacientesQueRegistraramHoje: pacientesQueRegistraramHojeSet.size,
    totalConsumidoHojeMl,
    totalConsumidoHojeL,
    metaTotalHojeMl,
    metaTotalHojeL,
    percentualAderencia,
    engajamentoApp: {
      percentual: engajamentoPercentual,
      pacientesEngajados7d,
      totalPacientesAtivos: pacientesAtivosProtocolo,
    },
    riscoEvasao: {
      pacientesEmRisco: pacientesEmRiscoCount,
      totalPacientesAtivos: pacientesAtivosProtocolo,
    },
  };
}

const checkinHidratacaoSchema = z.object({
  pacienteId: z.string().min(1, "O identificador do paciente é obrigatório."),
  volumeMl: z
    .number()
    .int("O volume deve ser um número inteiro.")
    .positive("O volume ingerido deve ser maior que zero."),
  metaDiariaMl: z.number().int().positive().optional().default(2500),
  data: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();

    const validationResult = checkinHidratacaoSchema.safeParse(json);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Dados de hidratação inválidos.",
          issues: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { pacienteId, volumeMl, metaDiariaMl, data } = validationResult.data;

    const repo = await getRepository(CheckinHidratacaoEntity);
    const checkin = await repo.save(
      repo.create({
        pacienteId,
        volumeMl,
        metaDiariaMl,
        ...(data ? { data: new Date(data) } : {}),
      }),
    );

    const { inicioUtc: startOfDay, fimUtc: endOfDay } = getInicioFimDiaBR();

    const metricasClinica = await calcularMetricasReaisClinica(
      startOfDay,
      endOfDay,
    );

    const pacienteHojeRegistros = metricasClinica.todosRegistrosHoje.filter(
      (r) => r.pacienteId === pacienteId,
    );

    const pacienteTotalHojeMl = pacienteHojeRegistros.reduce(
      (acc, r) => acc + r.volumeMl,
      0,
    );
    const pacientePercentual = Math.min(
      100,
      Math.round((pacienteTotalHojeMl / metaDiariaMl) * 100),
    );

    return NextResponse.json(
      {
        success: true,
        message: `+${volumeMl}ml de água registrados com sucesso!`,
        data: checkin,
        totalHojeMl: pacienteTotalHojeMl,
        metaDiariaMl,
        percentual: pacientePercentual,
        totalConsumidoHojeMl: metricasClinica.totalConsumidoHojeMl,
        totalConsumidoHojeL: metricasClinica.totalConsumidoHojeL,
        metaTotalHojeMl: metricasClinica.metaTotalHojeMl,
        metaTotalHojeL: metricasClinica.metaTotalHojeL,
        percentualAderencia: metricasClinica.percentualAderencia,
        pacientesAtivosProtocolo: metricasClinica.pacientesAtivosProtocolo,
        pacientesQueRegistraramHoje: metricasClinica.pacientesQueRegistraramHoje,
        engajamentoApp: metricasClinica.engajamentoApp,
        riscoEvasao: metricasClinica.riscoEvasao,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_HIDRATACAO_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro interno no servidor ao registrar hidratação.",
        details,
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sessao = await getSessao();
    const sessaoRole = (sessao as { role?: string } | null)?.role;
    if (
      sessao &&
      (sessao.cargo === "SECRETARIA" ||
        sessaoRole === "SECRETARIA" ||
        sessaoRole === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso Negado (LGPD/RBAC)",
          motivo:
            "Secretárias não possuem autorização para acessar dados de hidratação metabólica de pacientes.",
        },
        { status: 403 },
      );
    }
    const { searchParams } = new URL(req.url);
    const pacienteIdParam = searchParams.get("pacienteId");

    const { inicioUtc: startOfDay, fimUtc: endOfDay } = getInicioFimDiaBR();

    const metricasClinica = await calcularMetricasReaisClinica(
      startOfDay,
      endOfDay,
    );
    const {
      todosRegistrosHoje,
      totalConsumidoHojeMl,
      totalConsumidoHojeL,
      metaTotalHojeMl,
      metaTotalHojeL,
      percentualAderencia,
      pacientesAtivosProtocolo,
      pacientesQueRegistraramHoje,
      engajamentoApp,
      riscoEvasao,
    } = metricasClinica;

    let pacienteData: {
      pacienteId: string;
      totalHojeMl: number;
      metaDiariaMl: number;
      percentual: number;
      countHoje: number;
    } | null = null;
    if (pacienteIdParam) {
      const pacienteRegistros = todosRegistrosHoje.filter(
        (r) => r.pacienteId === pacienteIdParam,
      );
      const pacienteTotalMl = pacienteRegistros.reduce(
        (sum, r) => sum + r.volumeMl,
        0,
      );
      const pacienteMetaMl =
        pacienteRegistros.length > 0 ? pacienteRegistros[0].metaDiariaMl : 0;
      const pacientePerc =
        pacienteMetaMl > 0
          ? Math.min(100, Math.round((pacienteTotalMl / pacienteMetaMl) * 100))
          : 0;

      pacienteData = {
        pacienteId: pacienteIdParam,
        totalHojeMl: pacienteTotalMl,
        metaDiariaMl: pacienteMetaMl,
        percentual: pacientePerc,
        countHoje: pacienteRegistros.length,
      };
    }

    return NextResponse.json(
      {
        success: true,
        dataReferencia: getDataDiaBR(),
        totalConsumidoHojeMl,
        totalConsumidoHojeL,
        metaTotalHojeMl,
        metaTotalHojeL,
        percentualAderencia,
        pacientesAtivosProtocolo,
        pacientesQueRegistraramHoje,
        totalRegistrosHoje: todosRegistrosHoje.length,
        engajamentoApp,
        riscoEvasao,
        paciente: pacienteData,
        totalHojeMl: pacienteData
          ? pacienteData.totalHojeMl
          : totalConsumidoHojeMl,
        metaDiariaMl: pacienteData
          ? pacienteData.metaDiariaMl
          : metaTotalHojeMl,
        percentual: pacienteData
          ? pacienteData.percentual
          : percentualAderencia,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_HIDRATACAO_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro ao consultar dados de aderência hídrica.",
        details,
      },
      { status: 500 },
    );
  }
}
