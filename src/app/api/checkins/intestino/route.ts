export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Between, In } from "typeorm";
import { z } from "zod";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckinIntestinalEntity,
  PatientEntity,
  type CheckinIntestinal,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { getDataDiaBR, getInicioFimDiaBR, toIsoUtc } from "@/lib/date-br";

const checkinIntestinalSchema = z.object({
  pacienteId: z.string().optional().default("paciente-teste-faaz"),
  tipoBristol: z.coerce
    .number()
    .int("O tipo de Bristol deve ser um número inteiro.")
    .min(1, "O valor mínimo na Escala de Bristol é 1.")
    .max(7, "O valor máximo na Escala de Bristol é 7."),
  categoria: z.enum(["constipacao", "ideal", "diarreia"]).optional(),
  sintomas: z
    .union([
      z.array(z.string()),
      z.string().transform((val) => (val && val !== "Nenhum" ? [val] : [])),
    ])
    .optional()
    .default([]),
  data: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();

    const validationResult = checkinIntestinalSchema.safeParse(json);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Falha de validação dos dados de check-in.",
          issues: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { pacienteId, tipoBristol, sintomas, data } = validationResult.data;
    let categoria = validationResult.data.categoria;

    if (!categoria) {
      if (tipoBristol <= 2) {
        categoria = "constipacao";
      } else if (tipoBristol <= 4) {
        categoria = "ideal";
      } else {
        categoria = "diarreia";
      }
    }

    const finalPacienteId =
      pacienteId && pacienteId.trim().length > 0
        ? pacienteId.trim()
        : "paciente-teste-faaz";

    const repo = await getRepository(CheckinIntestinalEntity);
    const checkin = await repo.save(
      repo.create({
        pacienteId: finalPacienteId,
        tipoBristol,
        categoria,
        sintomas,
        data: data ? new Date(data) : new Date(),
      }),
    );

    return NextResponse.json(
      {
        success: true,
        message: "Check-in intestinal salvo com sucesso!",
        data: checkin,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKINS_INTESTINO_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro interno no servidor ao processar o check-in.",
        details,
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const reqStart = performance.now();
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
            "Secretárias não possuem autorização para acessar dados clínicos de saúde intestinal.",
        },
        { status: 403 },
      );
    }
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");
    const incluirHistorico = searchParams.get("historico") === "true";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    const {
      dataDia: dataReferenciaHoje,
      inicioUtc: startOfDay,
      fimUtc: endOfDay,
    } = getInicioFimDiaBR();

    const cleanId = pacienteId?.trim() || "";
    const targetIds = cleanId
      ? cleanId === "carlos-faaz-001"
        ? ["carlos-faaz-001", "92dab67a-1977-4690-ae23-7cc60499a0c5"]
        : [cleanId]
      : undefined;

    const dbStart = performance.now();
    const bristolRepo = await getRepository(CheckinIntestinalEntity);
    const [registrosHoje, historicoGeral] = await Promise.all([
      bristolRepo.find({
        where: {
          data: Between(startOfDay, endOfDay),
          ...(targetIds ? { pacienteId: In(targetIds) } : {}),
        },
        order: { data: "DESC" },
      }),
      incluirHistorico
        ? bristolRepo.find({
            where: targetIds ? { pacienteId: In(targetIds) } : {},
            order: { data: "DESC" },
            take: Math.min(limit, 50),
          })
        : Promise.resolve([] as CheckinIntestinal[]),
    ]);

    const uniqueIds = Array.from(
      new Set(registrosHoje.map((r) => r.pacienteId)),
    );
    const patientMap = new Map<string, string>();

    if (uniqueIds.length > 0) {
      try {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validUuids = uniqueIds.filter((id) => uuidRegex.test(id));
        const nonUuids = uniqueIds.filter((id) => !uuidRegex.test(id));

        const patientRepo = await getRepository(PatientEntity);
        const whereConds = [
          ...(validUuids.length > 0 ? [{ id: In(validUuids) }] : []),
          ...(nonUuids.length > 0 ? [{ recordCode: In(nonUuids) }] : []),
        ];
        if (whereConds.length > 0) {
          const patients = await patientRepo.find({
            where: whereConds,
            select: {
              id: true,
              recordCode: true,
              fullName: true,
              socialName: true,
            },
          });

          patients.forEach((p) => {
            const nome = p.socialName || p.fullName;
            patientMap.set(p.id, nome);
            if (p.recordCode) patientMap.set(p.recordCode, nome);
          });
        }
      } catch (err) {
        console.error(
          "[API_CHECKINS_INTESTINO_GET] Erro ao buscar nomes de pacientes:",
          err,
        );
      }
    }

    const registrosFormatados = registrosHoje.map((r) => {
      let nome = patientMap.get(r.pacienteId);
      if (!nome) {
        if (
          r.pacienteId === "carlos-faaz-001" ||
          r.pacienteId.toLowerCase().includes("carlos")
        ) {
          nome = "Carlos Eduardo Fantini";
        } else {
          nome = "Paciente Mobile";
        }
      }
      return {
        ...r,
        data: toIsoUtc(r.data) ?? new Date(r.data).toISOString(),
        pacienteNome: nome,
      };
    });

    const dbDurMs = Math.round(performance.now() - dbStart);

    const totalHoje = registrosFormatados.length;
    const temRegistroHoje = totalHoje > 0;
    const ultimoRegistroHoje = temRegistroHoje ? registrosFormatados[0] : null;

    const countIdealHoje = registrosFormatados.filter(
      (r) => r.categoria === "ideal",
    ).length;
    const countConstipacaoHoje = registrosFormatados.filter(
      (r) => r.categoria === "constipacao",
    ).length;
    const countDiarreiaHoje = registrosFormatados.filter(
      (r) => r.categoria === "diarreia",
    ).length;

    const historicoFormatado = historicoGeral.map((h) => ({
      ...h,
      data: toIsoUtc(h.data) ?? new Date(h.data).toISOString(),
    }));

    return NextResponse.json(
      {
        success: true,
        dataReferencia: dataReferenciaHoje || getDataDiaBR(),
        temRegistroHoje,
        count: totalHoje,
        countHoje: totalHoje,
        ultimoRegistroHoje,
        countIdealHoje,
        countConstipacaoHoje,
        countDiarreiaHoje,
        data: registrosFormatados,
        registrosHoje: registrosFormatados,
        historico: historicoFormatado,
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
    console.error("[API_CHECKINS_INTESTINO_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro ao buscar histórico de check-ins intestinais.",
        details,
      },
      { status: 500 },
    );
  }
}
