import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { getDataSource, getRepository } from "../src/lib/db/data-source";
import {
  AlimentoEntity,
  EvolucaoClinicaEntity,
  ItemRefeicaoEntity,
  MedicoEntity,
  OrganizationEntity,
  PatientEntity,
  PlanoAlimentarEntity,
  ProntuarioPacienteEntity,
  RefeicaoEntity,
  UserEntity,
  VariacaoDietaEntity,
  type BiologicalSex,
  type Cargo,
  type UserRole,
} from "../src/lib/db/entities";
import { carregarTabelaTaco } from "./seed-taco";

async function upsertUser(params: {
  organizationId: string;
  fullName: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  cargo: Cargo;
  podeAcessarProntuario: boolean;
  isClinical: boolean;
  specialty: string;
  councilType?: string | null;
  councilNumber?: string | null;
}) {
  const userRepo = await getRepository(UserEntity);
  let user = await userRepo.findOne({
    where: [{ username: params.username }, { email: params.email }],
  });

  if (user) {
    user.fullName = params.fullName;
    user.username = params.username;
    user.email = params.email;
    user.cargo = params.cargo;
    user.role = params.role;
    user.podeAcessarProntuario = params.podeAcessarProntuario;
    user.isClinical = params.isClinical;
    user.specialty = params.specialty;
    user.accountStatus = "ACTIVE";
    return userRepo.save(user);
  }

  return userRepo.save(
    userRepo.create({
      organizationId: params.organizationId,
      fullName: params.fullName,
      username: params.username,
      email: params.email,
      passwordHash: params.passwordHash,
      role: params.role,
      cargo: params.cargo,
      podeAcessarProntuario: params.podeAcessarProntuario,
      isClinical: params.isClinical,
      mfaEnabled: false,
      specialty: params.specialty,
      councilType: params.councilType ?? null,
      councilNumber: params.councilNumber ?? null,
      accountStatus: "ACTIVE",
      mustChangePassword: false,
    }),
  );
}

async function ensureOracleSchema() {
  const ds = await getDataSource();
  const ddlFiles = [
    path.join(process.cwd(), "database", "oracle", "001_lote1_nucleo.sql"),
    path.join(
      process.cwd(),
      "database",
      "oracle",
      "002_lote2_a_4_demais_tabelas.sql",
    ),
  ];

  for (const filePath of ddlFiles) {
    if (!fs.existsSync(filePath)) continue;
    const rawSql = fs.readFileSync(filePath, "utf-8");
    const withoutComments = rawSql
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ""))
      .filter((line) => line.trim().length > 0)
      .join("\n");
    const statements = withoutComments
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await ds.query(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // ORA-00955: objeto já existe | ORA-01408: colunas já indexadas
        if (msg.includes("ORA-00955") || msg.includes("ORA-01408")) {
          continue;
        }
        throw err;
      }
    }
  }
  console.log("✅ Estrutura DDL (31 tabelas + índices + constraints) verificada no Oracle ADB!");
}

