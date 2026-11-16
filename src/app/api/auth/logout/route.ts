import { NextResponse } from "next/server";
import { destruirSessao } from "@/lib/auth-session";

export async function POST() {
  try {
    await destruirSessao();
    return NextResponse.json({ sucesso: true, mensagem: "Sessão encerrada com sucesso." });
  } catch (error: any) {
    console.error("[AUTH/LOGOUT] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao encerrar sessão." },
      { status: 500 }
    );
  }
}
