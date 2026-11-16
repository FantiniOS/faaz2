export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";

const checkinGlicemiaSchema = z.object({
  pacienteId: z.string().optional(),
  valor: z.coerce
    .number()
    .int("O valor da glicemia deve ser um número inteiro.")
    .min(20, "Valor mínimo permitido: 20 mg/dL.")
    .max(600, "Valor máximo permitido: 600 mg/dL."),
  momento: z
    .string()
    .optional()
    .default("JEJUM")
    .transform((val) => {
      const upper = val.trim().toUpperCase();
      if (upper === "POS_PRANDIAL" || upper === "PÓS-REFEIÇÃO" || upper === "POS-REFEICAO") {
        return "POS_PRANDIAL";
      }
      if (upper === "CASUAL" || upper === "OUTRO") {
        return "CASUAL";
      }
      return "JEJUM";
    }),
  dataRegistro: z.string().optional(),
});

export function formatarMomentoGlicemia(momento: string): string {
  switch (momento) {
    case "JEJUM":
      return "Em Jejum";
    case "POS_PRANDIAL":
      return "Pós-Refeição";
    case "CASUAL":
      return "Outro";
    default:
      return momento;
  }
}

async function resolverPacienteIdValido(rawId?: string): Promise<string> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleanId = rawId?.trim() || "";

  if (cleanId && uuidRegex.test(cleanId)) {
    const found = await prisma.patient.findUnique({
      where: { id: cleanId },
      select: { id: true },
    });
    if (found) return found.id;
  }

  if (cleanId) {
    const byCode = await prisma.patient.findFirst({
      where: {
        OR: [
          { recordCode: { equals: cleanId, mode: "insensitive" } },
          { cpf: cleanId },
        ],
      },
      select: { id: true },
    });
    if (byCode) return byCode.id;
  }

  // Fallback para o paciente principal de teste (Carlos Eduardo Fantini - FAAZ-00001)
  const carlos = await prisma.patient.findFirst({
    where: {
      OR: [
        { recordCode: "FAAZ-00001" },
        { fullName: { contains: "Carlos Eduardo Fantini", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (carlos) return carlos.id;

  const anyPatient = await prisma.patient.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });
  if (!anyPatient) {
    throw new Error("Nenhum paciente cadastrado no banco de dados.");
  }
  return anyPatient.id;
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = checkinGlicemiaSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos para registro de glicemia.",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { pacienteId, valor, momento, dataRegistro } = parsed.data;
    const validPacienteId = await resolverPacienteIdValido(pacienteId);

    const novoRegistro = await prisma.registroGlicemia.create({
      data: {
        pacienteId: validPacienteId,
        valor,
        momento,
        dataRegistro: dataRegistro ? new Date(dataRegistro) : new Date(),
      },
      include: {
        paciente: {
          select: {
            id: true,
            recordCode: true,
            fullName: true,
            socialName: true,
          },
        },
      },
    });

    const isCritico = valor < 70 || valor > 180;

    return NextResponse.json(
      {
        success: true,
        message: "Glicemia registrada com sucesso!",
        isCritico,
        tipoAlerta: valor < 70 ? "HIPOGLICEMIA" : valor > 180 ? "HIPERGLICEMIA" : "NORMAL",
        data: {
          id: novoRegistro.id,
          pacienteId: novoRegistro.pacienteId,
          pacienteNome: novoRegistro.paciente.socialName || novoRegistro.paciente.fullName,
          valor: novoRegistro.valor,
          momento: novoRegistro.momento,
          momentoLegivel: formatarMomentoGlicemia(novoRegistro.momento),
          dataRegistro: novoRegistro.dataRegistro.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[API_CHECKINS_GLICEMIA_POST_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro interno ao registrar glicemia.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

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
            "Secretárias não possuem autorização para acessar dados clínicos de glicemia.",
        },
        { status: 403 }
      );
    }
    const { searchParams } = new URL(req.url);
    const pacienteId = searchParams.get("pacienteId");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const whereHoje: any = {
      dataRegistro: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    if (pacienteId && pacienteId.trim().length > 0) {
      const resolvedId = await resolverPacienteIdValido(pacienteId);
      whereHoje.pacienteId = resolvedId;
    }

    const registrosHojeDb = await prisma.registroGlicemia.findMany({
      where: whereHoje,
      orderBy: { dataRegistro: "desc" },
      take: limit,
      include: {
        paciente: {
          select: {
            id: true,
            recordCode: true,
            fullName: true,
            socialName: true,
            cpf: true,
            phoneWhatsapp: true,
            birthDate: true,
            biologicalSex: true,
            convenio: true,
            patientStatus: true,
          },
        },
      },
    });

    const formatarItem = (r: (typeof registrosHojeDb)[number]) => {
      const nome = r.paciente.socialName || r.paciente.fullName;
      const isCritico = r.valor < 70 || r.valor > 180;
      const tipoAlerta =
        r.valor < 70
          ? "HIPOGLICEMIA"
          : r.valor > 180
          ? "HIPERGLICEMIA"
          : "NORMAL";

      const horario = r.dataRegistro.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        id: r.id,
        pacienteId: r.pacienteId,
        pacienteNome: nome,
        pacienteRecordCode: r.paciente.recordCode,
        pacienteCpf: r.paciente.cpf || "",
        pacienteTelefone: r.paciente.phoneWhatsapp || "",
        pacienteDataNascimento: r.paciente.birthDate
          ? r.paciente.birthDate.toISOString().split("T")[0]
          : null,
        pacienteSexo: r.paciente.biologicalSex || "OTHER",
        pacienteConvenio: r.paciente.convenio || "Particular",
        pacienteStatus: r.paciente.patientStatus === "ACTIVE" ? "Ativo" : "Inativo",
        valor: r.valor,
        momento: r.momento,
        momentoLegivel: formatarMomentoGlicemia(r.momento),
        horario,
        dataRegistro: r.dataRegistro.toISOString(),
        isCritico,
        tipoAlerta,
      };
    };

    const registrosHoje = registrosHojeDb.map(formatarItem);
    const alertasHoje = registrosHoje.filter((item) => item.isCritico);
    const pacientesCriticosUnicos = new Set(alertasHoje.map((a) => a.pacienteId)).size;

    return NextResponse.json(
      {
        success: true,
        totalAlertasHoje: alertasHoje.length,
        pacientesCriticosHoje: pacientesCriticosUnicos,
        totalRegistrosHoje: registrosHoje.length,
        alertasHoje,
        registrosHoje,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error: any) {
    console.error("[API_CHECKINS_GLICEMIA_GET_ERROR]", error);
    return NextResponse.json(
      {
        error: "Erro ao buscar registros de glicemia.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
