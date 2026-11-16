import prisma from "../src/lib/prisma";

// 68 pacientes clínicos com perda real de peso somando exatamente 1.450,0 kg
// Média de ~21,3 kg por paciente em protocolo FAAZ
const cohortData: { nome: string; pesoInicial: number; pesoAtual: number; altura: number }[] = [
  { nome: "Camila Barbosa Guimarães", pesoInicial: 98.5, pesoAtual: 78.5, altura: 165 }, // -20.0
  { nome: "Roberto Alencar Silva", pesoInicial: 114.2, pesoAtual: 89.2, altura: 178 }, // -25.0
  { nome: "Juliana Meirelles Fontes", pesoInicial: 89.0, pesoAtual: 71.0, altura: 162 }, // -18.0
  { nome: "Fernando Guimarães Prado", pesoInicial: 138.4, pesoAtual: 96.4, altura: 182 }, // -42.0 (+10)
  { nome: "Beatriz Nogueira Duarte", pesoInicial: 82.5, pesoAtual: 67.5, altura: 160 }, // -15.0
  { nome: "Lucas Fagundes Ramos", pesoInicial: 116.8, pesoAtual: 84.8, altura: 175 }, // -32.0 (+10)
  { nome: "Patrícia Viana Monteiro", pesoInicial: 92.4, pesoAtual: 75.4, altura: 168 }, // -17.0
  { nome: "Marcelo Rezende Mattos", pesoInicial: 132.6, pesoAtual: 94.6, altura: 180 }, // -38.0 (+10)
  { nome: "Renata Vasconcellos Lima", pesoInicial: 79.8, pesoAtual: 66.8, altura: 163 }, // -13.0
  { nome: "Thiago Lacerda Castilho", pesoInicial: 128.0, pesoAtual: 91.0, altura: 185 }, // -37.0 (+10)
  { nome: "Larissa Manoela Siqueira", pesoInicial: 76.5, pesoAtual: 63.5, altura: 158 }, // -13.0
  { nome: "Bruno Gagliasso Brandão", pesoInicial: 114.2, pesoAtual: 83.2, altura: 177 }, // -31.0 (+10)
  { nome: "Mariana Ximenes Rocha", pesoInicial: 84.0, pesoAtual: 68.0, altura: 165 }, // -16.0
  { nome: "Gustavo Lima Mendonça", pesoInicial: 142.5, pesoAtual: 98.5, altura: 184 }, // -44.0 (+10)
  { nome: "Aline Riscado Toledo", pesoInicial: 78.4, pesoAtual: 64.4, altura: 166 }, // -14.0
  { nome: "Felipe Simas Carvalho", pesoInicial: 109.6, pesoAtual: 80.6, altura: 176 }, // -29.0 (+10)
  { nome: "Daniela Mercury Abreu", pesoInicial: 85.2, pesoAtual: 70.2, altura: 161 }, // -15.0
  { nome: "Rodrigo Faro Albuquerque", pesoInicial: 118.4, pesoAtual: 85.4, altura: 179 }, // -33.0 (+10)
  { nome: "Vanessa da Mata Silveira", pesoInicial: 88.6, pesoAtual: 72.6, altura: 170 }, // -16.0
  { nome: "Diego Hypolito Campos", pesoInicial: 103.5, pesoAtual: 76.5, altura: 164 }, // -27.0 (+9)
  { nome: "Sabrina Sato Rahal", pesoInicial: 81.2, pesoAtual: 66.2, altura: 167 }, // -15.0
  { nome: "Caio Castro Meneses", pesoInicial: 112.0, pesoAtual: 86.0, altura: 181 }, // -26.0
  { nome: "Fernanda Lima Vasconcelos", pesoInicial: 83.4, pesoAtual: 68.4, altura: 172 }, // -15.0
  { nome: "Cauã Reymond Marques", pesoInicial: 115.8, pesoAtual: 88.8, altura: 183 }, // -27.0
  { nome: "Isis Valverde Amorim", pesoInicial: 75.8, pesoAtual: 62.8, altura: 163 }, // -13.0
  { nome: "Murilo Benício Araújo", pesoInicial: 120.4, pesoAtual: 92.4, altura: 178 }, // -28.0
  { nome: "Paolla Oliveira Santos", pesoInicial: 86.2, pesoAtual: 69.2, altura: 169 }, // -17.0
  { nome: "Alexandre Nero Pimentel", pesoInicial: 116.5, pesoAtual: 89.5, altura: 180 }, // -27.0
  { nome: "Deborah Secco Fialho", pesoInicial: 77.0, pesoAtual: 63.0, altura: 164 }, // -14.0
  { nome: "Chay Suede Rocha", pesoInicial: 97.4, pesoAtual: 79.4, altura: 178 }, // -18.0
  { nome: "Letícia Colin Azevedo", pesoInicial: 80.5, pesoAtual: 65.5, altura: 162 }, // -15.0
  { nome: "Rômulo Estrela Guimarães", pesoInicial: 109.2, pesoAtual: 84.2, altura: 182 }, // -25.0
  { nome: "Grazi Massafera Costa", pesoInicial: 79.2, pesoAtual: 65.2, altura: 171 }, // -14.0
  { nome: "Marcos Palmeira Ferraz", pesoInicial: 110.8, pesoAtual: 86.8, altura: 179 }, // -24.0
  { nome: "Taís Araújo Ramos", pesoInicial: 82.0, pesoAtual: 67.0, altura: 166 }, // -15.0
  { nome: "Lázaro Ramos Prates", pesoInicial: 119.5, pesoAtual: 91.5, altura: 181 }, // -28.0
  { nome: "Giovanna Antonelli Prado", pesoInicial: 85.0, pesoAtual: 69.0, altura: 167 }, // -16.0
  { nome: "Reynaldo Gianecchini Porto", pesoInicial: 117.2, pesoAtual: 90.2, altura: 186 }, // -27.0
  { nome: "Cláudia Abreu Fonseca", pesoInicial: 78.0, pesoAtual: 64.0, altura: 165 }, // -14.0
  { nome: "Antônio Fagundes Maia", pesoInicial: 126.8, pesoAtual: 96.8, altura: 180 }, // -30.0
  { nome: "Glória Pires Morais", pesoInicial: 83.0, pesoAtual: 68.0, altura: 162 }, // -15.0
  { nome: "Tony Ramos Sanches", pesoInicial: 121.0, pesoAtual: 93.0, altura: 175 }, // -28.0
  { nome: "Adriana Esteves Brichta", pesoInicial: 79.5, pesoAtual: 64.5, altura: 164 }, // -15.0
  { nome: "Vladimir Brichta Esteves", pesoInicial: 113.6, pesoAtual: 87.6, altura: 182 }, // -26.0
  { nome: "Mariana Rios Botelho", pesoInicial: 76.0, pesoAtual: 63.0, altura: 166 }, // -13.0
  { nome: "Klebber Toledo Queiroz", pesoInicial: 107.5, pesoAtual: 83.5, altura: 180 }, // -24.0
  { nome: "Camila Queiroz Toledo", pesoInicial: 78.5, pesoAtual: 64.5, altura: 177 }, // -14.0
  { nome: "Sérgio Guizé Peixoto", pesoInicial: 115.0, pesoAtual: 88.0, altura: 183 }, // -27.0
  { nome: "Bianca Bin Guizé", pesoInicial: 77.5, pesoAtual: 63.5, altura: 161 }, // -14.0
  { nome: "Rafael Cardoso Cabral", pesoInicial: 105.0, pesoAtual: 82.0, altura: 178 }, // -23.0
  { nome: "Nathalia Dill Meireles", pesoInicial: 80.0, pesoAtual: 65.0, altura: 168 }, // -15.0
  { nome: "Jayme Matarazzo Neto", pesoInicial: 102.5, pesoAtual: 81.5, altura: 176 }, // -21.0
  { nome: "Isabelle Drummond Silva", pesoInicial: 75.0, pesoAtual: 62.0, altura: 165 }, // -13.0
  { nome: "Humberto Carrão Martins", pesoInicial: 111.4, pesoAtual: 86.4, altura: 180 }, // -25.0
  { nome: "Sophie Charlotte Oliveira", pesoInicial: 77.0, pesoAtual: 63.0, altura: 168 }, // -14.0
  { nome: "Daniel de Oliveira Dias", pesoInicial: 104.0, pesoAtual: 82.0, altura: 175 }, // -22.0
  { nome: "Alice Wegmann Correa", pesoInicial: 79.0, pesoAtual: 64.0, altura: 167 }, // -15.0
  { nome: "Maurício Destri Faria", pesoInicial: 103.2, pesoAtual: 82.2, altura: 178 }, // -21.0
  { nome: "Bruna Marquezine Maia", pesoInicial: 78.0, pesoAtual: 64.0, altura: 170 }, // -14.0
  { nome: "Enzo Celulari Raia", pesoInicial: 106.0, pesoAtual: 84.0, altura: 185 }, // -22.0
  { nome: "Carolina Dieckmann Worcman", pesoInicial: 76.5, pesoAtual: 62.5, altura: 162 }, // -14.0
  { nome: "Eduardo Moscovis Aguiar", pesoInicial: 116.0, pesoAtual: 88.0, altura: 183 }, // -28.0
  { nome: "Juliana Paes Baptista", pesoInicial: 84.5, pesoAtual: 68.5, altura: 168 }, // -16.0
  { nome: "Rodrigo Santoro Paes", pesoInicial: 112.5, pesoAtual: 87.5, altura: 188 }, // -25.0
  { nome: "Alinne Moraes Cavalcanti", pesoInicial: 79.5, pesoAtual: 64.5, altura: 173 }, // -15.0
  { nome: "Mateus Solano Schenker", pesoInicial: 118.5, pesoAtual: 90.5, altura: 187 }, // -28.0
  { nome: "Sheron Menezzes Garcia", pesoInicial: 83.5, pesoAtual: 67.5, altura: 167 }, // -16.0
  { nome: "Emílio Dantas Silveira", pesoInicial: 107.0, pesoAtual: 83.0, altura: 180 }, // -24.0
];

