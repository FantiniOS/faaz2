export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { z } from "zod";
import { withRepositoryRetry } from "@/lib/db/data-source";
import {
  PatientEntity,
  ProtocoloGlicemicoEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import {
  detectarModoPorSlots,
  parseSlotsAtivos,
  PROTOCOLO_PRESETS,
  serializeProtocoloGlicemico,
  serializeSlotsAtivos,
  type ModoProtocoloGlicemico,
} from "@/lib/mapa-glicemico";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_MODOS = [
  "LIVRE",
  "JEJUM",
  "PAREADO",
  "MAPA_COMPLETO",
  "PERSONALIZADO",
] as const;

const putProtocoloSchema = z.object({
  ativo: z.boolean().optional(),
  usaInsulina: z.boolean().optional(),
  modo: z.enum(VALID_MODOS).optional(),
  slotsAtivos: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
  alvoJejumMin: z.coerce.number().int().min(40).max(150).optional(),
  alvoJejumMax: z.coerce.number().int().min(80).max(250).optional(),
  alvoPosMax: z.coerce.number().int().min(100).max(350).optional(),
  insulinaBasalNome: z.string().max(80).nullable().optional(),
  insulinaBasalDoseRef: z.union([z.coerce.number().min(0).max(300), z.null()]).optional(),
  insulinaBasalHorario: z.string().max(30).nullable().optional(),
  insulinaRapidaNome: z.string().max(80).nullable().optional(),
  orientacaoHipo: z.string().max(300).nullable().optional(),
  orientacaoHiper: z.string().max(300).nullable().optional(),
});

function cleanOptionalText(val: string | null | undefined, maxLen: number): string | null {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
}

/**
 * GET /api/pacientes/[id]/protocolo-glicemico
 * Acessível pelo Web autenticado (corpo clínico) e pelo App Mobile do paciente.
 * Retorna defaults limpos (ativo: false) se ainda não houver linha no Oracle.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const sessao = await getSessao(req);
    const sessaoRole = (sessao as { role?: string } | null)?.role;
    if (
      sessao &&
      (!podeAcessarDadosClinicos(sessao.cargo) ||
        sessao.cargo === "SECRETARIA" ||
        sessaoRole === "SECRETARIA" ||
        sessaoRole === "RECEPTIONIST")
    ) {
      return NextResponse.json(
        {
          error: "Acesso negado (LGPD/RBAC).",
          motivo:
            "Dados de protocolo glicêmico são restritos ao corpo médico.",
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const row = await withRepositoryRetry(
      ProtocoloGlicemicoEntity,
      (repo) =>
        repo.findOne({
          where: { pacienteId: id },
        }),
      { label: "protocolo-glicemico:get" },
    );

    return NextResponse.json({
      success: true,
      protocolo: serializeProtocoloGlicemico(id, row),
    });
  } catch (error: unknown) {
    console.error("[API_PROTOCOLO_GLICEMICO_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao consultar protocolo glicêmico.", details },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/pacientes/[id]/protocolo-glicemico
 * Protegido por sessão clínica (DONO_CLINICA / MEDICO).
 * Faz upsert imediato no Oracle. Se ativo === false, força usaInsulina = false
 * preservando integralmente o histórico de medições e aplicações no banco.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const sessao = await getSessao(req);
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado. Faça login clínico para configurar o protocolo." },
        { status: 401 },
      );
    }

    const sessaoRole = (sessao as { role?: string }).role;
    if (
      !podeAcessarDadosClinicos(sessao.cargo) ||
      sessao.cargo === "SECRETARIA" ||
      sessaoRole === "SECRETARIA" ||
      sessaoRole === "RECEPTIONIST"
    ) {
      return NextResponse.json(
        {
          error: "Acesso negado (LGPD/RBAC).",
          motivo:
            "Apenas médicos e responsáveis clínicos podem configurar o protocolo glicêmico.",
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = putProtocoloSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Parâmetros inválidos para o protocolo glicêmico.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    // Valida se paciente existe (projeção mínima sem CLOBs)
    const patient = await withRepositoryRetry(
      PatientEntity,
      (repo) =>
        repo.findOne({
          where: { id, deletedAt: IsNull() },
          select: { id: true },
        }),
      { label: "protocolo-glicemico:patient-check" },
    );

    if (!patient) {
      return NextResponse.json(
        { error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const input = parsed.data;

    const saved = await withRepositoryRetry(
      ProtocoloGlicemicoEntity,
      async (repo) => {
        const existing = await repo.findOne({ where: { pacienteId: id } });
        const base = serializeProtocoloGlicemico(id, existing);

        const nextAtivo =
          input.ativo !== undefined ? input.ativo : base.ativo;
        // Regra de ouro: se ativo === false, força usaInsulina = false sem apagar histórico
        const nextUsaInsulina = nextAtivo
          ? input.usaInsulina !== undefined
            ? input.usaInsulina
            : base.usaInsulina
          : false;

        let nextSlots =
          input.slotsAtivos !== undefined
            ? parseSlotsAtivos(input.slotsAtivos)
            : base.slotsAtivos;

        let nextModo: ModoProtocoloGlicemico =
          input.modo !== undefined ? input.modo : base.modo;

        // Se o modo preset foi informado sem slots explícitos, aplica os slots do preset
        if (input.modo !== undefined && input.slotsAtivos === undefined) {
          const preset = PROTOCOLO_PRESETS.find((p) => p.modo === input.modo);
          if (preset) {
            nextSlots = [...preset.slots];
          }
        } else if (input.slotsAtivos !== undefined && input.modo === undefined) {
          nextModo = detectarModoPorSlots(nextSlots);
        }

        const nextAlvoJejumMin = input.alvoJejumMin ?? base.alvoJejumMin;
        const rawAlvoJejumMax = input.alvoJejumMax ?? base.alvoJejumMax;
        const nextAlvoJejumMax = Math.max(nextAlvoJejumMin + 10, rawAlvoJejumMax);
        const rawAlvoPosMax = input.alvoPosMax ?? base.alvoPosMax;
        const nextAlvoPosMax = Math.max(nextAlvoJejumMax, rawAlvoPosMax);

        const nextBasalNome =
          input.insulinaBasalNome !== undefined
            ? cleanOptionalText(input.insulinaBasalNome, 80)
            : base.insulinaBasalNome;

        const nextBasalDoseRef =
          input.insulinaBasalDoseRef !== undefined
            ? input.insulinaBasalDoseRef !== null && input.insulinaBasalDoseRef > 0
              ? Math.round(input.insulinaBasalDoseRef * 100) / 100
              : null
            : base.insulinaBasalDoseRef;

        const nextBasalHorario =
          input.insulinaBasalHorario !== undefined
            ? cleanOptionalText(input.insulinaBasalHorario, 30)
            : base.insulinaBasalHorario;

        const nextRapidaNome =
          input.insulinaRapidaNome !== undefined
            ? cleanOptionalText(input.insulinaRapidaNome, 80)
            : base.insulinaRapidaNome;

        const nextOrientacaoHipo =
          input.orientacaoHipo !== undefined
            ? cleanOptionalText(input.orientacaoHipo, 300)
            : base.orientacaoHipo;

        const nextOrientacaoHiper =
          input.orientacaoHiper !== undefined
            ? cleanOptionalText(input.orientacaoHiper, 300)
            : base.orientacaoHiper;

        const entity = repo.create({
          pacienteId: id,
          ativo: nextAtivo,
          usaInsulina: nextUsaInsulina,
          modo: nextModo,
          slotsAtivos: serializeSlotsAtivos(nextSlots),
          alvoJejumMin: nextAlvoJejumMin,
          alvoJejumMax: nextAlvoJejumMax,
          alvoPosMax: nextAlvoPosMax,
          insulinaBasalNome: nextBasalNome,
          insulinaBasalDoseRef: nextBasalDoseRef,
          insulinaBasalHorario: nextBasalHorario,
          insulinaRapidaNome: nextRapidaNome,
          orientacaoHipo: nextOrientacaoHipo,
          orientacaoHiper: nextOrientacaoHiper,
          updatedAt: new Date(),
        });

        return repo.save(entity);
      },
      { label: "protocolo-glicemico:upsert" },
    );

    return NextResponse.json({
      success: true,
      protocolo: serializeProtocoloGlicemico(id, saved),
    });
  } catch (error: unknown) {
    console.error("[API_PROTOCOLO_GLICEMICO_PUT_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao salvar protocolo glicêmico.", details },
      { status: 500 },
    );
  }
}
