import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const TACO_RAW_URL =
  "https://raw.githubusercontent.com/marcelosanto/tabela_taco/main/tabela_alimentos.json";

function parseNumeroTaco(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Number(val.toFixed(2));
  const str = String(val).trim().replace(",", ".");
  if (
    str === "" ||
    str.toUpperCase() === "NA" ||
    str.toUpperCase() === "TR" ||
    str === "*" ||
    str === "-"
  ) {
    return 0;
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Number(num.toFixed(2));
}

// Suplementos e itens clínicos complementares que médicos prescrevem rotineiramente
const SUPLEMENTOS_CLINICOS = [
  {
    nome: "Whey Protein Isolado 90% (em pó)",
    categoria: "Suplementos e Nutracêuticos",
    porcaoBase: 100,
    calorias: 370,
    proteinas: 90.0,
    carboidratos: 1.5,
    gorduras: 1.0,
    fibras: 0.0,
    fonte: "Clínica FAAZ / Farmacopeia",
  },
  {
    nome: "Whey Protein Concentrado 80% (em pó)",
    categoria: "Suplementos e Nutracêuticos",
    porcaoBase: 100,
    calorias: 400,
    proteinas: 80.0,
    carboidratos: 8.0,
    gorduras: 6.0,
    fibras: 0.0,
    fonte: "Clínica FAAZ / Farmacopeia",
  },
  {
    nome: "Albumina em Pó Pura",
    categoria: "Suplementos e Nutracêuticos",
    porcaoBase: 100,
    calorias: 385,
    proteinas: 80.0,
    carboidratos: 7.0,
    gorduras: 0.0,
    fibras: 0.0,
    fonte: "Clínica FAAZ / Farmacopeia",
  },
  {
    nome: "Creatina Monoidratada Pura",
    categoria: "Suplementos e Nutracêuticos",
    porcaoBase: 100,
    calorias: 0,
    proteinas: 0.0,
    carboidratos: 0.0,
    gorduras: 0.0,
    fibras: 0.0,
    fonte: "Clínica FAAZ / Farmacopeia",
  },
  {
    nome: "Psyllium Puro em Fibras",
    categoria: "Suplementos e Nutracêuticos",
    porcaoBase: 100,
    calorias: 189,
    proteinas: 1.5,
    carboidratos: 7.0,
    gorduras: 0.5,
    fibras: 78.0,
    fonte: "Clínica FAAZ / Farmacopeia",
  },
];

export async function carregarTabelaTaco() {
  console.log("========================================================");
  console.log("🥗 MEGA SEED TACO: CARGA MASSIVA DA TABELA OFICIAL TACO");
  console.log("========================================================");

  let dadosBrutos: any[] = [];

  // 1. Carrega backup local (rápido e offline) ou busca via GitHub se não existir
  const localPath = path.join(process.cwd(), "prisma", "data", "taco.json");
  if (fs.existsSync(localPath)) {
    try {
      const fileData = fs.readFileSync(localPath, "utf-8");
      dadosBrutos = JSON.parse(fileData);
      console.log(`📂 Base oficial TACO local carregada com sucesso: ${dadosBrutos.length} alimentos.`);
    } catch (readErr: any) {
      console.warn(`⚠️ Erro ao ler backup local: ${readErr.message}`);
    }
  }

  if (!dadosBrutos.length) {
    try {
      console.log(`🌐 Buscando base oficial TACO via GitHub: ${TACO_RAW_URL}...`);
      const res = await fetch(TACO_RAW_URL, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        dadosBrutos = await res.json();
        console.log(`📥 Download concluído com sucesso: ${dadosBrutos.length} alimentos.`);
      } else {
        throw new Error(`Status HTTP ${res.status}`);
      }
    } catch (err: any) {
      throw new Error(`Falha ao obter dados TACO (local e online): ${err.message}`);
    }
  }

  // 2. Normalização e Tratamento dos Dados
  const nomesRegistrados = new Set<string>();
  const alimentosFormatados: {
    nome: string;
    porcaoBase: number;
    calorias: number;
    proteinas: number;
    carboidratos: number;
    gorduras: number;
    fibras: number;
    categoria: string;
    fonte: string;
  }[] = [];

  for (const item of dadosBrutos) {
    let nome = String(item.description || "").trim();
    if (!nome) continue;

    // Capitalização limpa da primeira letra
    nome = nome.charAt(0).toUpperCase() + nome.slice(1);

    // Evita duplicatas com sufixo descritivo
    if (nomesRegistrados.has(nome)) {
      const cat = item.category ? ` (${item.category})` : ` [${item.id}]`;
      nome = `${nome}${cat}`;
    }
    nomesRegistrados.add(nome);

    const calorias = parseNumeroTaco(item.energy_kcal);
    const proteinas = parseNumeroTaco(item.protein_g);
    const carboidratos = parseNumeroTaco(item.carbohydrate_g);
    const gorduras = parseNumeroTaco(item.lipid_g);
    const fibras = parseNumeroTaco(item.fiber_g);
    const categoria = String(item.category || "Geral").trim();

    alimentosFormatados.push({
      nome,
      porcaoBase: 100,
      calorias,
      proteinas,
      carboidratos,
      gorduras,
      fibras,
      categoria,
      fonte: "TACO/UNICAMP",
    });
  }

  // Adiciona suplementos clínicos
  for (const sup of SUPLEMENTOS_CLINICOS) {
    if (!nomesRegistrados.has(sup.nome)) {
      nomesRegistrados.add(sup.nome);
      alimentosFormatados.push(sup);
    }
  }

  console.log(`⚡ Preparados ${alimentosFormatados.length} alimentos para inserção massiva.`);

  // 3. Inserção Massiva com createMany (skipDuplicates: true)
  const BATCH_SIZE = 100;
  let totalInseridos = 0;

  for (let i = 0; i < alimentosFormatados.length; i += BATCH_SIZE) {
    const lote = alimentosFormatados.slice(i, i + BATCH_SIZE);
    const res = await prisma.alimento.createMany({
      data: lote,
      skipDuplicates: true,
    });
    totalInseridos += res.count;

    // Sincroniza também a tabela legada/secundária Food se existir
    try {
      const foodLote = lote.map((item) => ({
        name: item.nome,
        category: item.categoria,
        basePortion: item.porcaoBase,
        calories: item.calorias,
        proteins: item.proteinas,
        carbohydrates: item.carboidratos,
        fats: item.gorduras,
        fiber: item.fibras,
      }));
      await prisma.food.createMany({
        data: foodLote,
        skipDuplicates: true,
      });
    } catch {
      // Ignora se o modelo Food não estiver em uso ou com restrição
    }
  }

  const totalNoBanco = await prisma.alimento.count();
  console.log(`✅ Carga massiva concluída: ${totalInseridos} novos registros inseridos.`);
  console.log(`📊 Total de alimentos disponíveis na base da Clínica FAAZ: ${totalNoBanco}.`);

  return totalNoBanco;
}

// Execução direta via CLI: npx jiti prisma/seed-taco.ts
if (require.main === module || process.argv[1]?.includes("seed-taco")) {
  carregarTabelaTaco()
    .catch((e) => {
      console.error("❌ Erro no seed da TACO:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
