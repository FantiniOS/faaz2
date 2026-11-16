import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pacienteId, tipoBristol, categoria, sintomas } = body;

    if (!tipoBristol || typeof tipoBristol !== "number" || tipoBristol < 1 || tipoBristol > 7) {
      return NextResponse.json(
        { error: "tipoBristol deve ser um número entre 1 e 7." },
        { status: 400 }
      );
    }

    // Determina a categoria clínica se não foi informada
    let resolvedCategoria = categoria;
    if (!resolvedCategoria) {
      if (tipoBristol <= 2) {
        resolvedCategoria = "constipacao";
      } else if (tipoBristol <= 4) {
        resolvedCategoria = "ideal";
      } else {
        resolvedCategoria = "diarreia";
      }
    }

    // Normaliza sintomas para array de strings
    const resolvedSintomas: string[] = Array.isArray(sintomas)
      ? sintomas.filter((s) => typeof s === "string" && s.trim().length > 0)
      : typeof sintomas === "string" && sintomas.trim().length > 0
      ? [sintomas.trim()]
      : [];

    const checkin = await prisma.checkinIntestinal.create({
      data: {
        pacienteId: pacienteId || "carlos-paciente-faaz",
        tipoBristol,
        categoria: resolvedCategoria,
        sintomas: resolvedSintomas,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Check-in intestinal registrado com sucesso!",
        data: checkin,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[API_CHECKIN_INTESTINAL_POST_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro interno ao registrar check-in intestinal.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Limites de 24 horas (Reset diário às 00:00)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const whereClause: any = {
      data: { gte: startOfDay, lte: endOfDay },
    };
    if (pacienteId) {
      whereClause.pacienteId = pacienteId;
    }

    const registros = await prisma.checkinIntestinal.findMany({
      where: whereClause,
      orderBy: { data: "desc" },
      take: Math.min(limit, 50),
    });

    return NextResponse.json({
      success: true,
      dataReferencia: now.toISOString().split("T")[0],
      count: registros.length,
      data: registros,
    });
  } catch (error: any) {
    console.error("[API_CHECKIN_INTESTINAL_GET_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro ao buscar registros de check-in intestinal.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
