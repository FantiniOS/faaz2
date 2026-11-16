import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function sanitizeDatabaseEncoding() {
  console.log("========================================================");
  console.log("🛡️ SANITIZAÇÃO DE ENCODING UTF-8 NO BANCO DE DADOS");
  console.log("========================================================");

  // 1. Sanitização em VariacaoDieta
  const variacoes = await prisma.variacaoDieta.findMany();
  let varsCorrigidas = 0;

  for (const v of variacoes) {
    let nomeNovo = v.nome;
    let descNova = v.descricao;
    let mudou = false;

    // Correção do termo Flexível / Fim de Semana
    if (
      nomeNovo.includes("Flex") ||
      nomeNovo.includes("Semana") ||
      nomeNovo.includes("\uFFFD") ||
      nomeNovo.includes("FlexÃ") ||
      nomeNovo.includes("Flexvel")
    ) {
      if (
        nomeNovo.toLowerCase().includes("fim de semana") ||
        nomeNovo.toLowerCase().includes("flex")
      ) {
        nomeNovo = "Fim de Semana (Flexível)";
        mudou = true;
      }
    }

    if (descNova) {
      if (
        descNova.includes("\uFFFD") ||
        descNova.includes("calrico") ||
        descNova.includes("calÃ")
      ) {
        descNova = descNova
          .replace(/cal[\uFFFD|r]rico/gi, "calórico")
          .replace(/cal\uFFFDrico/gi, "calórico")
          .replace(/calórico/gi, "calórico");
        
        if (descNova.toLowerCase().includes("descanso e lazer")) {
          descNova = "Ajuste calórico para descanso e lazer";
        }
        mudou = true;
      }
    }

    if (mudou) {
      await prisma.variacaoDieta.update({
        where: { id: v.id },
        data: {
          nome: nomeNovo,
          descricao: descNova,
        },
      });
      varsCorrigidas++;
      console.log(`✅ VariacaoDieta atualizada [${v.id}]: "${v.nome}" -> "${nomeNovo}"`);
    }
  }

  // 2. Sanitização em PlanoAlimentar
  const planos = await prisma.planoAlimentar.findMany();
  let planosCorrigidos = 0;
  for (const p of planos) {
    let tituloNovo = p.titulo;
    let objNovo = p.objetivo;
    let mudou = false;

    if (tituloNovo && (tituloNovo.includes("\uFFFD") || tituloNovo.includes("Ã"))) {
      tituloNovo = tituloNovo.replace(/Card\uFFFDpio/g, "Cardápio").replace(/Op\uFFFD\uFFFD\uFFFDo/g, "Opção");
      mudou = true;
    }

    if (objNovo && (objNovo.includes("\uFFFD") || objNovo.includes("Ã"))) {
      objNovo = objNovo.replace(/Equil\uFFFDbrio/g, "Equilíbrio").replace(/otimiza\uFFFD\uFFFDo/g, "otimização").replace(/metab\uFFFDlica/g, "metabólica");
      mudou = true;
    }

    if (mudou) {
      await prisma.planoAlimentar.update({
        where: { id: p.id },
        data: { titulo: tituloNovo, objetivo: objNovo },
      });
      planosCorrigidos++;
      console.log(`✅ PlanoAlimentar atualizado [${p.id}]: "${p.titulo}" -> "${tituloNovo}"`);
    }
  }

  // 3. Sanitização em Alimentos
  const alimentosCorrompidos = await prisma.alimento.findMany({
    where: {
      OR: [
        { nome: { contains: "\uFFFD" } },
        { categoria: { contains: "\uFFFD" } },
      ],
    },
  });

  console.log(`📊 Alimentos com encoding corrompido encontrados: ${alimentosCorrompidos.length}`);

  console.log("========================================================");
  console.log(`🎉 Sanitização concluída com sucesso!`);
  console.log(`- Variações de Dieta corrigidas: ${varsCorrigidas}`);
  console.log(`- Planos Alimentares corrigidos: ${planosCorrigidos}`);
  console.log("========================================================");
}

sanitizeDatabaseEncoding()
  .catch((e) => {
    console.error("❌ Erro na sanitização:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
