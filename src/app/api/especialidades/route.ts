export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { getRepository, withRepositoryRetry } from "@/lib/db/data-source";
import { EspecialidadeEntity, UserEntity } from "@/lib/db/entities";
import {
  ensureEspecialidadesSchemaAndSeed,
  mapEspecialidadeToDTO,
} from "@/lib/db/especialidades-bootstrap";
import { logOracleRouteError } from "@/lib/db/oracle-utils";
import { getSessao } from "@/lib/auth-session";
import { podeGerenciarEspecialidades } from "@/lib/auth-rbac";
import {
  CORES_ESPECIALIDADE_TOKENS,
  isCorEspecialidadeValida,
  normalizarTextoEspecialidade,
} from "@/lib/especialidades-clinica";
import { isUsuarioMedicoClinico } from "@/lib/medico-responsavel";

/**
 * GET /api/especialidades
 * Retorna as especialidades da clínica ordenadas por ORDEM, NOME.
 * - Padrão: apenas especialidades ativas (`ATIVO = 1`).
 * - `?incluirInativas=true`: retorna também especialidades inativas (para tela de Configurações).
 * - Liberado para todos os usuários autenticados da clínica.
 */
export async function GET(request: NextRequest) {
  try {
    const sessao = await getSessao(request);
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado. Faça login para continuar." },
        { status: 401 },
      );
    }

    await ensureEspecialidadesSchemaAndSeed();

    const { searchParams } = new URL(request.url);
    const incluirInativasParam = (
      searchParams.get("incluirInativas") || ""
    ).toLowerCase();
    const incluirInativas =
      incluirInativasParam === "true" || incluirInativasParam === "1";

    const [especialidades, usuariosAtivos] = await Promise.all([
      withRepositoryRetry(
        EspecialidadeEntity,
        (repo) =>
          repo.find({
            where: incluirInativas ? {} : { ativo: true },
            order: { ordem: "ASC", nome: "ASC" },
          }),
        { label: "especialidades:get-list" },
      ),
      withRepositoryRetry(
        UserEntity,
        (repo) =>
          repo.find({
            where: {
              ...(sessao.organizationId
                ? { organizationId: sessao.organizationId }
                : {}),
              deletedAt: IsNull(),
              accountStatus: "ACTIVE",
            },
            select: {
              id: true,
              cargo: true,
              role: true,
              isClinical: true,
              especialidadeId: true,
            },
          }),
        { label: "especialidades:count-medicos" },
      ),
    ]);

    const contagemPorEspecialidade = new Map<string, number>();
    for (const u of usuariosAtivos) {
      if (!u.especialidadeId || !isUsuarioMedicoClinico(u)) continue;
      contagemPorEspecialidade.set(
        u.especialidadeId,
        (contagemPorEspecialidade.get(u.especialidadeId) ?? 0) + 1,
      );
    }

    const lista = especialidades.map((esp) =>
      mapEspecialidadeToDTO(esp, contagemPorEspecialidade.get(esp.id) ?? 0),
    );

    return NextResponse.json(
      {
        success: true,
        especialidades: lista,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    logOracleRouteError("GET /api/especialidades", error);
    return NextResponse.json(
      { success: false, error: "Erro ao carregar especialidades da clínica." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/especialidades
 * Cria uma nova especialidade da clínica.
 * Restrito via RBAC a DONO_CLINICA (Diretoria Clínica) e ADMINISTRADOR.
 */
export async function POST(request: NextRequest) {
  try {
    const sessao = await getSessao(request);
    if (!sessao) {
      return NextResponse.json(
        { error: "Não autenticado. Faça login para continuar." },
        { status: 401 },
      );
    }
    if (!podeGerenciarEspecialidades(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Acesso negado. Apenas a Diretoria Clínica e Administradores podem cadastrar especialidades.",
        },
        { status: 403 },
      );
    }

    await ensureEspecialidadesSchemaAndSeed();

    const body = await request.json();
    const nomeRaw = typeof body?.nome === "string" ? body.nome.trim() : "";
    const corRaw =
      typeof body?.cor === "string" ? body.cor.trim().toLowerCase() : "emerald";
    const ordemRaw = body?.ordem;

    if (!nomeRaw || nomeRaw.length < 2) {
      return NextResponse.json(
        { error: "Informe o nome da especialidade (mínimo 2 caracteres)." },
        { status: 400 },
      );
    }
    if (nomeRaw.length > 100) {
      return NextResponse.json(
        { error: "O nome da especialidade deve ter no máximo 100 caracteres." },
        { status: 400 },
      );
    }
    if (!isCorEspecialidadeValida(corRaw)) {
      return NextResponse.json(
        {
          error: `Cor inválida. Escolha uma das opções da paleta clínica: ${CORES_ESPECIALIDADE_TOKENS.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const repo = await getRepository(EspecialidadeEntity);
    const existentes = await repo.find({
      order: { ordem: "ASC", nome: "ASC" },
    });

    const nomeNorm = normalizarTextoEspecialidade(nomeRaw);
    const duplicada = existentes.find(
      (e) => normalizarTextoEspecialidade(e.nome) === nomeNorm,
    );
    if (duplicada) {
      return NextResponse.json(
        {
          error: duplicada.ativo
            ? `Já existe uma especialidade cadastrada com o nome "${duplicada.nome}".`
            : `Já existe uma especialidade "${duplicada.nome}" inativa. Reative-a na lista em vez de duplicar.`,
        },
        { status: 409 },
      );
    }

    const maxOrdem = existentes.reduce(
      (acc, item) => Math.max(acc, Number(item.ordem) || 0),
      0,
    );
    const ordemFinal =
      typeof ordemRaw === "number" && Number.isFinite(ordemRaw)
        ? Math.max(0, Math.round(ordemRaw))
        : maxOrdem + 1;

    const criada = await repo.save(
      repo.create({
        nome: nomeRaw,
        cor: corRaw,
        ativo: true,
        ordem: ordemFinal,
      }),
    );

    return NextResponse.json(
      {
        sucesso: true,
        success: true,
        especialidade: mapEspecialidadeToDTO(criada, 0),
      },
      { status: 201 },
    );
  } catch (error) {
    logOracleRouteError("POST /api/especialidades", error);
    return NextResponse.json(
      { success: false, error: "Erro ao criar nova especialidade." },
      { status: 500 },
    );
  }
}
