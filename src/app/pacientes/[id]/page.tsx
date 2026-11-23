export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getRepository } from "@/lib/db/data-source";
import {
  CheckInSonoEntity,
  PatientEntity,
  ProntuarioPacienteEntity,
} from "@/lib/db/entities";
import { getSessao } from "@/lib/auth-session";
import { podeAcessarDadosClinicos } from "@/lib/auth-rbac";
import { PacienteProntuarioView } from "./PacienteProntuarioView";

interface PacienteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PacienteDetailPage(
  props: PacienteDetailPageProps,
) {
  const sessao = await getSessao();
  if (!sessao) {
    redirect("/login");
  }
  if (!podeAcessarDadosClinicos(sessao.cargo)) {
    redirect("/dashboard/pacientes?erro=acesso_negado_clinico");
  }

  const { id } = await props.params;

  const patientRepo = await getRepository(PatientEntity);
  const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
  const sonoRepo = await getRepository(CheckInSonoEntity);

  const paciente = await patientRepo.findOne({
    where: { id },
  });

  if (!paciente || paciente.deletedAt) {
    notFound();
  }

  const [prontuario, ultimoRegistroSono] = await Promise.all([
    prontuarioRepo.findOne({ where: { pacienteId: id } }),
    sonoRepo.findOne({
      where: { pacienteId: id },
      order: { data: "DESC" },
    }),
  ]);

  return (
    <PacienteProntuarioView
      paciente={{
        id: paciente.id,
        nome: paciente.fullName,
        recordCode: paciente.recordCode,
        cpf: paciente.cpf || "",
        status: paciente.patientStatus,
        pesoAtual:
          prontuario?.pesoAtualKg != null
            ? Number(prontuario.pesoAtualKg)
            : null,
        alturaCm:
          prontuario?.alturaCm != null ? Number(prontuario.alturaCm) : null,
        metaDiariaMl: paciente.metaDiariaMl,
        planoFaaz: paciente.planoFaaz,
        avatarUrl: paciente.avatarUrl || paciente.photoUrl || null,
        treatmentObjective:
          paciente.treatmentObjective || paciente.clinicalFocus || null,
      }}
      ultimoSono={
        ultimoRegistroSono
          ? {
              id: ultimoRegistroSono.id,
              horas: ultimoRegistroSono.horas,
              qualidade: ultimoRegistroSono.qualidade,
              observacao: ultimoRegistroSono.observacao,
              data: new Date(ultimoRegistroSono.data).toISOString(),
            }
          : null
      }
    />
  );
}