async function main() {
  console.log("🌱 Semeando dados iniciais da Clínica FAAZ no Oracle Autonomous Database...");

  await ensureOracleSchema();

  const orgRepo = await getRepository(OrganizationEntity);
  const medicoRepo = await getRepository(MedicoEntity);
  const patientRepo = await getRepository(PatientEntity);
  const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
  const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);
  const alimentoRepo = await getRepository(AlimentoEntity);
  const planoRepo = await getRepository(PlanoAlimentarEntity);
  const variacaoRepo = await getRepository(VariacaoDietaEntity);
  const refeicaoRepo = await getRepository(RefeicaoEntity);
  const itemRepo = await getRepository(ItemRefeicaoEntity);

  // 1. Organização Clínica FAAZ
  let org = await orgRepo.findOne({ where: { slug: "clinica-faaz" } });
  if (!org) {
    org = await orgRepo.save(
      orgRepo.create({
        slug: "clinica-faaz",
        tradeName: "Clínica FAAZ",
        legalName: "Clínica FAAZ Medicina & Saúde Integrativa Ltda",
        taxId: "12345678000190",
        primaryColorHex: "#0f766e",
        enabledModules: {},
        rolePermissions: {},
        status: "ACTIVE",
      }),
    );
  }
  console.log(`✅ Organização criada/encontrada: ${org.tradeName} (${org.id})`);

  const passwordHash = await bcrypt.hash("faaz123", 10);

  // 2. Corpo Clínico e Equipe (Dra. Ana Flávia, Dr. Carlos Fantini, Dr. Rodrigo Mendes, Patrícia, Eduardo)
  const draAnaFlavia = await upsertUser({
    organizationId: org.id,
    fullName: "Dra. Ana Flávia",
    username: "ana.flavia",
    email: "ana.flavia@clinicafaaz.com.br",
    passwordHash,
    role: "CLINIC_ADMIN",
    cargo: "DONO_CLINICA",
    podeAcessarProntuario: true,
    isClinical: true,
    specialty: "Endocrinologia & Metabologia",
    councilType: "CRM",
    councilNumber: "54321/MG",
  });
  console.log(`✅ Médica Titular: ${draAnaFlavia.fullName} (${draAnaFlavia.cargo})`);

  const drCarlos = await upsertUser({
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
  });
  console.log(`✅ Dono da Clínica: ${drCarlos.fullName} (${drCarlos.cargo})`);

  const drRodrigo = await upsertUser({
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
  });
  console.log(`✅ Médico Parceiro: ${drRodrigo.fullName} (${drRodrigo.cargo})`);

  const secretaria = await upsertUser({
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
  });
  console.log(`✅ Secretária: ${secretaria.fullName} (${secretaria.cargo})`);

  const administrador = await upsertUser({
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
  });
  console.log(`✅ Administrador: ${administrador.fullName} (${administrador.cargo})`);

  // Profissionais na tabela MEDICOS (Agenda)
  const medicosAgenda = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      nome: "Dr. Carlos Fantini",
      especialidade: "Endocrinologia & Nutrologia",
      corHex: "#059669",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      nome: "Dr. Rodrigo Mendes",
      especialidade: "Cirurgia Plástica",
      corHex: "#2563eb",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      nome: "Dra. Ana Flávia",
      especialidade: "Endocrinologia & Metabologia",
      corHex: "#0f766e",
    },
  ];
  for (const m of medicosAgenda) {
    const existingMed = await medicoRepo.findOne({ where: { id: m.id } });
    if (existingMed) {
      existingMed.nome = m.nome;
      existingMed.especialidade = m.especialidade;
      existingMed.corHex = m.corHex;
      await medicoRepo.save(existingMed);
    } else {
      await medicoRepo.save(medicoRepo.create(m));
    }
  }

  // 6. Pacientes de Teste
  const upsertPatient = async (data: {
    recordCode: string;
    fullName: string;
    cpf: string;
    birthDate: string;
    biologicalSex: BiologicalSex;
    convenio: string;
    planoFaaz: boolean;
    heightCm: number;
    phoneWhatsapp: string;
    email: string;
    metaDiariaMl: number;
    primaryDoctorId: string;
    clinicalFocus: string;
  }) => {
    let p = await patientRepo.findOne({
      where: { recordCode: data.recordCode },
    });
    if (p) {
      Object.assign(p, data);
      return patientRepo.save(p);
    }
    return patientRepo.save(
      patientRepo.create({
        organizationId: org.id,
        ...data,
        patientStatus: "ACTIVE",
        activeModules: [],
      }),
    );
  };

  const p1 = await upsertPatient({
    recordCode: "FAAZ-00001",
    fullName: "Carlos Eduardo Fantini",
    cpf: "11122233344",
    birthDate: "1976-05-18",
    biologicalSex: "MALE",
    convenio: "Particular",
    planoFaaz: false,
    heightCm: 178,
    phoneWhatsapp: "(31) 98888-0001",
    email: "carlos.paciente@gmail.com",
    metaDiariaMl: 2500,
    primaryDoctorId: drCarlos.id,
    clinicalFocus: "Emagrecimento & Longevidade Saudável",
  });

  const p2 = await upsertPatient({
    recordCode: "FAAZ-00002",
    fullName: "Maria Luiza Silva",
    cpf: "22233344455",
    birthDate: "1991-08-24",
    biologicalSex: "FEMALE",
    convenio: "Plano FAAZ",
    planoFaaz: true,
    heightCm: 164,
    phoneWhatsapp: "(31) 98888-0002",
    email: "marialuiza@gmail.com",
    metaDiariaMl: 3000,
    primaryDoctorId: draAnaFlavia.id,
    clinicalFocus: "Saúde Intestinal & Modulação Hormonal",
  });

  console.log(`✅ Pacientes semeados: ${p1.fullName} e ${p2.fullName}`);

  // 7. Prontuários Iniciais
  const ensureProntuario = async (
    pacienteId: string,
    dados: {
      pesoAtualKg: number;
      alturaCm: number;
      imc: number;
      objetivo: string;
      comorbidades: string;
      alergias: string;
      medicacoes: string;
      evolucao: string;
    },
  ) => {
    const existing = await prontuarioRepo.findOne({ where: { pacienteId } });
    if (!existing) {
      await prontuarioRepo.save(
        prontuarioRepo.create({
          pacienteId,
          ...dados,
        }),
      );
    }
  };

  await ensureProntuario(p1.id, {
    pesoAtualKg: 84.5,
    alturaCm: 178.0,
    imc: 26.67,
    objetivo: "Emagrecimento com preservação de massa magra e otimização metabólica.",
    comorbidades: "Resistência insulínica leve, histórico familiar de DM2.",
    alergias: "Dipirona e Frutos do mar.",
    medicacoes: "Metformina 500mg (1x ao dia), Creatina 5g/dia, Vitamina D3 2000 UI.",
    evolucao:
      "Paciente refere melhora na disposição matinal e aumento no consumo hídrico diário.",
  });

  await ensureProntuario(p2.id, {
    pesoAtualKg: 62.0,
    alturaCm: 164.0,
    imc: 23.05,
    objetivo:
      "Modulação da microbiota intestinal, redução de estufamento pós-prandial e controle de SOP.",
    comorbidades:
      "Síndrome dos Ovários Policísticos (SOP), constipação intestinal funcional.",
    alergias: "Lactose (intolerância moderada).",
    medicacoes: "Inositol 2g/dia, Probióticos multiespécies, Ômega 3 1000mg.",
    evolucao:
      "Paciente comparece para retorno clínico. Relata melhora após inclusão de fibras solúveis na dieta.",
  });

  // 8. Evoluções Clínicas Iniciais
  const countHist = await evolucaoRepo.count({ where: { pacienteId: p1.id } });
  if (countHist === 0) {
    await evolucaoRepo.save(
      evolucaoRepo.create({
        pacienteId: p1.id,
        dataAtendimento: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        pesoAtual: 86.2,
        alturaCm: 178.0,
        imc: 27.21,
        queixaPrincipal:
          "Fadiga vespertina, ganho ponderal e queixas de constipação leve.",
        condutaEvolucao:
          "Primeira consulta clínica. Orientada meta hídrica de 2500ml/dia.",
        medicoResponsavel: "Dr. Carlos Fantini",
      }),
    );

    await evolucaoRepo.save(
      evolucaoRepo.create({
        pacienteId: p1.id,
        dataAtendimento: new Date(),
        pesoAtual: 84.5,
        alturaCm: 178.0,
        imc: 26.67,
        queixaPrincipal:
          "Retorno para avaliação de exames laboratoriais e aderência hídrica.",
        condutaEvolucao:
          "Paciente refere redução de 1.7kg no período com aumento significativo de energia.",
        medicoResponsavel: "Dr. Carlos Fantini",
      }),
    );
  }

  // 9. Tabela TACO e Alimentos Base
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
    let al = await alimentoRepo.findOne({ where: { nome: a.nome } });
    if (al) {
      Object.assign(al, a);
      al = await alimentoRepo.save(al);
    } else {
      al = await alimentoRepo.save(alimentoRepo.create(a));
    }
    alimentosMap[a.nome] = al.id;
  }
  console.log("✅ Alimentos base validados!");

  // 10. Plano Alimentar Inicial para Paciente 1
  const planoExistente = await planoRepo.findOne({
    where: { pacienteId: p1.id, ativo: true },
  });

  if (!planoExistente) {
    const novoPlano = await planoRepo.save(
      planoRepo.create({
        pacienteId: p1.id,
        titulo: "Plano Metabólico & Sensibilidade Insulínica",
        objetivo:
          "Equilíbrio glicêmico com aporte proteico adequado (1.8g/kg) e fibras solúveis.",
        ativo: true,
      }),
    );

    const varPadrao = await variacaoRepo.save(
      variacaoRepo.create({
        planoAlimentarId: novoPlano.id,
        nome: "Opção 1 (Padrão)",
        descricao:
          "Cardápio do dia a dia com foco em saciedade e baixo índice glicêmico",
        ordem: 1,
        ativo: true,
      }),
    );

    const desjejum = await refeicaoRepo.save(
      refeicaoRepo.create({
        variacaoDietaId: varPadrao.id,
        nome: "Desjejum / Café da Manhã",
        horario: "07:30",
        ordem: 1,
        observacoes: "Acompanhar com 300ml de água ou chá verde.",
      }),
    );

    await itemRepo.save([
      itemRepo.create({
        refeicaoId: desjejum.id,
        alimentoId: alimentosMap["Ovo de Galinha Cozido"],
        quantidadeGramas: 100,
        observacao: "2 unidades médias cozidas",
      }),
      itemRepo.create({
        refeicaoId: desjejum.id,
        alimentoId: alimentosMap["Aveia em Flocos"],
        quantidadeGramas: 30,
        observacao: "Flocos grossos",
      }),
      itemRepo.create({
        refeicaoId: desjejum.id,
        alimentoId: alimentosMap["Maçã Fuji com Casca"],
        quantidadeGramas: 120,
        observacao: "1 maçã pequena fatiada",
      }),
    ]);

    const almoco = await refeicaoRepo.save(
      refeicaoRepo.create({
        variacaoDietaId: varPadrao.id,
        nome: "Almoço",
        horario: "12:30",
        ordem: 2,
        observacoes: "Incluir folhas verdes escuras à vontade.",
      }),
    );

    await itemRepo.save([
      itemRepo.create({
        refeicaoId: almoco.id,
        alimentoId: alimentosMap["Arroz Branco Cozido"],
        quantidadeGramas: 120,
        observacao: "3 colheres de sopa",
      }),
      itemRepo.create({
        refeicaoId: almoco.id,
        alimentoId: alimentosMap["Feijão Carioca Cozido"],
        quantidadeGramas: 100,
        observacao: "1 concha média",
      }),
      itemRepo.create({
        refeicaoId: almoco.id,
        alimentoId: alimentosMap["Peito de Frango Grelhado"],
        quantidadeGramas: 150,
        observacao: "1 filé grande",
      }),
    ]);

    console.log("✅ Plano Alimentar inicial semeado com sucesso!");
  }
}

main()
  .catch((e) => {
    console.error("❌ Erro ao semear:", e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const ds = await getDataSource();
      if (ds.isInitialized) await ds.destroy();
    } catch {
      // ignore
    }
  });
