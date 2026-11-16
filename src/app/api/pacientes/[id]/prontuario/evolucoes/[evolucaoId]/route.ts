export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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

    if (sessao && !podeAcessarDadosClinicos(sessao.cargo) && sessao.cargo !== "ADMINISTRADOR") {
      return NextResponse.json(
        { error: "Acesso negado para edição de registros clínicos." },
        { status: 403 }
      );
    }

    const evolucaoExistente = await prisma.evolucaoClinica.findUnique({
      where: { id: evolucaoId },
    });

    if (!evolucaoExistente || evolucaoExistente.pacienteId !== id) {
      return NextResponse.json(
        { error: "Registro de atendimento não encontrado para este paciente." },
        { status: 404 }
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

    // Recalcula o IMC daquele atendimento
    let imcCalculado: number | null = null;
    if (pesoNum && alturaNum && pesoNum > 0 && alturaNum > 0) {
      const alturaM = alturaNum > 3 ? alturaNum / 100 : alturaNum;
      imcCalculado = Math.round((pesoNum / (alturaM * alturaM)) * 100) / 100;
    }

    const dataAtualizada = await prisma.evolucaoClinica.update({
      where: { id: evolucaoId },
      data: {
        pesoAtual: pesoNum,
        alturaCm: alturaNum,
        imc: imcCalculado,
        queixaPrincipal: queixaPrincipal !== undefined ? (queixaPrincipal ? String(queixaPrincipal).trim().toUpperCase() : null) : undefined,
        condutaEvolucao: condutaEvolucao !== undefined ? String(condutaEvolucao).trim().toUpperCase() : undefined,
        ...(dataAtendimento ? { dataAtendimento: new Date(dataAtendimento) } : {}),
        ...(medicoResponsavel ? { medicoResponsavel: String(medicoResponsavel).trim().toUpperCase() } : {}),
      },
    });

    // Busca o histórico consolidado atualizado para a interface refletir imediatamente
    const historicoAtualizado = await prisma.evolucaoClinica.findMany({
      where: { pacienteId: id },
      orderBy: { dataAtendimento: "desc" },
    });

    // Se este foi o atendimento mais recente, mantém o prontuário base sincronizado
    if (historicoAtualizado.length > 0 && historicoAtualizado[0].id === evolucaoId) {
      await prisma.prontuarioPaciente.updateMany({
        where: { pacienteId: id },
        data: {
          pesoAtualKg: pesoNum,
          ...(alturaNum ? { alturaCm: alturaNum } : {}),
          imc: imcCalculado,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Atendimento histórico atualizado com sucesso!",
      evolucao: dataAtualizada,
      historico: historicoAtualizado,
    });
  } catch (error: any) {
    console.error("[EVOLUCAO/[ID]/PUT] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar atendimento histórico.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pacientes/[id]/prontuario/evolucoes/[evolucaoId]
 * Exclui um atendimento histórico específico.
 * Acesso Restrito: DONO_CLINICA e ADMINISTRADOR.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id, evolucaoId } = await params;
    const sessao = await getSessao();

    // Validação estrita de exclusão (apenas Dono da Clínica e Administrador)
    if (sessao && !podeExcluirPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Apenas o Dono da Clínica e o Administrador possuem permissão para excluir registros históricos." },
        { status: 403 }
      );
    }

    const evolucaoExistente = await prisma.evolucaoClinica.findUnique({
      where: { id: evolucaoId },
    });

    if (!evolucaoExistente || evolucaoExistente.pacienteId !== id) {
      return NextResponse.json(
        { error: "Registro de atendimento não encontrado." },
        { status: 404 }
      );
    }

    await prisma.evolucaoClinica.delete({
      where: { id: evolucaoId },
    });

    // Retorna a lista atualizada
    const historicoAtualizado = await prisma.evolucaoClinica.findMany({
      where: { pacienteId: id },
      orderBy: { dataAtendimento: "desc" },
    });

    return NextResponse.json({
      success: true,
      message: "Atendimento histórico excluído com sucesso!",
      historico: historicoAtualizado,
    });
  } catch (error: any) {
    console.error("[EVOLUCAO/[ID]/DELETE] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao excluir atendimento histórico.", details: error?.message },
      { status: 500 }
    );
  }
}
