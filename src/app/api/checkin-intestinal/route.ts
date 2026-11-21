import { NextRequest, NextResponse } from "next/server";
import { Between } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { CheckinIntestinalEntity } from "@/lib/db/entities";
import { getIntervaloDiaBR, toIsoUtc } from "@/lib/date-br";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pacienteId, tipoBristol, categoria, sintomas } = body;

    if (
      !tipoBristol ||
      typeof tipoBristol !== "number" ||
      tipoBristol < 1 ||
      tipoBristol > 7
    ) {
      return NextResponse.json(
        { error: "tipoBristol deve ser um número entre 1 e 7." },
        { status: 400 },
      );
    }

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

    const resolvedSintomas: string[] = Array.isArray(sintomas)
      ? sintomas.filter((s) => typeof s === "string" && s.trim().length > 0)
      : typeof sintomas === "string" && sintomas.trim().length > 0
        ? [sintomas.trim()]
        : [];

    const repo = await getRepository(CheckinIntestinalEntity);
    const checkin = await repo.save(
      repo.create({
        pacienteId: pacienteId || "carlos-paciente-faaz",
        tipoBristol,
        categoria: resolvedCategoria,
        sintomas: resolvedSintomas,
      }),
    );

    return NextResponse.json(
      {
        success: true,
        message: "Check-in intestinal registrado com sucesso!",
        data: checkin,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[API_CHECKIN_INTESTINAL_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro interno ao registrar check-in intestinal.",
        details,
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const {
      dataDia: dataReferencia,
      inicioUtc: startOfDay,
      fimUtc: endOfDay,
    } = getIntervaloDiaBR();

    const repo = await getRepository(CheckinIntestinalEntity);
    const registros = await repo.find({
      where: {
        data: Between(startOfDay, endOfDay),
        ...(pacienteId ? { pacienteId } : {}),
      },
      order: { data: "DESC" },
      take: Math.min(limit, 50),
    });

    return NextResponse.json({
      success: true,
      dataReferencia,
      count: registros.length,
      data: registros.map((r) => ({
        ...r,
        data: toIsoUtc(r.data) ?? new Date(r.data).toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error("[API_CHECKIN_INTESTINAL_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Erro ao buscar registros de check-in intestinal.",
        details,
      },
      { status: 500 },
    );
  }
}
