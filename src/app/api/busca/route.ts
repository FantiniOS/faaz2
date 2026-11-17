import { NextResponse } from "next/server";
import { IsNull, Raw } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { PatientEntity } from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/busca?q={termo}
 * Busca global de pacientes por Nome, Telefone/WhatsApp ou CPF
 * Resposta limitada a 10 registros
 */
export async function GET(request: Request) {
  try {
    const sessao = await getSessao();
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado.", autenticado: false },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q || q.length < 1) {
      return NextResponse.json({ pacientes: [] });
    }

    const pattern = `%${q.toLowerCase()}%`;
    const digitsOnly = q.replace(/\D/g, "");
    const digitsPattern = `%${digitsOnly}%`;

    const patientRepo = await getRepository(PatientEntity);

    const containsCaseInsensitive = (paramName: string, paramValue: string) =>
      Raw((alias) => `LOWER(${alias}) LIKE :${paramName}`, {
        [paramName]: paramValue,
      });

    const pacientes = await patientRepo.find({
      where: [
        { deletedAt: IsNull(), fullName: containsCaseInsensitive("q1", pattern) },
        { deletedAt: IsNull(), socialName: containsCaseInsensitive("q2", pattern) },
        { deletedAt: IsNull(), recordCode: containsCaseInsensitive("q3", pattern) },
        { deletedAt: IsNull(), phoneWhatsapp: containsCaseInsensitive("q4", pattern) },
        { deletedAt: IsNull(), cpf: containsCaseInsensitive("q5", pattern) },
        ...(digitsOnly.length >= 2
          ? [
              { deletedAt: IsNull(), cpf: containsCaseInsensitive("qd1", digitsPattern) },
              {
                deletedAt: IsNull(),
                phoneWhatsapp: containsCaseInsensitive("qd2", digitsPattern),
              },
            ]
          : []),
      ],
      select: {
        id: true,
        recordCode: true,
        fullName: true,
        socialName: true,
        cpf: true,
        phoneWhatsapp: true,
        planoFaaz: true,
        convenio: true,
        city: true,
        neighborhood: true,
        patientStatus: true,
      },
      take: 10,
      order: { fullName: "ASC" },
    });

    const formatados = pacientes.map((p) => ({
      id: p.id,
      recordCode: p.recordCode,
      nome: p.fullName,
      nomeSocial: p.socialName || null,
      cpf: p.cpf || "",
      telefone: p.phoneWhatsapp || "",
      planoFaaz: Boolean(p.planoFaaz),
      convenio: p.convenio || "Particular",
      cidade: p.city ? `${p.city}${p.neighborhood ? ` - ${p.neighborhood}` : ""}` : "",
      status: p.patientStatus || "Ativo",
    }));

    return NextResponse.json({
      pacientes: formatados,
      total: formatados.length,
    });
  } catch (error: unknown) {
    console.error("[BUSCA_GLOBAL] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao processar busca de pacientes." },
      { status: 500 },
    );
  }
}
