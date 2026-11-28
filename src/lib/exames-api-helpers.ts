import type { NextRequest } from "next/server";
import { withRepositoryRetry } from "@/lib/db/data-source";
import { safeClobString, safeJsonParse } from "@/lib/db/oracle-utils";
import {
  UserEntity,
  type ExameLaboratorial,
  type ExamePersonalizadoItem,
} from "@/lib/db/entities";
import type { UserSessionPayload } from "@/lib/auth-rbac";
import {
  EXAM_BY_KEY,
  LAUDO_BY_KEY,
  parseNumericExamValue,
  type ExameLaboratorialDTO,
} from "@/lib/exames-catalog";
import { toIsoUtc } from "@/lib/date-br";

const ALLOWED_CLINICAL_ROLES = new Set([
  "DONO_CLINICA",
  "CLINIC_ADMIN",
  "MEDICO",
  "DOCTOR",
]);

const BLOCKED_ROLES = new Set([
  "SECRETARIA",
  "RECEPTIONIST",
  "PACIENTE",
  "PATIENT",
  "ADMINISTRADOR",
  "ADMIN",
]);

export function isCorpoClinicoExamesAutorizado(
  sessao: (UserSessionPayload & { role?: string | null }) | null,
): boolean {
  if (!sessao) return false;
  const cargo = (sessao.cargo || "").trim().toUpperCase();
  const role = (sessao.role || "").trim().toUpperCase();
  if (BLOCKED_ROLES.has(cargo) || BLOCKED_ROLES.has(role)) {
    return false;
  }
  return ALLOWED_CLINICAL_ROLES.has(cargo) || ALLOWED_CLINICAL_ROLES.has(role);
}

/**
 * Identifica requisições oriundas do app/portal do paciente (Bearer token ou cabeçalho paciente-id)
 * para garantir bloqueio explícito HTTP 403 (sigilo médico) quando não há sessão clínica válida.
 */
export function hasPatientAuthCredentials(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.trim().toLowerCase().startsWith("bearer ")) {
    return true;
  }
  const pacienteHeader = req.headers.get("paciente-id");
  if (pacienteHeader && pacienteHeader.trim().length > 0) {
    return true;
  }
  return false;
}

export function normalizeDateColetaIso(input: unknown): string | null {
  if (typeof input === "string") {
    const m = input.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    return null;
  }
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.toISOString().slice(0, 10);
  }
  return null;
}

export function sanitizeExamePayload(body: Record<string, unknown>): {
  dataColeta: string | null;
  laboratorio: string | null;
  valores: Record<string, number | string>;
  examesPersonalizados: ExamePersonalizadoItem[];
  laudosImagem: Record<string, string>;
  observacoes: string | null;
} {
  const dataColeta = normalizeDateColetaIso(body.dataColeta ?? body.data_coleta);

  const rawLab = typeof body.laboratorio === "string" ? body.laboratorio.trim() : "";
  const laboratorio = rawLab ? rawLab.slice(0, 160).toUpperCase() : null;

  const rawObs = typeof body.observacoes === "string" ? body.observacoes.trim() : "";
  const observacoes = rawObs ? rawObs.slice(0, 4000).toUpperCase() : null;

  const valores: Record<string, number | string> = {};
  if (body.valores && typeof body.valores === "object" && !Array.isArray(body.valores)) {
    for (const [key, rawVal] of Object.entries(body.valores as Record<string, unknown>)) {
      if (rawVal === null || rawVal === undefined || rawVal === "") continue;
      if (key.startsWith("_calc_")) continue;
      const def = EXAM_BY_KEY[key];
      if (!def || def.isCalculated) continue;

      if (def.type === "number") {
        const num = parseNumericExamValue(rawVal);
        if (num !== null) {
          valores[key] = num;
        }
      } else {
        const txt = String(rawVal).trim();
        if (txt) {
          valores[key] = txt.slice(0, 300).toUpperCase();
        }
      }
    }
  }

  const examesPersonalizados: ExamePersonalizadoItem[] = [];
  const rawCustom = body.examesPersonalizados ?? body.exames_personalizados;
  if (Array.isArray(rawCustom)) {
    for (const item of rawCustom.slice(0, 50)) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const nome =
        typeof obj.nome === "string"
          ? obj.nome.trim().slice(0, 120).toUpperCase()
          : "";
      if (!nome) continue;
      const rawVal = obj.valor;
      if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") continue;

      const parsedNum = parseNumericExamValue(rawVal);
      const valor: string | number =
        parsedNum !== null && /^[\d.,\s+-]+$/.test(String(rawVal).trim())
          ? parsedNum
          : String(rawVal).trim().slice(0, 200).toUpperCase();

      const unidade =
        typeof obj.unidade === "string" && obj.unidade.trim()
          ? obj.unidade.trim().slice(0, 40)
          : undefined;
      const referencia =
        typeof obj.referencia === "string" && obj.referencia.trim()
          ? obj.referencia.trim().slice(0, 80)
          : undefined;

      examesPersonalizados.push({ nome, valor, unidade, referencia });
    }
  }

  const laudosImagem: Record<string, string> = {};
  const rawLaudos = body.laudosImagem ?? body.laudos_imagem;
  if (rawLaudos && typeof rawLaudos === "object" && !Array.isArray(rawLaudos)) {
    for (const [key, rawVal] of Object.entries(rawLaudos as Record<string, unknown>)) {
      if (!LAUDO_BY_KEY[key]) continue;
      const txt = typeof rawVal === "string" ? rawVal.trim() : "";
      if (txt) {
        laudosImagem[key] = txt.slice(0, 2000).toUpperCase();
      }
    }
  }

  return {
    dataColeta,
    laboratorio,
    valores,
    examesPersonalizados,
    laudosImagem,
    observacoes,
  };
}

export function serializeExame(row: ExameLaboratorial): ExameLaboratorialDTO {
  const dataColeta = normalizeDateColetaIso(row.dataColeta) || "";
  const parsedValores = safeJsonParse<Record<string, number | string>>(
    row.valores,
    {},
  );
  const parsedPersonalizados = safeJsonParse<ExamePersonalizadoItem[]>(
    row.examesPersonalizados,
    [],
  );
  const parsedLaudos = safeJsonParse<Record<string, string>>(
    row.laudosImagem,
    {},
  );
  const obsText = safeClobString(row.observacoes).trim();

  return {
    id: row.id,
    organizacaoId: row.organizacaoId,
    pacienteId: row.pacienteId,
    medicoId: row.medicoId ?? null,
    dataColeta,
    laboratorio: row.laboratorio ?? null,
    valores:
      parsedValores && typeof parsedValores === "object" && !Array.isArray(parsedValores)
        ? parsedValores
        : {},
    examesPersonalizados: Array.isArray(parsedPersonalizados)
      ? parsedPersonalizados
      : [],
    laudosImagem:
      parsedLaudos && typeof parsedLaudos === "object" && !Array.isArray(parsedLaudos)
        ? parsedLaudos
        : {},
    observacoes: obsText || null,
    createdAt: toIsoUtc(row.createdAt),
    updatedAt: toIsoUtc(row.updatedAt),
  };
}

export async function resolverOrganizacaoSessao(
  sessao: UserSessionPayload,
): Promise<string | null> {
  if (sessao.organizationId) return sessao.organizationId;
  if (!sessao.userId) return null;
  const user = await withRepositoryRetry(
    UserEntity,
    (repo) =>
      repo.findOne({
        where: { id: sessao.userId },
        select: { id: true, organizationId: true },
      }),
    { label: "exames:user-org" },
  );
  return user?.organizationId ?? null;
}
