export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";

// Schema de validação Zod para registro de consumo de água
const checkinHidratacaoSchema = z.object({
  pacienteId: z.string().min(1, "O identificador do paciente é obrigatório."),
  volumeMl: z
    .number()
    .int("O volume deve ser um número inteiro.")
    .positive("O volume ingerido deve ser maior que zero."),
  metaDiariaMl: z
    .number()
    .int()
    .positive()
    .optional()
    .default(2500),
  data: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();

    // 1. Validação estrita com Zod
    const validationResult = checkinHidratacaoSchema.safeParse(json);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Dados de hidratação inválidos.",
          issues: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { pacienteId, volumeMl, metaDiariaMl, data } = validationResult.data;

    // 2. Persistência no banco via Prisma
    const checkin = await prisma.checkinHidratacao.create({
      data: {
        pacienteId,
        volumeMl,
        metaDiariaMl,
        ...(data ? { data: new Date(data) } : {}),
      },
    });

    // 3. Limites estritos do dia civil atual (Reset diário automático às 00:00)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Registros individuais do paciente hoje
    const pacienteHojeRegistros = await prisma.checkinHidratacao.findMany({
      where: {
        pacienteId,
        data: { gte: startOfDay, lte: endOfDay },
      },
    });

    const pacienteTotalHojeMl = pacienteHojeRegistros.reduce(
      (acc, r) => acc + r.volumeMl,
      0
    );
    const pacientePercentual = Math.min(
      100,
      Math.round((pacienteTotalHojeMl / metaDiariaMl) * 100)
    );

    // Registros globais de todos os pacientes hoje
    const todosHojeRegistros = await prisma.checkinHidratacao.findMany({
      where: {
        data: { gte: startOfDay, lte: endOfDay },
      },
    });

    const totalConsumidoHojeMl = todosHojeRegistros.reduce(
      (acc, r) => acc + r.volumeMl,
      0
    );
    const pacientesAtivosProtocolo = 12; // Base de pacientes ativos no protocolo hídrico
    const metaTotalHojeMl = pacientesAtivosProtocolo * 2500; // 30.000ml = 30L
    const percentualAderencia = Math.min(
      100,
      Math.round((totalConsumidoHojeMl / metaTotalHojeMl) * 100)
    );

    return NextResponse.json(
      {
        success: true,
        message: `+${volumeMl}ml de água registrados com sucesso!`,
        data: checkin,
        // Dados do paciente
        totalHojeMl: pacienteTotalHojeMl,
        metaDiariaMl,
        percentual: pacientePercentual,
        // Consolidado Global da Clínica
        totalConsumidoHojeMl,
        totalConsumidoHojeL: parseFloat((totalConsumidoHojeMl / 1000).toFixed(1)),
        metaTotalHojeMl,
        metaTotalHojeL: parseFloat((metaTotalHojeMl / 1000).toFixed(1)),
        percentualAderencia,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[API_CHECKINS_HIDRATACAO_POST_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro interno no servidor ao registrar hidratação.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sessao = await getSessao();
    if (
      sessao &&
      (sessao.cargo === "SECRETARIA" ||
        (sessao as any).role === "SECRETARIA" ||
        (sessao as any).role === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso Negado (LGPD/RBAC)",
          motivo:
            "Secretárias não possuem autorização para acessar dados de hidratação metabólica de pacientes.",
        },
        { status: 403 }
      );
    }
    const { searchParams } = new URL(req.url);
    const pacienteIdParam = searchParams.get("pacienteId");

    // Limites estritos do dia civil atual (Reset diário automático às 00:00)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 1. Busca todos os registros de TODOS os pacientes ocorridos no dia atual
    const todosRegistrosHoje = await prisma.checkinHidratacao.findMany({
      where: {
        data: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { data: "desc" },
    });

    // 2. Cálculo do somatório global consumido hoje
    const totalConsumidoHojeMl = todosRegistrosHoje.reduce(
      (sum, r) => sum + r.volumeMl,
      0
    );
    const totalConsumidoHojeL = parseFloat((totalConsumidoHojeMl / 1000).toFixed(1));

    // 3. Meta somada de todos os pacientes ativos no protocolo (12 pacientes x 2.5L = 30L)
    const pacientesAtivosProtocolo = 12;
    const metaTotalHojeMl = pacientesAtivosProtocolo * 2500; // 30.000ml = 30L
    const metaTotalHojeL = parseFloat((metaTotalHojeMl / 1000).toFixed(1));

    // 4. Percentual de adesão coletiva da clínica
    const percentualAderencia = Math.min(
      100,
      Math.round((totalConsumidoHojeMl / metaTotalHojeMl) * 100)
    );

    // Quantidade de pacientes distintos que registraram água hoje
    const pacientesQueRegistraramHoje = new Set(
      todosRegistrosHoje.map((r) => r.pacienteId)
    ).size;

    // 5. Dados individuais se um pacienteId específico foi informado
    let pacienteData: any = null;
    if (pacienteIdParam) {
      const pacienteRegistros = todosRegistrosHoje.filter(
        (r) => r.pacienteId === pacienteIdParam
      );
      const pacienteTotalMl = pacienteRegistros.reduce(
        (sum, r) => sum + r.volumeMl,
        0
      );
      const pacienteMetaMl =
        pacienteRegistros.length > 0 ? pacienteRegistros[0].metaDiariaMl : 2500;
      const pacientePerc = Math.min(
        100,
        Math.round((pacienteTotalMl / pacienteMetaMl) * 100)
      );

      pacienteData = {
        pacienteId: pacienteIdParam,
        totalHojeMl: pacienteTotalMl,
        metaDiariaMl: pacienteMetaMl,
        percentual: pacientePerc,
        countHoje: pacienteRegistros.length,
      };
    }

    return NextResponse.json({
      success: true,
      dataReferencia: now.toISOString().split("T")[0],
      // Consolidado Global da Clínica
      totalConsumidoHojeMl,
      totalConsumidoHojeL,
      metaTotalHojeMl,
      metaTotalHojeL,
      percentualAderencia,
      pacientesAtivosProtocolo,
      pacientesQueRegistraramHoje,
      totalRegistrosHoje: todosRegistrosHoje.length,
      // Dados individuais (se solicitado)
      paciente: pacienteData,
      // Retrocompatibilidade para chamadas diretas
      totalHojeMl: pacienteData ? pacienteData.totalHojeMl : totalConsumidoHojeMl,
      metaDiariaMl: pacienteData ? pacienteData.metaDiariaMl : metaTotalHojeMl,
      percentual: pacienteData ? pacienteData.percentual : percentualAderencia,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: any) {
    console.error("[API_CHECKINS_HIDRATACAO_GET_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro ao consultar dados de aderência hídrica.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
