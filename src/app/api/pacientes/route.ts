import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessao } from "@/lib/auth-session";
import { podeCadastrarPacientes, podeExcluirPacientes } from "@/lib/auth-rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/pacientes — Lista pacientes cadastrados na clínica
 */
export async function GET() {
  try {
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado. Perfil sem permissão para listar pacientes." },
        { status: 403 }
      );
    }

    let orgId = sessao?.organizationId;
    if (!orgId) {
      const org = await prisma.organization.findFirst();
      orgId = org?.id;
    }

    const pacientes = await prisma.patient.findMany({
      where: {
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      select: {
        id: true,
        recordCode: true,
        fullName: true,
        cpf: true,
        rg: true,
        birthDate: true,
        biologicalSex: true,
        estadoCivil: true,
        profissao: true,
        convenio: true,
        planoFaaz: true,
        patientStatus: true,
        phoneWhatsapp: true,
        telefoneSecundario: true,
        email: true,
        contatoEmergenciaNome: true,
        contatoEmergenciaTelefone: true,
        zipCode: true,
        street: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        metaDiariaMl: true,
        avatarUrl: true,
        photoUrl: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { fullName: "asc" },
    });

    // Mapeamento normalizado para a interface em português
    const formatados = pacientes.map((p) => ({
      id: p.id,
      recordCode: p.recordCode,
      nome: p.fullName,
      cpf: p.cpf || "",
      rg: p.rg || "",
      dataNascimento: p.birthDate ? p.birthDate.toISOString().split("T")[0] : "",
      sexo: p.biologicalSex || "OTHER",
      estadoCivil: p.estadoCivil || "Solteiro(a)",
      profissao: p.profissao || "",
      convenio: p.convenio || "Particular",
      planoFaaz: Boolean(p.planoFaaz),
      status: p.patientStatus === "ACTIVE" ? "Ativo" : "Inativo",
      telefoneWhatsapp: p.phoneWhatsapp || "",
      telefoneSecundario: p.telefoneSecundario || "",
      email: p.email || "",
      contatoEmergenciaNome: p.contatoEmergenciaNome || "",
      contatoEmergenciaTelefone: p.contatoEmergenciaTelefone || "",
      cep: p.zipCode || "",
      logradouro: p.street || "",
      numero: p.number || "",
      complemento: p.complement || "",
      bairro: p.neighborhood || "",
      cidade: p.city || "",
      estado: p.state || "",
      metaHidricaMl: p.metaDiariaMl || 2500,
      avatarUrl: p.avatarUrl || p.photoUrl || null,
      criadoEm: p.createdAt,
    }));

    return NextResponse.json({ pacientes: formatados });
  } catch (error: any) {
    console.error("[PACIENTES/GET] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao listar pacientes.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pacientes — Cadastrar novo paciente ou atualizar se vier com ID
 */
export async function POST(request: Request) {
  try {
    const sessao = await getSessao();
    if (sessao && !podeCadastrarPacientes(sessao.cargo)) {
      return NextResponse.json(
        { error: "Acesso negado para cadastro de pacientes." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id,
      nome,
      cpf,
      rg,
      dataNascimento,
      sexo,
      estadoCivil,
      profissao,
      convenio,
      planoFaaz,
      status,
      telefoneWhatsapp,
      telefoneSecundario,
      email,
      contatoEmergenciaNome,
      contatoEmergenciaTelefone,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      metaHidricaMl,
    } = body;

    if (!nome?.trim() || !telefoneWhatsapp?.trim()) {
      return NextResponse.json(
        { error: "Nome completo e WhatsApp são obrigatórios." },
        { status: 400 }
      );
    }

    let orgId = sessao?.organizationId;
    if (!orgId) {
      const org = await prisma.organization.findFirst();
      orgId = org?.id;
    }

    const cleanCpf = cpf ? String(cpf).replace(/\D/g, "") : null;

    // Se já tiver ID, atualiza o paciente existente
    if (id) {
      const pacienteAtualizado = await prisma.patient.update({
        where: { id },
        data: {
          fullName: nome.trim().toUpperCase(),
          cpf: cleanCpf,
          rg: rg ? String(rg).trim().toUpperCase() : null,
          birthDate: dataNascimento ? new Date(dataNascimento) : null,
          biologicalSex:
            sexo === "Masculino" || sexo === "MALE"
              ? "MALE"
              : sexo === "Feminino" || sexo === "FEMALE"
              ? "FEMALE"
              : "OTHER",
          estadoCivil: estadoCivil || null,
          profissao: profissao ? String(profissao).trim().toUpperCase() : null,
          convenio: convenio || "Particular",
          planoFaaz:
            planoFaaz !== undefined
              ? Boolean(planoFaaz)
              : convenio === "Plano FAAZ",
          patientStatus: status === "Inativo" ? "INACTIVE" : "ACTIVE",
          phoneWhatsapp: telefoneWhatsapp.trim(),
          telefoneSecundario: telefoneSecundario || null,
          email: email ? String(email).trim() : null, // E-mail mantido em minúsculo
          contatoEmergenciaNome: contatoEmergenciaNome ? String(contatoEmergenciaNome).trim().toUpperCase() : null,
          contatoEmergenciaTelefone: contatoEmergenciaTelefone || null,
          zipCode: cep || null,
          street: logradouro ? String(logradouro).trim().toUpperCase() : null,
          number: numero ? String(numero).trim().toUpperCase() : null,
          complement: complemento ? String(complemento).trim().toUpperCase() : null,
          neighborhood: bairro ? String(bairro).trim().toUpperCase() : null,
          city: cidade ? String(cidade).trim().toUpperCase() : null,
          state: estado ? String(estado).trim().toUpperCase() : null,
          metaDiariaMl: metaHidricaMl ? parseInt(metaHidricaMl) : 2500,
        },
      });

      return NextResponse.json(
        { sucesso: true, mensagem: "Paciente atualizado com sucesso!", paciente: pacienteAtualizado },
        { status: 200 }
      );
    }

    // Gerar código único de prontuário FAAZ-XXXXX
    const totalPacientes = await prisma.patient.count({
      where: { organizationId: orgId },
    });
    const recordCode = `FAAZ-${String(totalPacientes + 1).padStart(5, "0")}`;

    const novoPaciente = await prisma.patient.create({
      data: {
        organizationId: orgId!,
        recordCode,
        fullName: nome.trim().toUpperCase(),
        cpf: cleanCpf,
        rg: rg ? String(rg).trim().toUpperCase() : null,
        birthDate: dataNascimento ? new Date(dataNascimento) : null,
        biologicalSex:
          sexo === "Masculino" || sexo === "MALE"
            ? "MALE"
            : sexo === "Feminino" || sexo === "FEMALE"
            ? "FEMALE"
            : "OTHER",
        estadoCivil: estadoCivil || null,
        profissao: profissao ? String(profissao).trim().toUpperCase() : null,
        convenio: convenio || "Particular",
        planoFaaz:
          planoFaaz !== undefined
            ? Boolean(planoFaaz)
            : convenio === "Plano FAAZ",
        patientStatus: status === "Inativo" ? "INACTIVE" : "ACTIVE",
        phoneWhatsapp: telefoneWhatsapp.trim(),
        telefoneSecundario: telefoneSecundario || null,
        email: email ? String(email).trim() : null, // E-mail mantido em minúsculo
        contatoEmergenciaNome: contatoEmergenciaNome ? String(contatoEmergenciaNome).trim().toUpperCase() : null,
        contatoEmergenciaTelefone: contatoEmergenciaTelefone || null,
        zipCode: cep || null,
        street: logradouro ? String(logradouro).trim().toUpperCase() : null,
        number: numero ? String(numero).trim().toUpperCase() : null,
        complement: complemento ? String(complemento).trim().toUpperCase() : null,
        neighborhood: bairro ? String(bairro).trim().toUpperCase() : null,
        city: cidade ? String(cidade).trim().toUpperCase() : null,
        state: estado ? String(estado).trim().toUpperCase() : null,
        metaDiariaMl: metaHidricaMl ? parseInt(metaHidricaMl) : 2500,
        createdBy: sessao?.userId || null,
      },
    });

    return NextResponse.json(
      { sucesso: true, mensagem: "Paciente cadastrado com sucesso!", paciente: novoPaciente },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[PACIENTES/POST] Erro:", error);
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "CPF já cadastrado na Clínica FAAZ." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Erro ao cadastrar paciente.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/pacientes — Atualização cadastral
 */
export async function PUT(request: Request) {
  return POST(request);
}

/**
 * DELETE /api/pacientes?id=... — Excluir paciente
 * Somente DONO_CLINICA ou ADMINISTRADOR
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID do paciente é obrigatório." }, { status: 400 });
    }

    const sessao = await getSessao();
    if (!sessao || !podeExcluirPacientes(sessao.cargo)) {
      return NextResponse.json(
        {
          error: "Apenas o Dono da Clínica ou Administrador podem excluir pacientes.",
          cargoAtual: sessao?.cargo || "NÃO_AUTENTICADO",
        },
        { status: 403 }
      );
    }

    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, cpf: true, recordCode: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
    }

    const idsVinculados = [paciente.id];
    if (paciente.cpf) idsVinculados.push(paciente.cpf, paciente.cpf.replace(/\D/g, ""));
    if (paciente.recordCode) idsVinculados.push(paciente.recordCode);

    await prisma.$transaction([
      prisma.checkinIntestinal.deleteMany({
        where: { pacienteId: { in: idsVinculados } },
      }),
      prisma.checkinHidratacao.deleteMany({
        where: { pacienteId: { in: idsVinculados } },
      }),
      prisma.patient.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({
      sucesso: true,
      mensagem: `Paciente '${paciente.fullName}' excluído com sucesso!`,
    });
  } catch (error: any) {
    console.error("[PACIENTES/DELETE] Erro:", error);
    return NextResponse.json({ error: "Erro ao excluir paciente.", details: error?.message }, { status: 500 });
  }
}
