export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";

const bristolLabels: Record<number, string> = {
  1: "Tipo 1 - Constipação Severa (Esferas duras)",
  2: "Tipo 2 - Constipação Leve (Formato de salsicha grumosa)",
  3: "Tipo 3 - Fisiológico Regular (Com fendas na superfície)",
  4: "Tipo 4 - Normofisiológico Ideal ⭐ (Lisa e macia)",
  5: "Tipo 5 - Digestão Rápida (Pedaços macios definidos)",
  6: "Tipo 6 - Diarreia Leve (Pastosa e desfeita)",
  7: "Tipo 7 - Diarreia Líquida (Totalmente líquida)",
};

export async function GET(req: NextRequest) {
  try {
    const sessao = await getSessao();
    if (
      sessao &&
      (sessao.cargo === "SECRETARIA" ||
        (sessao as any).role === "SECRETARIA" ||
        (sessao as any).role === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso Negado (LGPD/RBAC)",
          motivo:
            "Secretárias não possuem autorização para acessar auditoria de check-ins clínicos.",
        },
        { status: 403 }
      );
    }
    const { searchParams } = new URL(req.url);
    const rawModulo = searchParams.get("modulo") || "bristol";
    const modulo =
      rawModulo.includes("hidric") || rawModulo.includes("hidrata")
        ? "hidrico"
        : "bristol";

    // 1. Limites do dia atual (00:00:00 até 23:59:59)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 2. Busca todos os pacientes ativos da clínica
    const pacientesAtivos = await prisma.patient.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        recordCode: true,
        fullName: true,
        cpf: true,
        phoneWhatsapp: true,
        convenio: true,
        metaDiariaMl: true,
      },
      orderBy: { fullName: "asc" },
    });

    const patientMap = new Map<string, typeof pacientesAtivos[0]>();
    pacientesAtivos.forEach((p) => {
      patientMap.set(p.id, p);
      if (p.recordCode) patientMap.set(p.recordCode, p);
      if (p.cpf) {
        patientMap.set(p.cpf, p);
        patientMap.set(p.cpf.replace(/\D/g, ""), p);
      }
    });

    // 3. Busca de acordo com o módulo
    if (modulo === "bristol") {
      const checkins = await prisma.checkinIntestinal.findMany({
        where: {
          data: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { data: "desc" },
      });

      const cliquesHoje = checkins.map((c) => {
        let p = patientMap.get(c.pacienteId);
        if (!p && (c.pacienteId === "carlos-faaz-001" || c.pacienteId.includes("carlos"))) {
          p = pacientesAtivos.find((pac) => pac.fullName.includes("Carlos"));
        }

        const d = new Date(c.data);
        const hora = d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        const rotulo =
          bristolLabels[c.tipoBristol] || `Bristol Tipo ${c.tipoBristol}`;

        return {
          id: c.id,
          pacienteId: c.pacienteId,
          nome: p ? p.fullName : "Paciente Mobile",
          cpf: p ? p.cpf : "111.222.333-44",
          telefone: p ? p.phoneWhatsapp : "(31) 98888-0001",
          acao: rotulo,
          categoria: c.categoria,
          tipoBristol: c.tipoBristol,
          sintomas: c.sintomas || [],
          horario: `Hoje às ${hora}`,
          dataRaw: c.data,
        };
      });

      // Pacientes ativos que AINDA NÃO registraram check-in hoje
      const idsQueClicaram = new Set(checkins.map((c) => c.pacienteId));
      const pendentesHoje = pacientesAtivos
        .filter((p) => !idsQueClicaram.has(p.id) && !idsQueClicaram.has(p.cpf || ""))
        .map((p) => ({
          id: p.id,
          nome: p.fullName,
          cpf: p.cpf,
          telefone: p.phoneWhatsapp,
          convenio: p.convenio || "Particular",
        }));

      return NextResponse.json(
        {
          success: true,
          modulo: "bristol",
          titulo: "Saúde Intestinal (Escala de Bristol)",
          totalCliquesHoje: cliquesHoje.length,
          totalPendentesHoje: pendentesHoje.length,
          cliquesHoje,
          pendentesHoje,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    } else {
      // Módulo Hídrico
      const checkins = await prisma.checkinHidratacao.findMany({
        where: {
          data: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { data: "desc" },
      });

      const cliquesHoje = checkins.map((c) => {
        let p = patientMap.get(c.pacienteId);
        if (!p && (c.pacienteId === "carlos-faaz-001" || c.pacienteId.includes("carlos"))) {
          p = pacientesAtivos.find((pac) => pac.fullName.includes("Carlos"));
        }

        const d = new Date(c.data);
        const hora = d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        return {
          id: c.id,
          pacienteId: c.pacienteId,
          nome: p ? p.fullName : "Paciente Mobile",
          cpf: p ? p.cpf : "111.222.333-44",
          telefone: p ? p.phoneWhatsapp : "(31) 98888-0001",
          acao: `+${c.volumeMl}ml ingeridos`,
          volumeMl: c.volumeMl,
          metaDiariaMl: c.metaDiariaMl,
          horario: `Hoje às ${hora}`,
          dataRaw: c.data,
        };
      });

      // Pacientes ativos que AINDA NÃO registraram hidratação hoje
      const idsQueClicaram = new Set(checkins.map((c) => c.pacienteId));
      const pendentesHoje = pacientesAtivos
        .filter((p) => !idsQueClicaram.has(p.id) && !idsQueClicaram.has(p.cpf || ""))
        .map((p) => ({
          id: p.id,
          nome: p.fullName,
          cpf: p.cpf,
          telefone: p.phoneWhatsapp,
          convenio: p.convenio || "Particular",
          metaDiariaMl: p.metaDiariaMl || 2500,
        }));

      return NextResponse.json(
        {
          success: true,
          modulo: "hidrico",
          titulo: "Aderência Hídrica",
          totalCliquesHoje: cliquesHoje.length,
          totalPendentesHoje: pendentesHoje.length,
          cliquesHoje,
          pendentesHoje,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }
  } catch (error: any) {
    console.error("[AUDITORIA_CHECKINS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Erro ao gerar auditoria diária.", details: error?.message },
      { status: 500 }
    );
  }
}
