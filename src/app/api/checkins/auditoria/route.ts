export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Between, IsNull } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckinHidratacaoEntity,
  CheckinIntestinalEntity,
  PatientEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { getHoraBR, getIntervaloDiaBR, toIsoUtc } from "@/lib/date-br";

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
    const sessaoRole = (sessao as { role?: string } | null)?.role;
    if (
      sessao &&
      (sessao.cargo === "SECRETARIA" ||
        sessaoRole === "SECRETARIA" ||
        sessaoRole === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso Negado (LGPD/RBAC)",
          motivo:
            "Secretárias não possuem autorização para acessar auditoria de check-ins clínicos.",
        },
        { status: 403 },
      );
    }
    const { searchParams } = new URL(req.url);
    const rawModulo = searchParams.get("modulo") || "bristol";
    const modulo =
      rawModulo.includes("hidric") || rawModulo.includes("hidrata")
        ? "hidrico"
        : "bristol";

    const { inicioUtc: startOfDay, fimUtc: endOfDay } = getIntervaloDiaBR();

    const patientRepo = await getRepository(PatientEntity);
    const pacientesAtivos = await patientRepo.find({
      where: {
        deletedAt: IsNull(),
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
      order: { fullName: "ASC" },
    });

    const patientMap = new Map<string, (typeof pacientesAtivos)[0]>();
    pacientesAtivos.forEach((p) => {
      patientMap.set(p.id, p);
      if (p.recordCode) patientMap.set(p.recordCode, p);
      if (p.cpf) {
        patientMap.set(p.cpf, p);
        patientMap.set(p.cpf.replace(/\D/g, ""), p);
      }
    });

    if (modulo === "bristol") {
      const bristolRepo = await getRepository(CheckinIntestinalEntity);
      const checkins = await bristolRepo.find({
        where: {
          data: Between(startOfDay, endOfDay),
        },
        order: { data: "DESC" },
      });

      const cliquesHoje = checkins.map((c) => {
        let p = patientMap.get(c.pacienteId);
        if (
          !p &&
          (c.pacienteId === "carlos-faaz-001" ||
            c.pacienteId.includes("carlos"))
        ) {
          p = pacientesAtivos.find((pac) => pac.fullName.includes("Carlos"));
        }

        const hora = getHoraBR(c.data);

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
          dataRaw: toIsoUtc(c.data) ?? c.data,
        };
      });

      const idsQueClicaram = new Set(checkins.map((c) => c.pacienteId));
      const pendentesHoje = pacientesAtivos
        .filter(
          (p) => !idsQueClicaram.has(p.id) && !idsQueClicaram.has(p.cpf || ""),
        )
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
        },
      );
    } else {
      const hidraRepo = await getRepository(CheckinHidratacaoEntity);
      const checkins = await hidraRepo.find({
        where: {
          data: Between(startOfDay, endOfDay),
        },
        order: { data: "DESC" },
      });

      const cliquesHoje = checkins.map((c) => {
        let p = patientMap.get(c.pacienteId);
        if (
          !p &&
          (c.pacienteId === "carlos-faaz-001" ||
            c.pacienteId.includes("carlos"))
        ) {
          p = pacientesAtivos.find((pac) => pac.fullName.includes("Carlos"));
        }

        const hora = getHoraBR(c.data);

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
          dataRaw: toIsoUtc(c.data) ?? c.data,
        };
      });

      const idsQueClicaram = new Set(checkins.map((c) => c.pacienteId));
      const pendentesHoje = pacientesAtivos
        .filter(
          (p) => !idsQueClicaram.has(p.id) && !idsQueClicaram.has(p.cpf || ""),
        )
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
        },
      );
    }
  } catch (error: unknown) {
    console.error("[AUDITORIA_CHECKINS_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao gerar auditoria diária.", details },
      { status: 500 },
    );
  }
}
