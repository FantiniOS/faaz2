import { NextRequest, NextResponse } from "next/server";
import { Between, In, Not } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { AgendamentoEntity } from "@/lib/db/entities";
import { criarDataBR, formatarHoraBR, getDataDiaBR, getInicioFimDiaBR } from "@/lib/date-br";

const TIPOS_VALIDOS = ["PRIMEIRA_CONSULTA", "RETORNO", "EXAME"] as const;
const STATUS_VALIDOS = [
  "AGENDADO",
  "CONFIRMADO",
  "CANCELADO",
  "FINALIZADO",
] as const;
const ESPECIALIDADES_VALIDAS = [
  "ENDOCRINOLOGIA",
  "CIRURGIA_PLASTICA",
] as const;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const agendamentoRepo = await getRepository(AgendamentoEntity);
    const existente = await agendamentoRepo.findOne({
      where: { id },
    });

    if (!existente) {
      return NextResponse.json(
        { success: false, error: "Agendamento não encontrado." },
        { status: 404 },
      );
    }

    const dataUpdate: {
      pacienteId?: string;
      medicoId?: string;
      especialidade?: string;
      dataHora?: Date;
      duracaoMinutos?: number;
      encaixe?: boolean;
      tipo?: string;
      status?: string;
      observacao?: string | null;
    } = {};

    if (body.pacienteId) {
      dataUpdate.pacienteId = String(body.pacienteId);
    }

    if (body.medicoId) {
      dataUpdate.medicoId = String(body.medicoId);
    }

    if (body.especialidade) {
      const esp = String(body.especialidade).toUpperCase();
      if ((ESPECIALIDADES_VALIDAS as readonly string[]).includes(esp)) {
        dataUpdate.especialidade = esp;
      }
    }

    if (body.encaixe !== undefined) {
      dataUpdate.encaixe = Boolean(body.encaixe);
    }

    if (body.duracaoMinutos !== undefined) {
      const dm = Number(body.duracaoMinutos);
      if (!isNaN(dm) && dm >= 10 && dm <= 240) {
        dataUpdate.duracaoMinutos = Math.round(dm);
      }
    }

    if (body.dataHora) {
      const dt = new Date(body.dataHora);
      if (!isNaN(dt.getTime())) {
        dataUpdate.dataHora = dt;
      }
    } else if (body.data && body.horario) {
      const dt = criarDataBR(String(body.data), String(body.horario));
      if (!isNaN(dt.getTime())) {
        dataUpdate.dataHora = dt;
      }
    }

    if (body.tipo) {
      const t = String(body.tipo).toUpperCase();
      if ((TIPOS_VALIDOS as readonly string[]).includes(t)) {
        dataUpdate.tipo = t;
      }
    }

    if (body.status) {
      const s = String(body.status).toUpperCase();
      if ((STATUS_VALIDOS as readonly string[]).includes(s)) {
        dataUpdate.status = s;
      }
    }

    if (body.observacao !== undefined) {
      dataUpdate.observacao = body.observacao
        ? String(body.observacao).trim()
        : null;
    }

    // Validação de conflito ao reagendar ou restaurar um cancelado:
    // agendamentos com status CANCELADO ou FALTOU NUNCA bloqueiam o horário.
    const statusFinal = (dataUpdate.status ?? existente.status).toUpperCase();
    const encaixeFinal =
      dataUpdate.encaixe !== undefined
        ? Boolean(dataUpdate.encaixe)
        : Boolean(existente.encaixe);
    const medicoFinal = dataUpdate.medicoId ?? existente.medicoId;
    const dataHoraFinal = dataUpdate.dataHora ?? new Date(existente.dataHora);
    const duracaoFinal =
      dataUpdate.duracaoMinutos ?? (Number(existente.duracaoMinutos) || 30);

    const estavaInativo =
      existente.status === "CANCELADO" || existente.status === "FALTOU";
    const mudouHorarioOuMedico =
      dataUpdate.dataHora !== undefined ||
      dataUpdate.medicoId !== undefined ||
      dataUpdate.duracaoMinutos !== undefined;
    const ficouAtivo =
      statusFinal === "AGENDADO" || statusFinal === "CONFIRMADO";

    if (!encaixeFinal && ficouAtivo && (estavaInativo || mudouHorarioOuMedico)) {
      const faixaDia = getInicioFimDiaBR(dataHoraFinal);
      const outrosDoDia = await agendamentoRepo.find({
        where: {
          id: Not(id),
          medicoId: medicoFinal,
          dataHora: Between(faixaDia.inicioUtc, faixaDia.fimUtc),
          status: Not(In(["CANCELADO", "FALTOU"])),
        },
        select: {
          id: true,
          dataHora: true,
          duracaoMinutos: true,
        },
      });

      const inicioMs = dataHoraFinal.getTime();
      const fimMs = inicioMs + duracaoFinal * 60_000;

      const conflito = outrosDoDia.find((ag) => {
        const agInicioMs = new Date(ag.dataHora).getTime();
        const agFimMs = agInicioMs + (Number(ag.duracaoMinutos) || 30) * 60_000;
        return agInicioMs < fimMs && agFimMs > inicioMs;
      });

      if (conflito) {
        const horaConflito = formatarHoraBR(new Date(conflito.dataHora));
        const diaConflito = getDataDiaBR(new Date(conflito.dataHora))
          .split("-")
          .reverse()
          .join("/");
        return NextResponse.json(
          {
            success: false,
            error: estavaInativo
              ? `O horário ${horaConflito} (${diaConflito}) já foi ocupado por outro paciente. Use "Reagendar" para escolher um novo horário.`
              : `Já existe uma consulta ativa para este médico às ${horaConflito}. Marque "Encaixe" para sobrepor.`,
          },
          { status: 409 },
        );
      }
    }

    await agendamentoRepo.update({ id }, dataUpdate);

    const atualizado = await agendamentoRepo.findOne({
      where: { id },
      relations: {
        paciente: true,
        medico: true,
      },
      select: {
        id: true,
        pacienteId: true,
        medicoId: true,
        especialidade: true,
        dataHora: true,
        duracaoMinutos: true,
        encaixe: true,
        tipo: true,
        status: true,
        observacao: true,
        createdAt: true,
        updatedAt: true,
        paciente: {
          id: true,
          recordCode: true,
          fullName: true,
          cpf: true,
          phoneWhatsapp: true,
          convenio: true,
        },
      },
    });

    return NextResponse.json({
      success: true,
      agendamento: atualizado,
    });
  } catch (error) {
    console.error("[PATCH /api/agendamentos/[id]] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao atualizar agendamento." },
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

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const agendamentoRepo = await getRepository(AgendamentoEntity);
    await agendamentoRepo.delete({ id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/agendamentos/[id]] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao remover agendamento." },
      { status: 500 },
    );
  }
}
