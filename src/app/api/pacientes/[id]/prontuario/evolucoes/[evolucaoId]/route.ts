export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db/data-source";
import {
  EvolucaoClinicaEntity,
  ProntuarioPacienteEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos, podeExcluirPacientes } from "@/lib/auth-rbac";

interface RouteParams {
  params: Promise<{ id: string; evolucaoId: string }>;
}

/**
 * PUT /api/pacientes/[id]/prontuario/evolucoes/[evolucaoId]
 * Atualiza um atendimento histórico específico.
 * Acesso: DONO_CLINICA, MEDICO, ADMINISTRADOR.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id, evolucaoId } = await params;
    const sessao = await getSessao();

    if (
      sessao &&
      !podeAcessarDadosClinicos(sessao.cargo) &&
      sessao.cargo !== "ADMINISTRADOR"
    ) {
      return NextResponse.json(
        { error: "Acesso negado para edição de registros clínicos." },
        { status: 403 },
      );
    }

    const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);
    const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);

    const evolucaoExistente = await evolucaoRepo.findOne({
      where: { id: evolucaoId },
    });

    if (!evolucaoExistente || evolucaoExistente.pacienteId !== id) {
      return NextResponse.json(
        { error: "Registro de atendimento não encontrado para este paciente." },
        { status: 404 },
      );
    }

    const body = await req.json();
    const {
      pesoAtual,
      alturaCm,
      queixaPrincipal,
      condutaEvolucao,
      dataAtendimento,
      medicoResponsavel,
    } = body;

    const pesoNum =
      pesoAtual !== undefined && pesoAtual !== null && pesoAtual !== ""
        ? parseFloat(String(pesoAtual).replace(",", "."))
        : null;

    const alturaNum =
      alturaCm !== undefined && alturaCm !== null && alturaCm !== ""
        ? parseFloat(String(alturaCm).replace(",", "."))
        : null;

    let imcCalculado: number | null = null;
    if (pesoNum && alturaNum && pesoNum > 0 && alturaNum > 0) {
      const alturaM = alturaNum > 3 ? alturaNum / 100 : alturaNum;
      imcCalculado = Math.round((pesoNum / (alturaM * alturaM)) * 100) / 100;
    }

    evolucaoExistente.pesoAtual = pesoNum;
    evolucaoExistente.alturaCm = alturaNum;
    evolucaoExistente.imc = imcCalculado;
    if (queixaPrincipal !== undefined) {
      evolucaoExistente.queixaPrincipal = queixaPrincipal
        ? String(queixaPrincipal).trim().toUpperCase()
        : null;
    }
    if (condutaEvolucao !== undefined) {
      evolucaoExistente.condutaEvolucao = String(condutaEvolucao)
        .trim()
        .toUpperCase();
    }
    if (dataAtendimento) {
      evolucaoExistente.dataAtendimento = new Date(dataAtendimento);
    }
    if (medicoResponsavel) {
      evolucaoExistente.medicoResponsavel = String(medicoResponsavel)
        .trim()
        .toUpperCase();
    }

    const dataAtualizada = await evolucaoRepo.save(evolucaoExistente);

    const historicoAtualizado = await evolucaoRepo.find({
      where: { pacienteId: id },
      order: { dataAtendimento: "DESC" },
    });

    if (
      historicoAtualizado.length > 0 &&
      historicoAtualizado[0].id === evolucaoId
    ) {
      await prontuarioRepo.update(
        { pacienteId: id },
        {
          pesoAtualKg: pesoNum,
          ...(alturaNum ? { alturaCm: alturaNum } : {}),
          imc: imcCalculado,
        },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Atendimento histórico atualizado com sucesso!",
      evolucao: dataAtualizada,
      historico: historicoAtualizado,
    });
  } catch (error: unknown) {
    console.error("[EVOLUCAO/[ID]/PUT] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao atualizar atendimento histórico.", details },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/pacientes/[id]/prontuario/evolucoes/[evolucaoId]
 * Exclui um atendimento histórico específico.
 * Acesso Restrito: DONO_CLINICA e ADMINISTRADOR.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id, evolucaoId } = await params;
    const sessao = await getSessao();

    if (sessao && !podeExcluirPacientes(sessao.cargo)) {
      return NextResponse.json(
        {
          error:
            "Apenas o Dono da Clínica e o Administrador possuem permissão para excluir registros históricos.",
        },
        { status: 403 },
      );
    }

    const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);
    const evolucaoExistente = await evolucaoRepo.findOne({
      where: { id: evolucaoId },
    });

    if (!evolucaoExistente || evolucaoExistente.pacienteId !== id) {
      return NextResponse.json(
        { error: "Registro de atendimento não encontrado." },
        { status: 404 },
      );
    }

    await evolucaoRepo.delete({ id: evolucaoId });

    const historicoAtualizado = await evolucaoRepo.find({
      where: { pacienteId: id },
      order: { dataAtendimento: "DESC" },
    });

    return NextResponse.json({
      success: true,
      message: "Atendimento histórico excluído com sucesso!",
      historico: historicoAtualizado,
    });
  } catch (error: unknown) {
    console.error("[EVOLUCAO/[ID]/DELETE] Erro:", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Erro ao excluir atendimento histórico.", details },
      { status: 500 },
    );
  }
}
