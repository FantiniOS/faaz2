import { NextRequest, NextResponse } from "next/server";
import { IsNull } from "typeorm";
import { getRepository } from "@/lib/db/data-source";
import { PatientEntity, ProntuarioPacienteEntity } from "@/lib/db/entities";
import { DEFAULT_CLINICAL_OBJECTIVE } from "@/lib/clinical-objectives";
import { resolverObjetivoAtivo } from "@/lib/objetivo-clinico";
import { resolverMedicoResponsavel } from "@/lib/medico-responsavel";
import { toIsoUtc } from "@/lib/date-br";
import { VERSAO_ATUAL_TERMOS } from "@/lib/termos-privacidade";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawCpf = body?.cpf ? String(body.cpf).trim() : "";

    // Higieniza o CPF para considerar apenas dígitos numéricos
    const cleanCpf = rawCpf.replace(/\D/g, "");

    if (!cleanCpf) {
      return NextResponse.json(
        {
          sucesso: false,
          error: "O CPF do paciente é obrigatório para autenticação.",
        },
        { status: 400 },
      );
    }

    const patientRepo = await getRepository(PatientEntity);

    // Busca o paciente no banco de dados da Clínica FAAZ
    // Busca por dígitos limpos ou pelo valor com pontuação
    const paciente = await patientRepo.findOne({
      where: [
        { cpf: cleanCpf, deletedAt: IsNull() },
        { cpf: rawCpf, deletedAt: IsNull() },
      ],
      relations: { primaryDoctor: true },
    });

    if (!paciente) {
      return NextResponse.json(
        {
          sucesso: false,
          error:
            "Paciente não cadastrado na Clínica FAAZ. Verifique o CPF digitado ou procure a recepção.",
        },
        { status: 404 },
      );
    }

    if (paciente.patientStatus !== "ACTIVE") {
      return NextResponse.json(
        {
          sucesso: false,
          error:
            "Prontuário inativo ou suspenso. Entre em contato com a equipe médica.",
        },
        { status: 403 },
      );
    }

    const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
    const prontuario = await prontuarioRepo.findOne({
      where: { pacienteId: paciente.id },
      select: { id: true, medicacoes: true, objetivo: true },
    });
    const medicoResolvido = await resolverMedicoResponsavel(paciente.id, {
      primaryDoctorId: paciente.primaryDoctorId,
      organizationId: paciente.organizationId,
    });
    const medicacoes = prontuario?.medicacoes?.trim() || null;
    const objetivoUnificado =
      resolverObjetivoAtivo(
        paciente.treatmentObjective,
        paciente.clinicalFocus,
        prontuario?.objetivo,
      ) || DEFAULT_CLINICAL_OBJECTIVE;

    // Retorna os dados do paciente para salvar no estado global do app mobile
    return NextResponse.json(
      {
        sucesso: true,
        message: `Bem-vindo(a) à Clínica FAAZ, ${paciente.fullName}!`,
        paciente: {
          id: paciente.id,
          nome: paciente.fullName,
          socialName: paciente.socialName,
          cpf: paciente.cpf,
          metaDiariaMl: paciente.metaDiariaMl || 2500,
          recordCode: paciente.recordCode,
          medicoResponsavel: medicoResolvido?.nome || null,
          especialidadeMedico: medicoResolvido?.especialidade || null,
          crmMedico: medicoResolvido?.crm || null,
          medicoResponsavelDetalhes: medicoResolvido,
          focoClinico: objetivoUnificado,
          treatmentObjective: objetivoUnificado,
          medicacoes,
          avatarUrl: paciente.avatarUrl || paciente.photoUrl || null,
          termosVersaoAceita: paciente.termosVersaoAceita ?? null,
          termosAceitoEm: toIsoUtc(paciente.termosAceitoEm),
          versaoAtualTermos: VERSAO_ATUAL_TERMOS,
        },
        versaoAtualTermos: VERSAO_ATUAL_TERMOS,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[API_AUTH_PACIENTE_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        sucesso: false,
        error: "Erro interno no servidor ao autenticar paciente.",
        details,
      },
      { status: 500 },
    );
  }
}
