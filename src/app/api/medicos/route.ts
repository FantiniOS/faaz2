import { NextRequest, NextResponse } from "next/server";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import { MedicoEntity } from "@/lib/db/entities";

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
    let medicos = await withRepositoryRetry(
      MedicoEntity,
      (repo) =>
        repo.find({
          order: { createdAt: "ASC" },
        }),
      { label: "medicos:list" },
    );

    // Auto-seed caso o banco esteja vazio para garantir zero atrito
    if (medicos.length === 0) {
      const medicoRepo = await getRepository(MedicoEntity);
      for (const m of DEFAULT_MEDICOS) {
        const existing = await medicoRepo.findOne({ where: { id: m.id } });
        if (existing) {
          existing.nome = m.nome;
          existing.especialidade = m.especialidade;
          existing.corHex = m.corHex;
          await medicoRepo.save(existing);
        } else {
          await medicoRepo.save(medicoRepo.create(m));
        }
      }
      medicos = await medicoRepo.find({
        order: { createdAt: "ASC" },
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
      },
    );
  } catch (error) {
    console.error("[GET /api/medicos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao listar médicos." },
      { status: 500 },
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
        { status: 400 },
      );
    }

    const medicoRepo = await getRepository(MedicoEntity);
    const medico = await medicoRepo.save(
      medicoRepo.create({
        nome,
        especialidade,
        corHex,
      }),
    );

    return NextResponse.json({ success: true, medico }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/medicos] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao cadastrar médico." },
      { status: 500 },
    );
  }
}