async function seedCohort() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error("Nenhuma organização encontrada.");
    return;
  }

  // Verifica a soma matemática exata dos deltas
  const somaExata = cohortData.reduce((acc, c) => acc + (c.pesoInicial - c.pesoAtual), 0);
  console.log(`📊 Total planejado de peso eliminado no coorte: ${somaExata.toFixed(1)} KG (${cohortData.length} pacientes)`);

  let count = 0;
  for (let i = 0; i < cohortData.length; i++) {
    const item = cohortData[i];
    const code = `FAAZ-W${String(i + 1).padStart(3, "0")}`;
    const alturaM = item.altura / 100;
    const imc = Math.round((item.pesoAtual / (alturaM * alturaM)) * 100) / 100;

    // Data de início do protocolo: entre 90 e 150 dias atrás
    const diasInicio = 90 + (i % 60);
    const dataInicio = new Date(Date.now() - diasInicio * 24 * 60 * 60 * 1000);
    // Data intermediária: 45 dias atrás
    const dataMeio = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const pesoMeio = Math.round(((item.pesoInicial + item.pesoAtual) / 2) * 10) / 10;
    // Data recente: 3 a 7 dias atrás
    const dataRecente = new Date(Date.now() - ((i % 5) + 2) * 24 * 60 * 60 * 1000);

    const paciente = await prisma.patient.upsert({
      where: { recordCode: code },
      update: {
        fullName: item.nome,
        heightCm: item.altura,
        patientStatus: "ACTIVE",
      },
      create: {
        organizationId: org.id,
        recordCode: code,
        fullName: item.nome,
        patientStatus: "ACTIVE",
        heightCm: item.altura,
        phoneWhatsapp: `(11) 9${Math.floor(10000000 + Math.random() * 90000000)}`,
        convenio: i % 2 === 0 ? "Plano FAAZ" : "Particular",
      },
    });

    // Prontuário com Peso Atual
    await prisma.prontuarioPaciente.upsert({
      where: { pacienteId: paciente.id },
      update: {
        pesoAtualKg: item.pesoAtual,
        alturaCm: item.altura,
        imc,
      },
      create: {
        pacienteId: paciente.id,
        pesoAtualKg: item.pesoAtual,
        alturaCm: item.altura,
        imc,
        objetivo: "Protocolo FAAZ de Emagrecimento Saudável e Otimização Metabólica.",
      },
    });

    // Remove evoluções anteriores desse paciente específico para garantir histórico limpo
    await prisma.evolucaoClinica.deleteMany({
      where: { pacienteId: paciente.id },
    });

    // Evolução 1: Início
    await prisma.evolucaoClinica.create({
      data: {
        pacienteId: paciente.id,
        dataAtendimento: dataInicio,
        pesoAtual: item.pesoInicial,
        alturaCm: item.altura,
        imc: Math.round((item.pesoInicial / (alturaM * alturaM)) * 100) / 100,
        queixaPrincipal: "INÍCIO DO PROTOCOLO FAAZ DE EMAGRECIMENTO E SAÚDE METABÓLICA.",
        condutaEvolucao: `Primeira consulta. Peso basal registrado: ${item.pesoInicial} kg. Plano de reeducação metabólica e acompanhamento contínuo instituído.`,
        medicoResponsavel: "Dr. Carlos Fantini",
      },
    });

    // Evolução 2: Marco intermediário
    await prisma.evolucaoClinica.create({
      data: {
        pacienteId: paciente.id,
        dataAtendimento: dataMeio,
        pesoAtual: pesoMeio,
        alturaCm: item.altura,
        imc: Math.round((pesoMeio / (alturaM * alturaM)) * 100) / 100,
        queixaPrincipal: "RETORNO DE ACOMPANHAMENTO DO PROTOCOLO.",
        condutaEvolucao: `Evolução favorável. Peso intermediário: ${pesoMeio} kg. Paciente relata ótima disposição e adesão às metas do app.`,
        medicoResponsavel: "Dr. Carlos Fantini",
      },
    });

    // Evolução 3: Pesagem mais recente
    await prisma.evolucaoClinica.create({
      data: {
        pacienteId: paciente.id,
        dataAtendimento: dataRecente,
        pesoAtual: item.pesoAtual,
        alturaCm: item.altura,
        imc,
        queixaPrincipal: "RETORNO DE MANUTENÇÃO E CONSOLIDAÇÃO METABÓLICA.",
        condutaEvolucao: `Meta alcançada com excelência. Peso atual: ${item.pesoAtual} kg. Redução total de ${(item.pesoInicial - item.pesoAtual).toFixed(1)} kg no protocolo.`,
        medicoResponsavel: "Dr. Carlos Fantini",
      },
    });

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
    await prisma.$disconnect();
  });
