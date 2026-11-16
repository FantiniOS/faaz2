export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";

// Schema Zod com coerção e fallbacks seguros para check-ins mobile
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

    // 1. Validação estrita via Zod com suporte a campos flexíveis
    const validationResult = checkinIntestinalSchema.safeParse(json);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Falha de validação dos dados de check-in.",
          issues: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { pacienteId, tipoBristol, sintomas, data } = validationResult.data;
    let categoria = validationResult.data.categoria;

    // 2. Classificação clínica de segurança se não enviada
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

    // 3. Persistência no banco via Prisma (sem bloqueio de Foreign Key)
    const checkin = await prisma.checkinIntestinal.create({
      data: {
        pacienteId: finalPacienteId,
        tipoBristol,
        categoria,
        sintomas,
        data: data ? new Date(data) : new Date(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Check-in intestinal salvo com sucesso!",
        data: checkin,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[API_CHECKINS_INTESTINO_POST_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro interno no servidor ao processar o check-in.",
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
            "Secretárias não possuem autorização para acessar dados clínicos de saúde intestinal.",
        },
        { status: 403 }
      );
    }
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");
    const incluirHistorico = searchParams.get("historico") === "true";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    // 1. Limites estritos de 24 horas usando o início do dia local às 00:00:00.000
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 2. Filtro de registros de hoje (se pacienteId vier na query, filtra por ele; senão traz todos da clínica)
    const whereHoje: any = {
      data: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };
    if (pacienteId && pacienteId.trim().length > 0) {
      const cleanId = pacienteId.trim();
      if (cleanId === "carlos-faaz-001") {
        whereHoje.OR = [
          { pacienteId: "carlos-faaz-001" },
          { pacienteId: "92dab67a-1977-4690-ae23-7cc60499a0c5" },
        ];
      } else {
        whereHoje.pacienteId = cleanId;
      }
    }

    const registrosHoje = await prisma.checkinIntestinal.findMany({
      where: whereHoje,
      orderBy: { data: "desc" },
    });

    // 3. Resolução de nomes reais dos pacientes para exibição no Dashboard
    const uniqueIds = Array.from(new Set(registrosHoje.map((r) => r.pacienteId)));
    const patientMap = new Map<string, string>();

    if (uniqueIds.length > 0) {
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validUuids = uniqueIds.filter((id) => uuidRegex.test(id));
        const nonUuids = uniqueIds.filter((id) => !uuidRegex.test(id));

        const patients = await prisma.patient.findMany({
          where: {
            OR: [
              ...(validUuids.length > 0 ? [{ id: { in: validUuids } }] : []),
              ...(nonUuids.length > 0 ? [{ recordCode: { in: nonUuids } }] : []),
            ],
          },
          select: { id: true, recordCode: true, fullName: true, socialName: true },
        });

        patients.forEach((p) => {
          const nome = p.socialName || p.fullName;
          patientMap.set(p.id, nome);
          if (p.recordCode) patientMap.set(p.recordCode, nome);
        });
      } catch (err) {
        console.error("[API_CHECKINS_INTESTINO_GET] Erro ao buscar nomes de pacientes:", err);
      }
    }

    const registrosFormatados = registrosHoje.map((r) => {
      let nome = patientMap.get(r.pacienteId);
      if (!nome) {
        if (r.pacienteId === "carlos-faaz-001" || r.pacienteId.toLowerCase().includes("carlos")) {
          nome = "Carlos Eduardo Fantini";
        } else {
          nome = "Paciente Mobile";
        }
      }
      return {
        ...r,
        pacienteNome: nome,
      };
    });

    // 4. Busca de histórico amplo de dias anteriores caso explicitamente solicitado
    let historicoGeral: any[] = [];
    if (incluirHistorico) {
      const whereHist: any = {};
      if (pacienteId && pacienteId.trim().length > 0) {
        const cleanId = pacienteId.trim();
        if (cleanId === "carlos-faaz-001") {
          whereHist.OR = [
            { pacienteId: "carlos-faaz-001" },
            { pacienteId: "92dab67a-1977-4690-ae23-7cc60499a0c5" },
          ];
        } else {
          whereHist.pacienteId = cleanId;
        }
      }
      historicoGeral = await prisma.checkinIntestinal.findMany({
        where: whereHist,
        orderBy: { data: "desc" },
        take: Math.min(limit, 50),
      });
    }

    // 5. Métricas analíticas do dia corrente
    const totalHoje = registrosFormatados.length;
    const temRegistroHoje = totalHoje > 0;
    const ultimoRegistroHoje = temRegistroHoje ? registrosFormatados[0] : null;

    const countIdealHoje = registrosFormatados.filter((r) => r.categoria === "ideal").length;
    const countConstipacaoHoje = registrosFormatados.filter((r) => r.categoria === "constipacao").length;
    const countDiarreiaHoje = registrosFormatados.filter((r) => r.categoria === "diarreia").length;

    return NextResponse.json({
      success: true,
      dataReferencia: new Date().toISOString().split("T")[0],
      temRegistroHoje,
      count: totalHoje,
      countHoje: totalHoje,
      ultimoRegistroHoje,
      countIdealHoje,
      countConstipacaoHoje,
      countDiarreiaHoje,
      // Array estrito do dia atual com nomes formatados
      data: registrosFormatados,
      registrosHoje: registrosFormatados,
      historico: historicoGeral,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error: any) {
    console.error("[API_CHECKINS_INTESTINO_GET_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro ao buscar histórico de check-ins intestinais.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
