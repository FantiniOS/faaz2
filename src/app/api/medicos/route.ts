import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_MEDICOS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    nome: "Dr. Carlos Fantini",
    especialidade: "Endocrinologia & Nutrologia",
    corHex: "#059669",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    nome: "Dr. Rodrigo Mendes",
    especialidade: "Cirurgia Plástica",
    corHex: "#2563eb",
  },
];

export async function GET() {
  try {
    let medicos = await prisma.medico.findMany({
      orderBy: { createdAt: "asc" },
    });

    // Auto-seed caso o banco esteja vazio para garantir zero atrito
    if (medicos.length === 0) {
      for (const m of DEFAULT_MEDICOS) {
        await prisma.medico.upsert({
          where: { id: m.id },
          update: {
            nome: m.nome,
            especialidade: m.especialidade,
            corHex: m.corHex,
          },
          create: m,
        });
      }
      medicos = await prisma.medico.findMany({
        orderBy: { createdAt: "asc" },
      });
    }

    return NextResponse.json(
      {
        success: true,
        medicos,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[GET /api/medicos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao listar médicos." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nome = body?.nome ? String(body.nome).trim() : "";
    const especialidade = body?.especialidade
      ? String(body.especialidade).trim()
      : "Endocrinologia & Nutrologia";
    const corHex = body?.corHex ? String(body.corHex).trim() : "#059669";

    if (!nome) {
      return NextResponse.json(
        { success: false, error: "Informe o nome do médico." },
        { status: 400 }
      );
    }

    const medico = await prisma.medico.create({
      data: {
        nome,
        especialidade,
        corHex,
      },
    });

    return NextResponse.json({ success: true, medico }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/medicos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao cadastrar médico." },
      { status: 500 }
    );
  }
}
