export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Between, IsNull, MoreThanOrEqual, Raw } from "typeorm";
import { z } from "zod";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import {
  PatientEntity,
  RegistroGlicemiaEntity,
  RegistroInsulinaEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import {
  formatarHoraBR,
  getDataDiaBR,
  getInicioFimDiaBR,
  getIntervaloDiasBR,
  getPartesDataHoraBR,
} from "@/lib/date-br";
import {
  inferirMomentoClinico,
  mapearMomentoClinicoParaLegado,
  normalizarMomentoClinico,
  parseContextoTags,
  serializeContextoTags,
  SLOT_META,
} from "@/lib/mapa-glicemico";

const checkinGlicemiaSchema = z.object({
  pacienteId: z.string().optional(),
  valor: z.coerce
    .number()
    .int("O valor da glicemia deve ser um número inteiro.")
    .min(20, "Valor mínimo permitido: 20 mg/dL.")
    .max(600, "Valor máximo permitido: 600 mg/dL."),
  momento: z.string().optional(),
  momentoClinico: z.string().optional().nullable(),
  contextoTags: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
  insulina: z
    .object({
      tipo: z.string().optional(),
      unidades: z.coerce.number().min(0).max(300),
      nome: z.string().max(80).nullable().optional(),
      observacao: z.string().max(200).nullable().optional(),
    })
    .nullable()
    .optional(),
  dataRegistro: z.string().optional(),
});

function formatarMomentoGlicemia(
  momento: string,
  momentoClinico?: string | null,
): string {
  const norm = normalizarMomentoClinico(momentoClinico);
  if (norm && norm !== "AVULSO") {
    return SLOT_META[norm].label;
  }
  switch (momento) {
    case "JEJUM":
      return "Em Jejum";
    case "POS_PRANDIAL":
      return "Pós-Refeição";
    case "CASUAL":
      return "Outro";
    default:
      return momento;
  }
}

async function resolverPacienteIdValido(rawId?: string): Promise<string> {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanId = rawId?.trim() || "";
  const patientRepo = await getRepository(PatientEntity);

  if (cleanId && uuidRegex.test(cleanId)) {
    const found = await patientRepo.findOne({
      where: { id: cleanId },
      select: { id: true },
    });
    if (found) return found.id;
  }

  if (cleanId) {
    const byCode = await patientRepo.findOne({
      where: [
        {
          recordCode: Raw((alias) => `LOWER(${alias}) = :code`, {
            code: cleanId.toLowerCase(),
          }),
        },
        { cpf: cleanId },
      ],
      select: { id: true },
    });
    if (byCode) return byCode.id;
  }

  const carlos = await patientRepo.findOne({
    where: [
      { recordCode: "FAAZ-00001" },
      {
        fullName: Raw((alias) => `LOWER(${alias}) LIKE :name`, {
          name: "%carlos eduardo fantini%",
        }),
      },
    ],
    select: { id: true },
  });
  if (carlos) return carlos.id;

  const anyPatient = await patientRepo.findOne({
    where: { deletedAt: IsNull() },
    select: { id: true },
  });
  if (!anyPatient) {
    throw new Error("Nenhum paciente cadastrado no banco de dados.");
  }
  return anyPatient.id;
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = checkinGlicemiaSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos para registro de glicemia.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const {
      pacienteId,
      valor,
      momento: rawMomento,
      momentoClinico: rawMomentoClinico,
      contextoTags,
      insulina,
      dataRegistro,
    } = parsed.data;
    const validPacienteId = await resolverPacienteIdValido(pacienteId);

    const parsedDate = dataRegistro ? new Date(dataRegistro) : new Date();
    const dataRegistroDate = Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;
    const partesBR = getPartesDataHoraBR(dataRegistroDate);

    // Resolve momentoClinico e momento legado com retrocompatibilidade
    const momentoClinicoResolvido = inferirMomentoClinico(
      rawMomentoClinico,
      rawMomento,
      partesBR.hour,
    );

    let momentoLegado: "JEJUM" | "POS_PRANDIAL" | "CASUAL" = "JEJUM";
    if (rawMomento && rawMomento.trim()) {
      const upper = rawMomento.trim().toUpperCase();
      if (
        upper === "POS_PRANDIAL" ||
        upper === "PÓS-REFEIÇÃO" ||
        upper === "POS-REFEICAO" ||
        upper === "POS_CAFE" ||
        upper === "POS_ALMOCO" ||
        upper === "POS_JANTAR"
      ) {
        momentoLegado = "POS_PRANDIAL";
      } else if (
        upper === "CASUAL" ||
        upper === "OUTRO" ||
        upper === "AO_DEITAR" ||
        upper === "AVULSO"
      ) {
        momentoLegado = "CASUAL";
      } else {
        momentoLegado = "JEJUM";
      }
    } else {
      momentoLegado = mapearMomentoClinicoParaLegado(momentoClinicoResolvido);
    }

    const contextoTagsStr = serializeContextoTags(
      Array.isArray(contextoTags)
        ? contextoTags
        : typeof contextoTags === "string"
          ? contextoTags.split(",")
          : null,
    );

    const glicemiaRepo = await getRepository(RegistroGlicemiaEntity);
    const salvo = await glicemiaRepo.save(
      glicemiaRepo.create({
        pacienteId: validPacienteId,
        valor,
        momento: momentoLegado,
        momentoClinico: momentoClinicoResolvido,
        contextoTags: contextoTagsStr,
        dataRegistro: dataRegistroDate,
      }),
    );

    // Se houver insulina com unidades > 0, vincula em REGISTROS_INSULINA
    let insulinaRegistrada: {
      id: string;
      tipo: "RAPIDA" | "BASAL";
      unidades: number;
      nomeInsulina: string | null;
    } | null = null;

    if (insulina && Number(insulina.unidades) > 0) {
      const tipoIns =
        String(insulina.tipo || "RAPIDA")
          .trim()
          .toUpperCase() === "BASAL"
          ? "BASAL"
          : "RAPIDA";
      const unidadesNum = Math.round(Number(insulina.unidades) * 100) / 100;
      const nomeIns = insulina.nome?.trim().slice(0, 80) || null;
      const obsIns = insulina.observacao?.trim().slice(0, 200) || null;

      const insSalva = await withRepositoryRetry(
        RegistroInsulinaEntity,
        (repo) =>
          repo.save(
            repo.create({
              pacienteId: validPacienteId,
              registroGlicemiaId: salvo.id,
              dataDia: getDataDiaBR(dataRegistroDate),
              aplicadoEm: dataRegistroDate,
              tipo: tipoIns,
              nomeInsulina: nomeIns,
              unidades: unidadesNum,
              momentoClinico: momentoClinicoResolvido,
              observacao: obsIns,
            }),
          ),
        { label: "checkins-glicemia:insulina-link" },
      );

      insulinaRegistrada = {
        id: insSalva.id,
        tipo: tipoIns,
        unidades: unidadesNum,
        nomeInsulina: nomeIns,
      };
    }

    const pacienteRow = await withRepositoryRetry(
      PatientEntity,
      (repo) =>
        repo.findOne({
          where: { id: validPacienteId },
          select: { id: true, fullName: true, socialName: true },
        }),
      { label: "checkins-glicemia:paciente-nome" },
    );

    const isCritico = valor < 70 || valor > 180;
    const pacienteNome =
      pacienteRow?.socialName || pacienteRow?.fullName || "Paciente";

    return NextResponse.json(
      {
        success: true,
        message: "Glicemia registrada com sucesso!",
        isCritico,
        tipoAlerta:
          valor < 70
            ? "HIPOGLICEMIA"
            : valor > 180
              ? "HIPERGLICEMIA"
              : "NORMAL",
        data: {
          id: salvo.id,
          pacienteId: salvo.pacienteId,
          pacienteNome,
          valor: salvo.valor,
          momento: salvo.momento,
          momentoClinico: salvo.momentoClinico,
          momentoLegivel: formatarMomentoGlicemia(
            salvo.momento,
            salvo.momentoClinico,
          ),
          contextoTags: parseContextoTags(salvo.contextoTags),
          insulina: insulinaRegistrada,
          dataRegistro: new Date(salvo.dataRegistro).toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_GLICEMIA_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro interno ao registrar glicemia.",
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
            "Secretárias não possuem autorização para acessar dados clínicos de glicemia.",
        },
        { status: 403 },
      );
    }
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");
    const limitParam = searchParams.get("limit");
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
    const incluirHistorico = searchParams.get("historico") === "true";
    const diasParam = searchParams.get("dias");
    const parsedDias = diasParam ? parseInt(diasParam, 10) : 30;
    const dias = Number.isFinite(parsedDias)
      ? Math.min(90, Math.max(1, parsedDias))
      : 30;

    const { inicioUtc: startOfDay, fimUtc: endOfDay } = getInicioFimDiaBR();

    let resolvedId: string | undefined;
    if (pacienteId && pacienteId.trim().length > 0) {
      resolvedId = await resolverPacienteIdValido(pacienteId);
    }

    const glicemiaRepo = await getRepository(RegistroGlicemiaEntity);
    const registrosHojeDb = await glicemiaRepo.find({
      where: {
        dataRegistro: Between(startOfDay, endOfDay),
        ...(resolvedId ? { pacienteId: resolvedId } : {}),
      },
      order: { dataRegistro: "DESC" },
      take: limit,
      relations: { paciente: true },
    });

    const formatarItem = (r: (typeof registrosHojeDb)[number]) => {
      const p = r.paciente;
      const nome = p?.socialName || p?.fullName || "Paciente";
      const isCritico = r.valor < 70 || r.valor > 180;
      const tipoAlerta =
        r.valor < 70
          ? "HIPOGLICEMIA"
          : r.valor > 180
            ? "HIPERGLICEMIA"
            : "NORMAL";

      const dt = new Date(r.dataRegistro);
      const horario = formatarHoraBR(dt);

      const birthIso = p?.birthDate
        ? String(p.birthDate).split("T")[0]
        : null;

      return {
        id: r.id,
        pacienteId: r.pacienteId,
        pacienteNome: nome,
        pacienteRecordCode: p?.recordCode || "",
        pacienteCpf: p?.cpf || "",
        pacienteTelefone: p?.phoneWhatsapp || "",
        pacienteDataNascimento: birthIso,
        pacienteSexo: p?.biologicalSex || "OTHER",
        pacienteConvenio: p?.convenio || "Particular",
        pacienteStatus: p?.patientStatus === "ACTIVE" ? "Ativo" : "Inativo",
        valor: r.valor,
        momento: r.momento,
        momentoClinico: r.momentoClinico ?? null,
        momentoLegivel: formatarMomentoGlicemia(r.momento, r.momentoClinico),
        contextoTags: parseContextoTags(r.contextoTags),
        horario,
        dataRegistro: dt.toISOString(),
        isCritico,
        tipoAlerta,
      };
    };

    const registrosHoje = registrosHojeDb.map(formatarItem);
    const alertasHoje = registrosHoje.filter((item) => item.isCritico);
    const pacientesCriticosUnicos = new Set(
      alertasHoje.map((a) => a.pacienteId),
    ).size;

    let historicoPayload: {
      dias: number;
      historico: Array<{
        id: string;
        valor: number;
        momento: string;
        momentoLegivel: string;
        dataRegistro: string;
        isCritico: boolean;
        tipoAlerta: "HIPOGLICEMIA" | "HIPERGLICEMIA" | "NORMAL";
      }>;
      resumo: {
        media: number | null;
        totalMedicoes: number;
        dentroDaMeta: number;
        alertas: number;
      };
    } | null = null;

    if (incluirHistorico) {
      const { inicioUtc: inicioPeriodo } = getIntervaloDiasBR(dias);

      const historicoLimit = limitParam ? Math.min(limit, 500) : 500;
      const historicoDb = await glicemiaRepo.find({
        where: {
          dataRegistro: MoreThanOrEqual(inicioPeriodo),
          ...(resolvedId ? { pacienteId: resolvedId } : {}),
        },
        order: { dataRegistro: "DESC" },
        take: historicoLimit,
      });

      const historico = historicoDb.map((r) => {
        const valor = Number(r.valor);
        const isCritico = valor < 70 || valor > 180;
        const tipoAlerta: "HIPOGLICEMIA" | "HIPERGLICEMIA" | "NORMAL" =
          valor < 70
            ? "HIPOGLICEMIA"
            : valor > 180
              ? "HIPERGLICEMIA"
              : "NORMAL";
        return {
          id: r.id,
          valor,
          momento: r.momento,
          momentoClinico: r.momentoClinico ?? null,
          momentoLegivel: formatarMomentoGlicemia(r.momento, r.momentoClinico),
          contextoTags: parseContextoTags(r.contextoTags),
          dataRegistro: new Date(r.dataRegistro).toISOString(),
          isCritico,
          tipoAlerta,
        };
      });

      const totalMedicoes = historico.length;
      const alertas = historico.filter((item) => item.isCritico).length;
      const dentroDaMeta = totalMedicoes - alertas;
      const media =
        totalMedicoes > 0
          ? Math.round(
              historico.reduce((acc, item) => acc + item.valor, 0) /
                totalMedicoes,
            )
          : null;

      historicoPayload = {
        dias,
        historico,
        resumo: {
          media,
          totalMedicoes,
          dentroDaMeta,
          alertas,
        },
      };
    }

    return NextResponse.json(
      {
        success: true,
        totalAlertasHoje: alertasHoje.length,
        pacientesCriticosHoje: pacientesCriticosUnicos,
        totalRegistrosHoje: registrosHoje.length,
        alertasHoje,
        registrosHoje,
        ...(historicoPayload ?? {}),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_GLICEMIA_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro ao buscar registros de glicemia.",
        details,
      },
      { status: 500 },
    );
  }
}
