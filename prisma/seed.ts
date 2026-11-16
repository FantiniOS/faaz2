import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { carregarTabelaTaco } from "./seed-taco";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Semeando dados iniciais da Clínica FAAZ...");

  // 1. Organização Clínica FAAZ
  const org = await prisma.organization.upsert({
    where: { slug: "clinica-faaz" },
    update: {},
    create: {
      slug: "clinica-faaz",
      tradeName: "Clínica FAAZ",
      legalName: "Clínica FAAZ Medicina & Saúde Integrativa Ltda",
      taxId: "12345678000190",
      primaryColorHex: "#0f766e",
    },
  });

  console.log(`✅ Organização criada/encontrada: ${org.tradeName} (${org.id})`);

  const passwordHash = await bcrypt.hash("faaz123", 10);

  // 2. Usuário 1: Dono da Clínica - Dr. Carlos Fantini
  let drCarlos = await prisma.user.findFirst({
    where: { OR: [{ username: "carlos.fantini" }, { email: "carlos.fantini@clinicafaaz.com.br" }] },
  });

  if (drCarlos) {
    drCarlos = await prisma.user.update({
      where: { id: drCarlos.id },
      data: {
        username: "carlos.fantini",
        cargo: "DONO_CLINICA",
        role: "CLINIC_ADMIN",
        podeAcessarProntuario: true,
        accountStatus: "ACTIVE",
      },
    });
  } else {
    drCarlos = await prisma.user.create({
      data: {
        organizationId: org.id,
        fullName: "Dr. Carlos Fantini",
        username: "carlos.fantini",
        email: "carlos.fantini@clinicafaaz.com.br",
        passwordHash,
        role: "CLINIC_ADMIN",
        cargo: "DONO_CLINICA",
        podeAcessarProntuario: true,
        isClinical: true,
        specialty: "Endocrinologia & Nutrologia",
        councilType: "CRM",
        councilNumber: "45678/SP",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
      },
    });
  }
  console.log(`✅ Dono da Clínica: ${drCarlos.fullName} (${drCarlos.cargo})`);

  // 3. Usuário 2: Médico Parceiro - Dr. Rodrigo Mendes
  const drRodrigo = await prisma.user.upsert({
    where: { username: "rodrigo.mendes" },
    update: {
      cargo: "MEDICO",
      role: "DOCTOR",
      podeAcessarProntuario: true,
      accountStatus: "ACTIVE",
    },
    create: {
      organizationId: org.id,
      fullName: "Dr. Rodrigo Mendes",
      username: "rodrigo.mendes",
      email: "medico.parceiro@clinicafaaz.com.br",
      passwordHash,
      role: "DOCTOR",
      cargo: "MEDICO",
      podeAcessarProntuario: true,
      isClinical: true,
      specialty: "Nutrologia & Medicina Funcional",
      councilType: "CRM",
      councilNumber: "89123/SP",
      accountStatus: "ACTIVE",
      mustChangePassword: false,
    },
  });
  console.log(`✅ Médico Parceiro: ${drRodrigo.fullName} (${drRodrigo.cargo})`);

  // 4. Usuário 3: Secretária - Patrícia Santos
  const secretaria = await prisma.user.upsert({
    where: { username: "patricia.santos" },
    update: {
      cargo: "SECRETARIA",
      role: "RECEPTIONIST",
      podeAcessarProntuario: false,
      accountStatus: "ACTIVE",
    },
    create: {
      organizationId: org.id,
      fullName: "Patrícia Santos",
      username: "patricia.santos",
      email: "secretaria@clinicafaaz.com.br",
      passwordHash,
      role: "RECEPTIONIST",
      cargo: "SECRETARIA",
      podeAcessarProntuario: false,
      isClinical: false,
      specialty: "Recepção & Agendamentos",
      accountStatus: "ACTIVE",
      mustChangePassword: false,
    },
  });
  console.log(`✅ Secretária: ${secretaria.fullName} (${secretaria.cargo})`);

  // 5. Usuário 4: Administrador - Eduardo Lima
  const administrador = await prisma.user.upsert({
    where: { username: "eduardo.lima" },
    update: {
      cargo: "ADMINISTRADOR",
      role: "ADMIN",
      podeAcessarProntuario: false,
      accountStatus: "ACTIVE",
    },
    create: {
      organizationId: org.id,
      fullName: "Eduardo Lima",
      username: "eduardo.lima",
      email: "admin@clinicafaaz.com.br",
      passwordHash,
      role: "ADMIN",
      cargo: "ADMINISTRADOR",
      podeAcessarProntuario: false,
      isClinical: false,
      specialty: "Gestão Financeira & RH",
      accountStatus: "ACTIVE",
      mustChangePassword: false,
    },
  });
  console.log(`✅ Administrador: ${administrador.fullName} (${administrador.cargo})`);

  // 6. Pacientes de Teste para o App Mobile
  const p1 = await prisma.patient.upsert({
    where: { recordCode: "FAAZ-00001" },
    update: {
      cpf: "11122233344",
      birthDate: new Date("1976-05-18"),
      biologicalSex: "MALE",
      convenio: "Particular",
      heightCm: 178,
      metaDiariaMl: 2500,
    },
    create: {
      organizationId: org.id,
      recordCode: "FAAZ-00001",
      fullName: "Carlos Eduardo Fantini",
      cpf: "11122233344",
      birthDate: new Date("1976-05-18"),
      biologicalSex: "MALE",
      convenio: "Particular",
      heightCm: 178,
      phoneWhatsapp: "(31) 98888-0001",
      email: "carlos.paciente@gmail.com",
      metaDiariaMl: 2500,
      primaryDoctorId: drCarlos.id,
      patientStatus: "ACTIVE",
      clinicalFocus: "Emagrecimento & Longevidade Saudável",
    },
  });

  const p2 = await prisma.patient.upsert({
    where: { recordCode: "FAAZ-00002" },
    update: {
      cpf: "22233344455",
      birthDate: new Date("1991-08-24"),
      biologicalSex: "FEMALE",
      convenio: "Plano FAAZ",
      heightCm: 164,
      metaDiariaMl: 3000,
    },
    create: {
      organizationId: org.id,
      recordCode: "FAAZ-00002",
      fullName: "Maria Luiza Silva",
      cpf: "22233344455",
      birthDate: new Date("1991-08-24"),
      biologicalSex: "FEMALE",
      convenio: "Plano FAAZ",
      heightCm: 164,
      phoneWhatsapp: "(31) 98888-0002",
      email: "marialuiza@gmail.com",
      metaDiariaMl: 3000,
      primaryDoctorId: drCarlos.id,
      patientStatus: "ACTIVE",
      clinicalFocus: "Saúde Intestinal & Modulação Hormonal",
    },
  });

  console.log(`✅ Paciente 1: ${p1.fullName} - CPF: ${p1.cpf} - Meta: ${p1.metaDiariaMl}ml (ID: ${p1.id})`);
  console.log(`✅ Paciente 2: ${p2.fullName} - CPF: ${p2.cpf} - Meta: ${p2.metaDiariaMl}ml (ID: ${p2.id})`);

  // 7. Prontuários Iniciais (Ficha Clínica Digital FAAZ)
  await prisma.prontuarioPaciente.upsert({
    where: { pacienteId: p1.id },
    update: {},
    create: {
      pacienteId: p1.id,
      pesoAtualKg: 84.5,
      alturaCm: 178.0,
      imc: 26.67,
      objetivo: "Emagrecimento com preservação de massa magra e otimização metabólica.",
      comorbidades: "Resistência insulínica leve, histórico familiar de DM2.",
      alergias: "Dipirona e Frutos do mar.",
      medicacoes: "Metformina 500mg (1x ao dia), Creatina 5g/dia, Vitamina D3 2000 UI.",
      evolucao: "Paciente refere melhora na disposição matinal e aumento no consumo hídrico diário. Aderindo bem ao protocolo de hidratação e acompanhando ritmo intestinal pelo App Mobile FAAZ. Exames laboratoriais solicitados: Glicemia de jejum, HbA1c e Perfil Lipídico.",
    },
  });

  await prisma.prontuarioPaciente.upsert({
    where: { pacienteId: p2.id },
    update: {},
    create: {
      pacienteId: p2.id,
      pesoAtualKg: 62.0,
      alturaCm: 164.0,
      imc: 23.05,
      objetivo: "Modulação da microbiota intestinal, redução de estufamento pós-prandial e controle de SOP.",
      comorbidades: "Síndrome dos Ovários Policísticos (SOP), constipação intestinal funcional.",
      alergias: "Lactose (intolerância moderada).",
      medicacoes: "Inositol 2g/dia, Probióticos multiespécies, Ômega 3 1000mg.",
      evolucao: "Paciente comparece para retorno clínico. Relata melhora após inclusão de fibras solúveis na dieta. Registros de Bristol no app demonstram transição para Tipo 4 na maioria dos dias. Manter plano atual e reavaliar em 30 dias.",
    },
  });

  console.log("✅ Prontuários clínicos iniciais semeados com sucesso!");

  // 8. Histórico Clínico Inicial (Linha do Tempo de Atendimentos)
  const countHist = await prisma.evolucaoClinica.count({ where: { pacienteId: p1.id } });
  if (countHist === 0) {
    const dataPassada = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    await prisma.evolucaoClinica.create({
      data: {
        pacienteId: p1.id,
        dataAtendimento: dataPassada,
        pesoAtual: 86.2,
        alturaCm: 178.0,
        imc: 27.21,
        queixaPrincipal: "Fadiga vespertina, ganho ponderal e queixas de constipação leve.",
        condutaEvolucao: "Primeira consulta clínica. Solicitado painel metabólico completo (glicemia, HbA1c, insulina de jejum, lipidograma e TSH). Orientada meta hídrica de 2500ml/dia com registros no App Mobile FAAZ. Prescrita suplementação básica de Creatina 5g e Vitamina D3.",
        medicoResponsavel: "Dr. Carlos Fantini",
      },
    });

    const dataHoje = new Date();
    await prisma.evolucaoClinica.create({
      data: {
        pacienteId: p1.id,
        dataAtendimento: dataHoje,
        pesoAtual: 84.5,
        alturaCm: 178.0,
        imc: 26.67,
        queixaPrincipal: "Retorno para avaliação de exames laboratoriais e aderência hídrica.",
        condutaEvolucao: "Paciente refere redução de 1.7kg no período com aumento significativo de energia. Aderência de 85% à hidratação diária pelo app. Bristol regularizado para Tipo 4. Iniciada metformina 500mg em dose noturna para otimização da sensibilidade insulínica. Retorno em 45 dias.",
        medicoResponsavel: "Dr. Carlos Fantini",
      },
    });
  }

  const countHistP2 = await prisma.evolucaoClinica.count({ where: { pacienteId: p2.id } });
  if (countHistP2 === 0) {
    await prisma.evolucaoClinica.create({
      data: {
        pacienteId: p2.id,
        dataAtendimento: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        pesoAtual: 62.0,
        alturaCm: 164.0,
        imc: 23.05,
        queixaPrincipal: "Estufamento abdominal crônico e irregularidade menstrual associada à SOP.",
        condutaEvolucao: "Consulta inicial de nutrologia integrativa. Plano de modulação da microbiota instituído com probióticos e inositol 2g/dia. Orientada monitorização contínua de sintomas e escala de Bristol pelo App Mobile FAAZ.",
        medicoResponsavel: "Dr. Rodrigo Mendes",
      },
    });
  }

  console.log("✅ Histórico clínico e atendimentos semeados com sucesso!");

  // 9. Mega Seed TACO (Carga Massiva de Centenas de Alimentos da UNICAMP)
  await carregarTabelaTaco();

  const alimentosBase = [
    {
      nome: "Arroz Branco Cozido",
      categoria: "Cereais & Grãos",
      porcaoBase: 100,
      calorias: 128,
      proteinas: 2.5,
      carboidratos: 28.1,
      gorduras: 0.2,
    },
    {
      nome: "Feijão Carioca Cozido",
      categoria: "Leguminosas",
      porcaoBase: 100,
      calorias: 76,
      proteinas: 4.8,
      carboidratos: 13.6,
      gorduras: 0.5,
    },
    {
      nome: "Ovo de Galinha Cozido",
      categoria: "Ovos",
      porcaoBase: 100,
      calorias: 146,
      proteinas: 13.3,
      carboidratos: 0.6,
      gorduras: 9.5,
    },
    {
      nome: "Peito de Frango Grelhado",
      categoria: "Carnes & Aves",
      porcaoBase: 100,
      calorias: 159,
      proteinas: 32.0,
      carboidratos: 0.0,
      gorduras: 2.5,
    },
    {
      nome: "Maçã Fuji com Casca",
      categoria: "Frutas",
      porcaoBase: 100,
      calorias: 56,
      proteinas: 0.3,
      carboidratos: 15.2,
      gorduras: 0.2,
    },
    {
      nome: "Aveia em Flocos",
      categoria: "Cereais & Grãos",
      porcaoBase: 100,
      calorias: 394,
      proteinas: 13.9,
      carboidratos: 66.6,
      gorduras: 8.5,
    },
    {
      nome: "Banana Prata",
      categoria: "Frutas",
      porcaoBase: 100,
      calorias: 98,
      proteinas: 1.3,
      carboidratos: 26.0,
      gorduras: 0.1,
    },
    {
      nome: "Azeite de Oliva Extra Virgem",
      categoria: "Óleos & Gorduras",
      porcaoBase: 100,
      calorias: 884,
      proteinas: 0.0,
      carboidratos: 0.0,
      gorduras: 100.0,
    },
  ];

  const alimentosMap: Record<string, string> = {};
  for (const a of alimentosBase) {
    const al = await prisma.alimento.upsert({
      where: { nome: a.nome },
      update: a,
      create: a,
    });
    alimentosMap[a.nome] = al.id;
  }
  console.log("✅ Banco de alimentos cadastrado com sucesso!");

  // 10. Plano Alimentar Inicial para Paciente 1 (Carlos Alberto) com Variações de Cardápio
  let planoP1 = await prisma.planoAlimentar.findFirst({
    where: { pacienteId: p1.id, ativo: true },
    include: { variacoes: { include: { refeicoes: { include: { itens: true } } } } },
  });

  if (!planoP1 || planoP1.variacoes.length === 0) {
    if (planoP1) {
      await prisma.planoAlimentar.delete({ where: { id: planoP1.id } });
    }

    planoP1 = await prisma.planoAlimentar.create({
      data: {
        pacienteId: p1.id,
        titulo: "Plano Metabólico & Sensibilidade Insulínica",
        objetivo: "Equilíbrio glicêmico com aporte proteico adequado (1.8g/kg) e fibras solúveis.",
        ativo: true,
        variacoes: {
          create: [
            {
              nome: "Opção 1 (Padrão)",
              descricao: "Cardápio do dia a dia com foco em saciedade e baixo índice glicêmico",
              ordem: 1,
              refeicoes: {
                create: [
                  {
                    nome: "Desjejum / Café da Manhã",
                    horario: "07:30",
                    ordem: 1,
                    observacoes: "Mastigar devagar. Acompanhar com 300ml de água ou chá verde.",
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Ovo de Galinha Cozido"],
                          quantidadeGramas: 100, // 2 ovos
                          observacao: "2 unidades médias cozidas",
                        },
                        {
                          alimentoId: alimentosMap["Aveia em Flocos"],
                          quantidadeGramas: 30,
                          observacao: "Flocos grossos",
                        },
                        {
                          alimentoId: alimentosMap["Maçã Fuji com Casca"],
                          quantidadeGramas: 120,
                          observacao: "1 maçã pequena fatiada",
                        },
                      ],
                    },
                  },
                  {
                    nome: "Almoço",
                    horario: "12:30",
                    ordem: 2,
                    observacoes: "Prato colorido. Incluir folhas verdes escuras à vontade.",
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Arroz Branco Cozido"],
                          quantidadeGramas: 120,
                          observacao: "3 colheres de sopa",
                        },
                        {
                          alimentoId: alimentosMap["Feijão Carioca Cozido"],
                          quantidadeGramas: 100,
                          observacao: "1 concha média",
                        },
                        {
                          alimentoId: alimentosMap["Peito de Frango Grelhado"],
                          quantidadeGramas: 150,
                          observacao: "1 filé grande",
                        },
                        {
                          alimentoId: alimentosMap["Azeite de Oliva Extra Virgem"],
                          quantidadeGramas: 10,
                          observacao: "1 colher de sobremesa sobre as folhas",
                        },
                      ],
                    },
                  },
                  {
                    nome: "Lanche da Tarde",
                    horario: "16:00",
                    ordem: 3,
                    observacoes: "Manter boa hidratação hídrica na janela da tarde.",
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Banana Prata"],
                          quantidadeGramas: 80,
                          observacao: "1 unidade pequena",
                        },
                      ],
                    },
                  },
                  {
                    nome: "Jantar",
                    horario: "19:30",
                    ordem: 4,
                    observacoes: "Refeição leve com foco proteico antes do repouso noturno.",
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Peito de Frango Grelhado"],
                          quantidadeGramas: 150,
                          observacao: "Grelhado com ervas finas",
                        },
                        {
                          alimentoId: alimentosMap["Azeite de Oliva Extra Virgem"],
                          quantidadeGramas: 5,
                          observacao: "Azeite sobre legumes no vapor",
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              nome: "Opção 2 (Variada)",
              descricao: "Alternativa com peixe e tubérculos",
              ordem: 2,
              refeicoes: {
                create: [
                  {
                    nome: "Desjejum / Café da Manhã",
                    horario: "07:30",
                    ordem: 1,
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Ovo de Galinha Cozido"],
                          quantidadeGramas: 100,
                        },
                        {
                          alimentoId: alimentosMap["Banana Prata"],
                          quantidadeGramas: 100,
                        },
                      ],
                    },
                  },
                  {
                    nome: "Almoço",
                    horario: "12:30",
                    ordem: 2,
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Arroz Branco Cozido"],
                          quantidadeGramas: 100,
                        },
                        {
                          alimentoId: alimentosMap["Feijão Carioca Cozido"],
                          quantidadeGramas: 100,
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              nome: "Dia de Treino",
              descricao: "Aporte energético e proteico ampliado para hipertrofia e recuperação",
              ordem: 3,
              refeicoes: {
                create: [
                  {
                    nome: "Café da Manhã Pré-Treino",
                    horario: "07:00",
                    ordem: 1,
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Aveia em Flocos"],
                          quantidadeGramas: 60,
                        },
                        {
                          alimentoId: alimentosMap["Banana Prata"],
                          quantidadeGramas: 100,
                        },
                      ],
                    },
                  },
                  {
                    nome: "Almoço Pós-Treino",
                    horario: "12:30",
                    ordem: 2,
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Arroz Branco Cozido"],
                          quantidadeGramas: 200,
                        },
                        {
                          alimentoId: alimentosMap["Feijão Carioca Cozido"],
                          quantidadeGramas: 120,
                        },
                        {
                          alimentoId: alimentosMap["Peito de Frango Grelhado"],
                          quantidadeGramas: 180,
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              nome: "Fim de Semana (Flexível)",
              descricao: "Ajuste calórico para descanso e lazer",
              ordem: 4,
              refeicoes: {
                create: [
                  {
                    nome: "Café da Manhã / Brunch",
                    horario: "09:30",
                    ordem: 1,
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Ovo de Galinha Cozido"],
                          quantidadeGramas: 100,
                        },
                        {
                          alimentoId: alimentosMap["Pão de Forma Integral"],
                          quantidadeGramas: 50,
                        },
                      ],
                    },
                  },
                  {
                    nome: "Almoço em Família",
                    horario: "13:30",
                    ordem: 2,
                    itens: {
                      create: [
                        {
                          alimentoId: alimentosMap["Arroz Branco Cozido"],
                          quantidadeGramas: 150,
                        },
                        {
                          alimentoId: alimentosMap["Feijão Carioca Cozido"],
                          quantidadeGramas: 100,
                        },
                        {
                          alimentoId: alimentosMap["Peito de Frango Grelhado"],
                          quantidadeGramas: 150,
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      include: { variacoes: { include: { refeicoes: { include: { itens: true } } } } },
    });
    console.log("✅ Plano Alimentar inicial com 4 Variações de Cardápio semeado com sucesso!");
  }
}

main()
  .catch((e) => {
    console.error("❌ Erro ao semear:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
