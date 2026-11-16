import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sessao = await getSessao();

    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado.", autenticado: false },
        { status: 401 }
      );
    }

    let profileDetails: {
      title: string | null;
      fullName: string;
      councilType: string | null;
      councilNumber: string | null;
      specialty: string | null;
      organization: { tradeName: string } | null;
    } | null = null;

    try {
      profileDetails = await prisma.user.findUnique({
        where: { id: sessao.userId },
        select: {
          title: true,
          fullName: true,
          councilType: true,
          councilNumber: true,
          specialty: true,
          organization: {
            select: {
              tradeName: true,
            },
          },
        },
      });
    } catch {
      // Preserva resposta básica da sessão mesmo se a consulta complementar falhar
    }

    return NextResponse.json({
      autenticado: true,
      usuario: {
        ...sessao,
        title: profileDetails?.title ?? null,
        fullName: profileDetails?.fullName ?? sessao.nome,
        councilType: profileDetails?.councilType ?? null,
        councilNumber: profileDetails?.councilNumber ?? null,
        specialty: profileDetails?.specialty ?? null,
        clinicaNome: profileDetails?.organization?.tradeName ?? "Clínica FAAZ",
      },
    });
  } catch (error: unknown) {
    console.error("[AUTH/ME] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao verificar sessão." },
      { status: 500 }
    );
  }
}
