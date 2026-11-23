export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { getDataSource, getRepository } from "@/lib/db/data-source";
import {
  EspecialidadeEntity,
  MedicoEntity,
  UserEntity,
} from "@/lib/db/entities";
import {
  ensureEspecialidadesSchemaAndSeed,
  mapEspecialidadeToDTO,
} from "@/lib/db/especialidades-bootstrap";
import {
  extractOracleErrorInfo,
  logOracleRouteError,
} from "@/lib/db/oracle-utils";
import { getSessao } from "@/lib/auth-session";
import { podeGerenciarEspecialidades } from "@/lib/auth-rbac";
import {
  CORES_ESPECIALIDADE_TOKENS,
  gerarCodigoEspecialidadeLegado,
  getCorEspecialidadeEstilo,
  isCorEspecialidadeValida,
  normalizarTextoEspecialidade,
} from "@/lib/especialidades-clinica";
import { isUsuarioMedicoClinico } from "@/lib/medico-responsavel";

async function contarMedicosAtivosPorEspecialidade(
  especialidadeId: string,
  organizationId?: string,
): Promise<number> {
  const userRepo = await getRepository(UserEntity);
  const usuarios = await userRepo.find({
    where: {
      ...(organizationId ? { organizationId } : {}),
      especialidadeId,
      deletedAt: IsNull(),
      accountStatus: "ACTIVE",
    },
    select: {
      id: true,
      cargo: true,
      role: true,
      isClinical: true,
    },
  });
  return usuarios.filter((u) => isUsuarioMedicoClinico(u)).length;
}

