export const dynamic = "force-dynamic";

import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PacienteProntuarioView } from "./PacienteProntuarioView";

interface PacienteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PacienteDetailPage(props: PacienteDetailPageProps) {
  const { id } = await props.params;

  const paciente = await prisma.patient.findUnique({
    where: { id },
    include: {
      prontuario: true,
    },
  });

  if (!paciente || paciente.deletedAt) {
    notFound();
  }

  // 4. Query no banco buscando o último registro de sono EXCLUSIVO deste paciente
  const ultimoRegistroSono = await prisma.checkInSono.findFirst({
    where: { pacienteId: id },
    orderBy: { data: "desc" },
  });

  return (
    <PacienteProntuarioView
      paciente={{
        id: paciente.id,
        nome: paciente.fullName,
        recordCode: paciente.recordCode,
        cpf: paciente.cpf || "",
        status: paciente.patientStatus,
        pesoAtual: paciente.prontuario?.pesoAtualKg
          ? Number(paciente.prontuario.pesoAtualKg)
          : null,
        alturaCm: paciente.prontuario?.alturaCm
          ? Number(paciente.prontuario.alturaCm)
          : null,
        metaDiariaMl: paciente.metaDiariaMl,
        planoFaaz: paciente.planoFaaz,
        avatarUrl: paciente.avatarUrl || paciente.photoUrl || null,
        treatmentObjective: paciente.treatmentObjective || paciente.clinicalFocus || null,
      }}
      ultimoSono={
        ultimoRegistroSono
          ? {
              id: ultimoRegistroSono.id,
              horas: ultimoRegistroSono.horas,
              qualidade: ultimoRegistroSono.qualidade,
              observacao: ultimoRegistroSono.observacao,
              data: ultimoRegistroSono.data.toISOString(),
            }
          : null
      }
    />
  );
}
