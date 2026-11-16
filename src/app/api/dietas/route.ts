import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pacienteId = searchParams.get("pacienteId") || "carlos-faaz-001";

  // Rota estritamente protegida pelo Middleware RBAC (apenas MEDICO_TITULAR e MEDICO_PARCEIRO)
  return NextResponse.json({
    success: true,
    autorizado: true,
    sigiloClinico: "ESTRITO",
    mensagem: "Acesso autorizado ao plano alimentar e prescrições dietéticas.",
    pacienteId,
    dieta: {
      titulo: "Dieta Anti-inflamatória & Otimização Metabólica",
      caloriasAlvo: 1800,
      macros: {
        proteinas: "120g (27%)",
        carboidratos: "160g (36%)",
        gorduras: "75g (37%)",
      },
      refeicoes: [
        { horario: "08:00", nome: "Café da Manhã", itens: "Ovos mexidos, abacate, chá verde" },
        { horario: "12:30", nome: "Almoço", itens: "Filé de salmão, folhas verdes, azeite extravirgem" },
      ],
    },
  });
}
