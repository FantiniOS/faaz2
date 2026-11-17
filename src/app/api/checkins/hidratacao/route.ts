export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Between } from "typeorm";
import { z } from "zod";
import { getRepository } from "@/lib/db/data-source";
import { CheckinHidratacaoEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";

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

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const pacienteHojeRegistros = await repo.find({
      where: {
        pacienteId,
        data: Between(startOfDay, endOfDay),
      },
    });

    const pacienteTotalHojeMl = pacienteHojeRegistros.reduce(
      (acc, r) => acc + r.volumeMl,
      0,
    );
    const pacientePercentual = Math.min(
      100,
      Math.round((pacienteTotalHojeMl / metaDiariaMl) * 100),
    );

    const todosHojeRegistros = await repo.find({
      where: {
        data: Between(startOfDay, endOfDay),
      },
    });

    const totalConsumidoHojeMl = todosHojeRegistros.reduce(
      (acc, r) => acc + r.volumeMl,
      0,
    );
    const pacientesAtivosProtocolo = 12;
    const metaTotalHojeMl = pacientesAtivosProtocolo * 2500;
    const percentualAderencia = Math.min(
      100,
      Math.round((totalConsumidoHojeMl / metaTotalHojeMl) * 100),
    );

    return NextResponse.json(
      {
        success: true,
        message: `+${volumeMl}ml de água registrados com sucesso!`,
        data: checkin,
        totalHojeMl: pacienteTotalHojeMl,
        metaDiariaMl,
        percentual: pacientePercentual,
        totalConsumidoHojeMl,
        totalConsumidoHojeL: parseFloat(
          (totalConsumidoHojeMl / 1000).toFixed(1),
        ),
        metaTotalHojeMl,
        metaTotalHojeL: parseFloat((metaTotalHojeMl / 1000).toFixed(1)),
        percentualAderencia,
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

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const repo = await getRepository(CheckinHidratacaoEntity);
    const todosRegistrosHoje = await repo.find({
      where: {
        data: Between(startOfDay, endOfDay),
      },
      order: { data: "DESC" },
    });

    const totalConsumidoHojeMl = todosRegistrosHoje.reduce(
      (sum, r) => sum + r.volumeMl,
      0,
    );
    const totalConsumidoHojeL = parseFloat(
      (totalConsumidoHojeMl / 1000).toFixed(1),
    );

    const pacientesAtivosProtocolo = 12;
    const metaTotalHojeMl = pacientesAtivosProtocolo * 2500;
    const metaTotalHojeL = parseFloat((metaTotalHojeMl / 1000).toFixed(1));

    const percentualAderencia = Math.min(
      100,
      Math.round((totalConsumidoHojeMl / metaTotalHojeMl) * 100),
    );

    const pacientesQueRegistraramHoje = new Set(
      todosRegistrosHoje.map((r) => r.pacienteId),
    ).size;

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
        pacienteRegistros.length > 0 ? pacienteRegistros[0].metaDiariaMl : 2500;
      const pacientePerc = Math.min(
        100,
        Math.round((pacienteTotalMl / pacienteMetaMl) * 100),
      );

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
        dataReferencia: now.toISOString().split("T")[0],
        totalConsumidoHojeMl,
        totalConsumidoHojeL,
        metaTotalHojeMl,
        metaTotalHojeL,
        percentualAderencia,
        pacientesAtivosProtocolo,
        pacientesQueRegistraramHoje,
        totalRegistrosHoje: todosRegistrosHoje.length,
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
