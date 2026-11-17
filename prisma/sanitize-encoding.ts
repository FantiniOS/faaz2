import { Raw } from "typeorm";
import { getDataSource, getRepository } from "../src/lib/db/data-source";
import {
  AlimentoEntity,
  PlanoAlimentarEntity,
  VariacaoDietaEntity,
} from "../src/lib/db/entities";

async function sanitizeDatabaseEncoding() {
  console.log("========================================================");
  console.log("🛡️ SANITIZAÇÃO DE ENCODING UTF-8 NO BANCO DE DADOS");
  console.log("========================================================");

  const variacaoRepo = await getRepository(VariacaoDietaEntity);
  const planoRepo = await getRepository(PlanoAlimentarEntity);
  const alimentoRepo = await getRepository(AlimentoEntity);

  const variacoes = await variacaoRepo.find();
  let varsCorrigidas = 0;

  for (const v of variacoes) {
    let nomeNovo = v.nome;
    let descNova = v.descricao;
    let mudou = false;

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
          .replace(/cal\uFFFDrico/gi, "calórico");

        if (descNova.toLowerCase().includes("descanso e lazer")) {
          descNova = "Ajuste calórico para descanso e lazer";
        }
        mudou = true;
      }
    }

    if (mudou) {
      await variacaoRepo.update(
        { id: v.id },
        {
          nome: nomeNovo,
          descricao: descNova,
        },
      );
      varsCorrigidas++;
    }
  }

  const planos = await planoRepo.find();
  let planosCorrigidos = 0;
  for (const p of planos) {
    let tituloNovo = p.titulo;
    let objNovo = p.objetivo;
    let mudou = false;

    if (tituloNovo && (tituloNovo.includes("\uFFFD") || tituloNovo.includes("Ã"))) {
      tituloNovo = tituloNovo
        .replace(/Card\uFFFDpio/g, "Cardápio")
        .replace(/Op\uFFFD\uFFFD\uFFFDo/g, "Opção");
      mudou = true;
    }

    if (objNovo && (objNovo.includes("\uFFFD") || objNovo.includes("Ã"))) {
      objNovo = objNovo
        .replace(/Equil\uFFFDbrio/g, "Equilíbrio")
        .replace(/otimiza\uFFFD\uFFFDo/g, "otimização")
        .replace(/metab\uFFFDlica/g, "metabólica");
      mudou = true;
    }

    if (mudou) {
      await planoRepo.update(
        { id: p.id },
        { titulo: tituloNovo, objetivo: objNovo },
      );
      planosCorrigidos++;
    }
  }

  const alimentosCorrompidos = await alimentoRepo.find({
    where: [
      { nome: Raw((alias) => `${alias} LIKE :bad`, { bad: "%\uFFFD%" }) },
      { categoria: Raw((alias) => `${alias} LIKE :bad`, { bad: "%\uFFFD%" }) },
    ],
  });

  console.log(
    `📊 Alimentos com encoding corrompido encontrados: ${alimentosCorrompidos.length}`,
  );
  console.log(`🎉 Sanitização concluída! Variações: ${varsCorrigidas}, Planos: ${planosCorrigidos}`);
}

sanitizeDatabaseEncoding()
  .catch((e) => {
    console.error("❌ Erro na sanitização:", e);
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
