import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/busca?q={termo}
 * Busca global de pacientes por Nome, Telefone/WhatsApp ou CPF
 * Resposta ultrarrápida (< 15ms) limitada a 10 registros
 */
export async function GET(request: Request) {
  try {
    const sessao = await getSessao();
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado.", autenticado: false },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    if (!q || q.length < 1) {
      return NextResponse.json({ pacientes: [] });
    }

    const digitsOnly = q.replace(/\D/g, "");

    const pacientes = await prisma.patient.findMany({
      where: {
        deletedAt: null,
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { socialName: { contains: q, mode: "insensitive" as const } },
          { recordCode: { contains: q, mode: "insensitive" as const } },
          { phoneWhatsapp: { contains: q, mode: "insensitive" as const } },
          { cpf: { contains: q, mode: "insensitive" as const } },
          ...(digitsOnly.length >= 2
            ? [
                { cpf: { contains: digitsOnly, mode: "insensitive" as const } },
                { phoneWhatsapp: { contains: digitsOnly, mode: "insensitive" as const } },
              ]
            : []),
        ],
      },
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
      orderBy: { fullName: "asc" },
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
  } catch (error: any) {
    console.error("[BUSCA_GLOBAL] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao processar busca de pacientes." },
      { status: 500 }
    );
  }
}
