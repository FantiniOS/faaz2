import { getDataSource, getRepository } from "../src/lib/db/data-source";
import {
  EvolucaoClinicaEntity,
  OrganizationEntity,
  PatientEntity,
  ProntuarioPacienteEntity,
} from "../src/lib/db/entities";

const cohortData: {
  nome: string;
  pesoInicial: number;
  pesoAtual: number;
  altura: number;
}[] = [
  { nome: "Camila Barbosa Guimarães", pesoInicial: 98.5, pesoAtual: 78.5, altura: 165 },
  { nome: "Roberto Alencar Silva", pesoInicial: 114.2, pesoAtual: 89.2, altura: 178 },
  { nome: "Juliana Meirelles Fontes", pesoInicial: 89.0, pesoAtual: 71.0, altura: 162 },
  { nome: "Fernando Guimarães Prado", pesoInicial: 138.4, pesoAtual: 96.4, altura: 182 },
  { nome: "Beatriz Nogueira Duarte", pesoInicial: 82.5, pesoAtual: 67.5, altura: 160 },
  { nome: "Lucas Fagundes Ramos", pesoInicial: 116.8, pesoAtual: 84.8, altura: 175 },
  { nome: "Patrícia Viana Monteiro", pesoInicial: 92.4, pesoAtual: 75.4, altura: 168 },
  { nome: "Marcelo Rezende Mattos", pesoInicial: 132.6, pesoAtual: 94.6, altura: 180 },
  { nome: "Renata Vasconcellos Lima", pesoInicial: 79.8, pesoAtual: 66.8, altura: 163 },
  { nome: "Thiago Lacerda Castilho", pesoInicial: 128.0, pesoAtual: 91.0, altura: 185 },
];

async function seedCohort() {
  const orgRepo = await getRepository(OrganizationEntity);
  const patientRepo = await getRepository(PatientEntity);
  const prontuarioRepo = await getRepository(ProntuarioPacienteEntity);
  const evolucaoRepo = await getRepository(EvolucaoClinicaEntity);

  const orgs = await orgRepo.find({ take: 1 });
  const org = orgs[0];
  if (!org) {
    console.error("Nenhuma organização encontrada.");
    return;
  }

  let count = 0;
  for (let i = 0; i < cohortData.length; i++) {
    const item = cohortData[i];
    const code = `FAAZ-W${String(i + 1).padStart(3, "0")}`;
    const alturaM = item.altura / 100;
    const imc = Math.round((item.pesoAtual / (alturaM * alturaM)) * 100) / 100;

    const diasInicio = 90 + (i % 60);
    const dataInicio = new Date(Date.now() - diasInicio * 24 * 60 * 60 * 1000);
    const dataMeio = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const pesoMeio =
      Math.round(((item.pesoInicial + item.pesoAtual) / 2) * 10) / 10;
    const dataRecente = new Date(
      Date.now() - ((i % 5) + 2) * 24 * 60 * 60 * 1000,
    );

    let paciente = await patientRepo.findOne({ where: { recordCode: code } });
    if (paciente) {
      paciente.fullName = item.nome;
      paciente.heightCm = item.altura;
      paciente.patientStatus = "ACTIVE";
      paciente = await patientRepo.save(paciente);
    } else {
      paciente = await patientRepo.save(
        patientRepo.create({
          organizationId: org.id,
          recordCode: code,
          fullName: item.nome,
          patientStatus: "ACTIVE",
          heightCm: item.altura,
          phoneWhatsapp: `(11) 9${Math.floor(10000000 + Math.random() * 90000000)}`,
          convenio: i % 2 === 0 ? "Plano FAAZ" : "Particular",
          planoFaaz: i % 2 === 0,
          metaDiariaMl: 2500,
          activeModules: [],
        }),
      );
    }

    const existingProntuario = await prontuarioRepo.findOne({
      where: { pacienteId: paciente.id },
    });
    if (existingProntuario) {
      existingProntuario.pesoAtualKg = item.pesoAtual;
      existingProntuario.alturaCm = item.altura;
      existingProntuario.imc = imc;
      await prontuarioRepo.save(existingProntuario);
    } else {
      await prontuarioRepo.save(
        prontuarioRepo.create({
          pacienteId: paciente.id,
          pesoAtualKg: item.pesoAtual,
          alturaCm: item.altura,
          imc,
          objetivo:
            "Protocolo FAAZ de Emagrecimento Saudável e Otimização Metabólica.",
        }),
      );
    }

    await evolucaoRepo.delete({ pacienteId: paciente.id });

    await evolucaoRepo.save([
      evolucaoRepo.create({
        pacienteId: paciente.id,
        dataAtendimento: dataInicio,
        pesoAtual: item.pesoInicial,
        alturaCm: item.altura,
        imc: Math.round((item.pesoInicial / (alturaM * alturaM)) * 100) / 100,
        queixaPrincipal:
          "INÍCIO DO PROTOCOLO FAAZ DE EMAGRECIMENTO E SAÚDE METABÓLICA.",
        condutaEvolucao: `Primeira consulta. Peso basal registrado: ${item.pesoInicial} kg.`,
        medicoResponsavel: "Dr. Carlos Fantini",
      }),
      evolucaoRepo.create({
        pacienteId: paciente.id,
        dataAtendimento: dataMeio,
        pesoAtual: pesoMeio,
        alturaCm: item.altura,
        imc: Math.round((pesoMeio / (alturaM * alturaM)) * 100) / 100,
        queixaPrincipal: "RETORNO DE ACOMPANHAMENTO DO PROTOCOLO.",
        condutaEvolucao: `Evolução favorável. Peso intermediário: ${pesoMeio} kg.`,
        medicoResponsavel: "Dr. Carlos Fantini",
      }),
      evolucaoRepo.create({
        pacienteId: paciente.id,
        dataAtendimento: dataRecente,
        pesoAtual: item.pesoAtual,
        alturaCm: item.altura,
        imc,
        queixaPrincipal:
          "RETORNO DE MANUTENÇÃO E CONSOLIDAÇÃO METABÓLICA.",
        condutaEvolucao: `Meta alcançada com excelência. Peso atual: ${item.pesoAtual} kg.`,
        medicoResponsavel: "Dr. Carlos Fantini",
      }),
    ]);

    count++;
  }

  console.log(`✅ ${count} pacientes do coorte semeados com sucesso!`);
}

seedCohort()
  .catch((e) => {
    console.error("Erro no seed:", e);
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
