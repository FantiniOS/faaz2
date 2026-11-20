export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { In } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  BiometricMeasurementEntity,
  EvolucaoClinicaEntity,
  GoalCheckinEntity,
  MeasurementEntity,
  PatientEntity,
  ProntuarioPacienteEntity,
  RegistroGlicemiaEntity,
  UserEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import { invalidarCacheMetricaPeso } from "@/lib/metrica-peso-eliminado";
import { toIsoUtc } from "@/lib/date-br";
import {
  normalizarObjetivoClinicoValor,
  resolverObjetivoAtivo,
} from "@/lib/objetivo-clinico";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/prontuario
 * Busca o prontuário clínico e os dados essenciais do paciente.
 * Acesso restrito: DONO_CLINICA, MEDICO.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const reqStart = performance.now();
  try {
    const { id } = await params;
    const sessao = await getSessao();

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. O prontuário clínico é restrito ao corpo médico e ao responsável clínico.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    const dbStart = performance.now();
    const [
      patientRepo,
      prontuarioRepo,
      evolucaoRepo,
      glicemiaRepo,
      bioRepo,
      measurementRepo,
      goalCheckinRepo,
    ] = await Promise.all([
      getRepository(PatientEntity),
      getRepository(ProntuarioPacienteEntity),
      getRepository(EvolucaoClinicaEntity),
      getRepository(RegistroGlicemiaEntity),
      getRepository(BiometricMeasurementEntity),
      getRepository(MeasurementEntity),
      getRepository(GoalCheckinEntity),
    ]);

    // Executa leitura do paciente e séries clínicas em paralelo (elimina 1 round-trip sequencial)
    // e omite CLOBs pesados não exibidos no prontuário (workoutRestrictions, activeModules).
    const [
      paciente,
      prontuario,
      evolucoesClinicas,
      registrosGlicemia,
      biometricMeasurements,
      measurements,
    ] = await Promise.all([
      patientRepo.findOne({
        where: { id },
        select: {
          id: true,
          recordCode: true,
          fullName: true,
          socialName: true,
          cpf: true,
          birthDate: true,
          biologicalSex: true,
          patientStatus: true,
          convenio: true,
          phoneWhatsapp: true,
          heightCm: true,
          clinicalFocus: true,
          treatmentObjective: true,
          avatarUrl: true,
          photoUrl: true,
          deletedAt: true,
        },
      }),
      prontuarioRepo.findOne({ where: { pacienteId: id } }),
      evolucaoRepo.find({
        where: { pacienteId: id },
        order: { dataAtendimento: "DESC", createdAt: "DESC" },
      }),
      glicemiaRepo.find({
        where: { pacienteId: id },
        select: {
          id: true,
          dataRegistro: true,
          valor: true,
          momento: true,
        },
        order: { dataRegistro: "DESC", createdAt: "DESC" },
        take: 30,
      }),
      bioRepo.find({
        where: { patientId: id },
        select: {
          id: true,
          measuredAt: true,
          waistCircumferenceCm: true,
          bodyFatPercentage: true,
        },
        order: { measuredAt: "DESC", createdAt: "DESC" },
        take: 30,
      }),
      measurementRepo.find({
        where: { patientId: id },
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
          createdBy: true,
        },
        order: { measuredAt: "DESC", createdAt: "DESC" },
        take: 50,
      }),
    ]);

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const clinicianIds = Array.from(
      new Set(
        measurements
          .map((m) => m.createdBy)
          .filter(
            (uid): uid is string =>
              typeof uid === "string" &&
              uid !== "PATIENT_APP_SELF_REPORT" &&
              /^[0-9a-f-]{32,36}$/i.test(uid),
          ),
      ),
    );

    // Fallback legado de glicemia (GOAL_CHECKINS) e nomes dos profissionais das medidas em paralelo
    const [goalCheckins, clinicianUsers] = await Promise.all([
      registrosGlicemia.length === 0
        ? goalCheckinRepo.find({
            where: {
              patientId: id,
              patientGoal: {
                category: "CAPILLARY_GLUCOSE",
              },
            },
            select: {
              id: true,
              referenceDate: true,
              recordedValue: true,
              patientGoal: { id: true, category: true },
            },
            relations: { patientGoal: true },
            order: { referenceDate: "DESC", createdAt: "DESC" },
            take: 30,
          })
        : Promise.resolve([]),
      clinicianIds.length > 0
        ? getRepository(UserEntity).then((userRepo) =>
            userRepo.find({
              where: { id: In(clinicianIds) },
              select: { id: true, title: true, fullName: true },
            }),
          )
        : Promise.resolve([]),
    ]);

    const clinicianNameMap = new Map<string, string>();
    for (const u of clinicianUsers) {
      const t = u.title?.trim() || "";
      const fn = u.fullName?.trim() || "";
      const displayName =
        t && fn && !fn.toLowerCase().startsWith(t.toLowerCase())
          ? `${t} ${fn}`
          : fn || t;
      if (displayName) {
        clinicianNameMap.set(u.id, displayName);
      }
    }
    const dbDurMs = Math.round(performance.now() - dbStart);

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

    const statusFormatado =
      paciente.patientStatus === "ACTIVE" ? "Ativo" : "Inativo";
    const sexoFormatado =
      paciente.biologicalSex === "FEMALE"
        ? "Feminino"
        : paciente.biologicalSex === "MALE"
          ? "Masculino"
          : "Outro";

    const pesoAtualKg =
      prontuario?.pesoAtualKg != null ? Number(prontuario.pesoAtualKg) : null;
    const alturaCm =
      prontuario?.alturaCm != null
        ? Number(prontuario.alturaCm)
        : paciente.heightCm != null
          ? Number(paciente.heightCm)
          : null;
    const imc = prontuario?.imc != null ? Number(prontuario.imc) : null;

    const findFirstNonNullMeasurement = (
      key:
        | "bodyFatPercentage"
        | "waist"
        | "abdomen"
        | "hips"
        | "rightArm"
        | "leftArm"
        | "rightThigh"
        | "leftThigh",
    ): number | null => {
      for (const m of measurements) {
        const val = m[key];
        if (val !== null && val !== undefined && !Number.isNaN(Number(val))) {
          return Number(val);
        }
      }
      return null;
    };

    const bioRecente = biometricMeasurements[0];
    const regGlicemiaRecente = registrosGlicemia[0];
    const glicemiaRecente =
      regGlicemiaRecente?.valor != null
        ? Number(regGlicemiaRecente.valor)
        : goalCheckins[0]?.recordedValue != null
          ? Number(goalCheckins[0].recordedValue)
          : null;
    const latestWaistVal = findFirstNonNullMeasurement("waist");
    const latestAbdomenVal = findFirstNonNullMeasurement("abdomen");
    const latestBodyFatVal = findFirstNonNullMeasurement("bodyFatPercentage");

    const circunferenciaAbdominal =
      latestWaistVal !== null
        ? latestWaistVal
        : latestAbdomenVal !== null
          ? latestAbdomenVal
          : bioRecente?.waistCircumferenceCm != null
            ? Number(bioRecente.waistCircumferenceCm)
            : null;
    const percentualGordura =
      latestBodyFatVal !== null
        ? latestBodyFatVal
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

    const biometriaHistorico = biometricMeasurements.map((b) => ({
      id: b.id,
      measuredAt: new Date(b.measuredAt).toISOString(),
      waistCircumferenceCm:
        b.waistCircumferenceCm != null ? Number(b.waistCircumferenceCm) : null,
      bodyFatPercentage:
        b.bodyFatPercentage != null ? Number(b.bodyFatPercentage) : null,
    }));

    const measurementsHistorico = measurements.map((m) => ({
      id: m.id,
      patientId: m.patientId,
      measuredAt: toIsoUtc(m.measuredAt) ?? new Date(m.measuredAt).toISOString(),
      bodyFatPercentage:
        m.bodyFatPercentage != null ? Number(m.bodyFatPercentage) : null,
      waist: m.waist != null ? Number(m.waist) : null,
      abdomen: m.abdomen != null ? Number(m.abdomen) : null,
      hips: m.hips != null ? Number(m.hips) : null,
      rightArm: m.rightArm != null ? Number(m.rightArm) : null,
      leftArm: m.leftArm != null ? Number(m.leftArm) : null,
      rightThigh: m.rightThigh != null ? Number(m.rightThigh) : null,
      leftThigh: m.leftThigh != null ? Number(m.leftThigh) : null,
      notes: m.notes ?? null,
      createdBy: m.createdBy ?? null,
      createdByName:
        m.createdBy && m.createdBy !== "PATIENT_APP_SELF_REPORT"
          ? clinicianNameMap.get(m.createdBy) ?? null
          : null,
    }));

    const glicemiaHistorico =
      registrosGlicemia.length > 0
        ? registrosGlicemia.map((g) => ({
            id: g.id,
            referenceDate: new Date(g.dataRegistro).toISOString(),
            recordedValue: Number(g.valor),
            momento: g.momento,
            notes: `Medição: ${momentoLabel(g.momento)}`,
          }))
        : goalCheckins.map((g) => ({
            id: g.id,
            referenceDate: new Date(g.referenceDate).toISOString(),
            recordedValue:
              g.recordedValue != null ? Number(g.recordedValue) : null,
            momento: "JEJUM",
            notes: null,
          }));

    const birthDateIso = paciente.birthDate
      ? String(paciente.birthDate).split("T")[0]
      : null;

    // Fonte única de verdade para o Objetivo do Tratamento (prioriza PATIENTS.TREATMENT_OBJECTIVE)
    const objetivoUnificado = resolverObjetivoAtivo(
      paciente.treatmentObjective,
      paciente.clinicalFocus,
      prontuario?.objetivo,
    );

    return NextResponse.json(
      {
        success: true,
        paciente: {
          id: paciente.id,
          recordCode: paciente.recordCode,
          nome: paciente.socialName || paciente.fullName,
          cpf: paciente.cpf,
          birthDate: birthDateIso,
          idade,
          sexo: sexoFormatado,
          status: statusFormatado,
          convenio: paciente.convenio,
          telefoneWhatsapp: paciente.phoneWhatsapp,
          heightCm: paciente.heightCm != null ? Number(paciente.heightCm) : null,
          clinicalFocus: objetivoUnificado || null,
          treatmentObjective: objetivoUnificado || null,
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
          objetivo: objetivoUnificado,
          comorbidades: prontuario?.comorbidades || "",
          alergias: prontuario?.alergias || "",
          medicacoes: prontuario?.medicacoes || "",
          evolucao: prontuario?.evolucao || "",
          ultimaAtualizacao: toIsoUtc(prontuario?.updatedAt) || null,
        },
        historico: evolucoesClinicas.map((ev) => ({
          ...ev,
          dataAtendimento:
            toIsoUtc(ev.dataAtendimento) ?? new Date(ev.dataAtendimento).toISOString(),
          createdAt: toIsoUtc(ev.createdAt) ?? new Date(ev.createdAt).toISOString(),
          updatedAt: toIsoUtc(ev.updatedAt) ?? new Date(ev.updatedAt).toISOString(),
        })),
        biometriaHistorico,
        measurementsHistorico,
        glicemiaHistorico,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          "Server-Timing": `db;dur=${dbDurMs};desc="Oracle ADB", total;dur=${Math.round(
            performance.now() - reqStart
          )}`,
        },
      },
    );
  } catch (error: unknown) {
    console.error("[PRONTUARIO/GET] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao buscar prontuário do paciente.", details },
      { status: 500 },
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

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas o corpo médico e o dono da clínica podem salvar prontuários.",
          bloqueado: true,
        },
        { status: 403 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);
    const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
    const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);

    const paciente = await patientRepo.findOne({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!paciente || paciente.deletedAt) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
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

    const pesoNum =
      pesoAtualKg !== undefined && pesoAtualKg !== null && pesoAtualKg !== ""
        ? parseFloat(String(pesoAtualKg).replace(",", "."))
        : null;

    const alturaNum =
      alturaCm !== undefined && alturaCm !== null && alturaCm !== ""
        ? parseFloat(String(alturaCm).replace(",", "."))
        : null;

    let imcCalculado: number | null = null;
    if (pesoNum && alturaNum && pesoNum > 0 && alturaNum > 0) {
      const alturaM = alturaNum > 3 ? alturaNum / 100 : alturaNum;
      imcCalculado = Math.round((pesoNum / (alturaM * alturaM)) * 100) / 100;
    }

    const objetivoNormalizado = objetivo
      ? normalizarObjetivoClinicoValor(String(objetivo))
      : null;

    const fields = {
      pesoAtualKg: pesoNum,
      alturaCm: alturaNum,
      imc: imcCalculado,
      objetivo: objetivoNormalizado,
      comorbidades: comorbidades
        ? String(comorbidades).trim().toUpperCase()
        : null,
      alergias: alergias ? String(alergias).trim().toUpperCase() : null,
      medicacoes: medicacoes ? String(medicacoes).trim().toUpperCase() : null,
      evolucao: evolucao ? String(evolucao).trim().toUpperCase() : null,
    };

    const existingProntuario = await prontuarioRepo.findOne({
      where: { pacienteId: id },
    });

    const prontuarioSalvo = existingProntuario
      ? await prontuarioRepo.save({
          ...existingProntuario,
          ...fields,
        })
      : await prontuarioRepo.save(
          prontuarioRepo.create({
            pacienteId: id,
            ...fields,
          }),
        );

    const patientUpdateData: {
      heightCm?: number;
      treatmentObjective?: string;
      clinicalFocus?: string;
    } = {};
    if (alturaNum && alturaNum > 0) {
      patientUpdateData.heightCm = alturaNum;
    }
    if (objetivoNormalizado) {
      patientUpdateData.treatmentObjective = objetivoNormalizado;
      patientUpdateData.clinicalFocus = objetivoNormalizado;
    }
    if (Object.keys(patientUpdateData).length > 0) {
      await patientRepo.update({ id }, patientUpdateData);
    }

    if (registrarAtendimento && (evolucao || queixaPrincipal || pesoNum)) {
      await evolucaoRepo.save(
        evolucaoRepo.create({
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
          medicoResponsavel: sessao?.nome || "Equipe Clínica FAAZ",
        }),
      );
    }

    invalidarCacheMetricaPeso();

    const historicoAtualizado = await evolucaoRepo.find({
      where: { pacienteId: id },
      order: { dataAtendimento: "DESC" },
    });

    return NextResponse.json({
      success: true,
      message: "Atendimento registrado e prontuário salvo com sucesso!",
      prontuario: {
        ...prontuarioSalvo,
        pesoAtualKg:
          prontuarioSalvo.pesoAtualKg != null
            ? Number(prontuarioSalvo.pesoAtualKg)
            : null,
        alturaCm:
          prontuarioSalvo.alturaCm != null
            ? Number(prontuarioSalvo.alturaCm)
            : null,
        imc: prontuarioSalvo.imc != null ? Number(prontuarioSalvo.imc) : null,
      },
      historico: historicoAtualizado,
    });
  } catch (error: unknown) {
    console.error("[PRONTUARIO/PUT] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao salvar prontuário.", details },
      { status: 500 },
    );
  }
}