/**
 * PATCH /api/especialidades/[id]
 * Edita nome, cor, ordem ou status ativo/inativo de uma especialidade.
 * Restrito via RBAC a DONO_CLINICA e ADMINISTRADOR.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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
            "Acesso negado. Apenas a Diretoria Clínica e Administradores podem editar especialidades.",
        },
        { status: 403 },
      );
    }

    await ensureEspecialidadesSchemaAndSeed();

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { error: "ID da especialidade é obrigatório." },
        { status: 400 },
      );
    }

    const repo = await getRepository(EspecialidadeEntity);
    const existente = await repo.findOne({ where: { id } });
    if (!existente) {
      return NextResponse.json(
        { error: "Especialidade não encontrada." },
        { status: 404 },
      );
    }

    const body = await request.json();
    const updateData: {
      nome?: string;
      cor?: string;
      ordem?: number;
      ativo?: boolean;
    } = {};

    if (body.nome !== undefined) {
      const nomeClean = typeof body.nome === "string" ? body.nome.trim() : "";
      if (!nomeClean || nomeClean.length < 2) {
        return NextResponse.json(
          { error: "Informe um nome válido (mínimo 2 caracteres)." },
          { status: 400 },
        );
      }
      if (nomeClean.length > 100) {
        return NextResponse.json(
          { error: "O nome da especialidade deve ter no máximo 100 caracteres." },
          { status: 400 },
        );
      }
      const todas = await repo.find({ select: { id: true, nome: true } });
      const normAlvo = normalizarTextoEspecialidade(nomeClean);
      const conflito = todas.find(
        (e) => e.id !== id && normalizarTextoEspecialidade(e.nome) === normAlvo,
      );
      if (conflito) {
        return NextResponse.json(
          {
            error: `Já existe outra especialidade cadastrada com o nome "${conflito.nome}".`,
          },
          { status: 409 },
        );
      }
      updateData.nome = nomeClean;
    }

    if (body.cor !== undefined) {
      const corClean =
        typeof body.cor === "string" ? body.cor.trim().toLowerCase() : "";
      if (!isCorEspecialidadeValida(corClean)) {
        return NextResponse.json(
          {
            error: `Cor inválida. Escolha uma das opções: ${CORES_ESPECIALIDADE_TOKENS.join(", ")}.`,
          },
          { status: 400 },
        );
      }
      updateData.cor = corClean;
    }

    if (body.ordem !== undefined) {
      const num = Number(body.ordem);
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json(
          { error: "Ordem inválida." },
          { status: 400 },
        );
      }
      updateData.ordem = Math.round(num);
    }

    if (body.ativo !== undefined) {
      updateData.ativo = Boolean(body.ativo);
    }

    if (Object.keys(updateData).length === 0) {
      const medicosAtivosCount = await contarMedicosAtivosPorEspecialidade(
        id,
        sessao.organizationId,
      );
      return NextResponse.json({
        sucesso: true,
        success: true,
        especialidade: mapEspecialidadeToDTO(existente, medicosAtivosCount),
      });
    }

    await repo.update({ id }, updateData);

    // Se a cor foi alterada, atualiza o espelho MEDICOS.COR_HEX dos médicos vinculados
    if (updateData.cor) {
      const novoHex = getCorEspecialidadeEstilo(updateData.cor).hex;
      try {
        const userRepo = await getRepository(UserEntity);
        const vinculados = await userRepo.find({
          where: { especialidadeId: id, deletedAt: IsNull() },
          select: { id: true },
        });
        if (vinculados.length > 0) {
          const medicoRepo = await getRepository(MedicoEntity);
          for (const u of vinculados) {
            await medicoRepo.update({ id: u.id }, { corHex: novoHex });
          }
        }
      } catch (syncErr) {
        console.warn(
          "[PATCH /api/especialidades/[id]] Aviso ao sincronizar cor em MEDICOS:",
          syncErr,
        );
      }
    }

    const atualizada = await repo.findOneOrFail({ where: { id } });
    const medicosAtivosCount = await contarMedicosAtivosPorEspecialidade(
      id,
      sessao.organizationId,
    );

    return NextResponse.json({
      sucesso: true,
      success: true,
      especialidade: mapEspecialidadeToDTO(atualizada, medicosAtivosCount),
    });
  } catch (error) {
    logOracleRouteError("PATCH /api/especialidades/[id]", error);
    return NextResponse.json(
      { success: false, error: "Erro ao atualizar especialidade." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return PATCH(request, context);
}

/**
 * DELETE /api/especialidades/[id]
 * Se houver médicos (ativos ou históricos) ou agendamentos vinculados, realiza
 * INATIVAÇÃO LÓGICA (ATIVO = 0) para preservar o histórico clínico e evitar ORA-02292.
 * Caso não haja nenhum vínculo, remove fisicamente o registro.
 * Restrito via RBAC a DONO_CLINICA e ADMINISTRADOR.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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
            "Acesso negado. Apenas a Diretoria Clínica e Administradores podem desativar ou remover especialidades.",
        },
        { status: 403 },
      );
    }

    await ensureEspecialidadesSchemaAndSeed();

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { error: "ID da especialidade é obrigatório." },
        { status: 400 },
      );
    }

    const repo = await getRepository(EspecialidadeEntity);
    const existente = await repo.findOne({ where: { id } });
    if (!existente) {
      return NextResponse.json(
        { error: "Especialidade não encontrada." },
        { status: 404 },
      );
    }

    const ds = await getDataSource();
    const codigoLegado = gerarCodigoEspecialidadeLegado(existente.nome);

    const [usersRefRows, agendRefRows] = await Promise.all([
      ds.query(
        `SELECT COUNT(*) AS TOTAL FROM USERS WHERE ESPECIALIDADE_ID = :1`,
        [id],
      ) as Promise<Array<{ TOTAL?: number | string }>>,
      ds.query(
        `SELECT COUNT(*) AS TOTAL
         FROM AGENDAMENTOS
         WHERE ESPECIALIDADE_ID = :1 OR UPPER(ESPECIALIDADE) = :2`,
        [id, codigoLegado],
      ) as Promise<Array<{ TOTAL?: number | string }>>,
    ]);

    const totalUsuariosVinculados = Number(usersRefRows[0]?.TOTAL ?? 0);
    const totalAgendamentosVinculados = Number(agendRefRows[0]?.TOTAL ?? 0);

    if (totalUsuariosVinculados > 0 || totalAgendamentosVinculados > 0) {
      await repo.update({ id }, { ativo: false });
      const atualizada = await repo.findOneOrFail({ where: { id } });
      const medicosAtivosCount = await contarMedicosAtivosPorEspecialidade(
        id,
        sessao.organizationId,
      );
      return NextResponse.json({
        sucesso: true,
        success: true,
        inativada: true,
        excluidaFisicamente: false,
        especialidade: mapEspecialidadeToDTO(atualizada, medicosAtivosCount),
        mensagem:
          `A especialidade "${existente.nome}" possui profissionais ou agendamentos históricos vinculados e foi desativada (preservando todo o histórico).`,
      });
    }

    try {
      await repo.delete({ id });
      return NextResponse.json({
        sucesso: true,
        success: true,
        inativada: false,
        excluidaFisicamente: true,
        mensagem: `Especialidade "${existente.nome}" removida com sucesso.`,
      });
    } catch (deleteErr) {
      const info = extractOracleErrorInfo(deleteErr);
      if (info.errorNum === 2292) {
        // Fallback defensivo para integridade referencial concorrente (ORA-02292)
        await repo.update({ id }, { ativo: false });
        const atualizada = await repo.findOneOrFail({ where: { id } });
        const medicosAtivosCount = await contarMedicosAtivosPorEspecialidade(
          id,
          sessao.organizationId,
        );
        return NextResponse.json({
          sucesso: true,
          success: true,
          inativada: true,
          excluidaFisicamente: false,
          especialidade: mapEspecialidadeToDTO(atualizada, medicosAtivosCount),
          mensagem:
            `A especialidade "${existente.nome}" possui vínculos no banco e foi desativada (preservando o histórico).`,
        });
      }
      throw deleteErr;
    }
  } catch (error) {
    logOracleRouteError("DELETE /api/especialidades/[id]", error);
    return NextResponse.json(
      { success: false, error: "Erro ao remover/desativar especialidade." },
      { status: 500 },
    );
  }
}
