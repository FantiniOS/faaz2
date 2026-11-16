import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pacienteId = searchParams.get("pacienteId") || "carlos-faaz-001";

  // Rota estritamente protegida pelo Middleware RBAC (apenas MEDICO_TITULAR e MEDICO_PARCEIRO)
  return NextResponse.json({
    success: true,
    autorizado: true,
    sigiloClinico: "ESTRITO",
    mensagem: "Acesso autorizado ao prontuário médico confidencial.",
    pacienteId,
    prontuario: {
      diagnostico: "Acompanhamento Metabólico e Nutrológico Longitudinal",
      prescricao: "Protocolo de Hidratação 2.5L/dia + Suplementação Probiótica",
      historicoSOAP: [
        {
          data: "2026-11-02",
          subjetivo: "Paciente relata melhora na disposição após início do plano hídrico.",
          objetivo: "Peso: 82.1kg, IMC: 24.8, PA: 120/80 mmHg.",
          avaliacao: "Evolução clínica favorável.",
          plano: "Manter metas atuais no aplicativo móvel.",
        },
      ],
    },
  });
}
