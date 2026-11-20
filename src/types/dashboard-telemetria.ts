export type PeriodoTelemetria = "hoje" | "7d" | "30d" | "mes";

export interface ConsultaProximaItem {
  id: string;
  dataHora: string;
  tipo: string;
  status: string;
  especialidade: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteRecordCode: string;
  medicoNome: string;
}

export interface PilarIndiceItem {
  chave: "dieta" | "hidratacao" | "treinos" | "checkins";
  rotulo: string;
  score: number | null;
  peso: number;
  ativo: boolean;
}

export interface DetalheEmagrecimentoPaciente {
  pacienteId: string;
  nome: string;
  recordCode: string;
  reducaoKg: number;
  pesoAtualKg: number;
  pesoAnteriorKg: number;
}

export interface DetalheHipertrofiaPaciente {
  pacienteId: string;
  nome: string;
  recordCode: string;
  deltaPesoKg: number | null;
  pesoAtualKg: number | null;
  deltaBracoCm: number | null;
  deltaCoxaCm: number | null;
  deltaCinturaCm: number | null;
}

export interface PontoSerieAtividade {
  data: string;
  dataLabel: string;
  totalInteracoes: number;
  dieta: number;
  glicemia: number;
  intestino: number;
  treinos: number;
  pesagens: number;
}

export interface SparklineGlicemiaItem {
  id: string;
  valor: number;
  momento: string;
  dataRegistro: string;
  horaLabel: string;
  pacienteNome: string;
}

export interface PacienteGlicemiaCritica {
  pacienteId: string;
  nome: string;
  recordCode: string;
  cpf: string;
  telefone: string;
  ultimoValor: number;
  momento: string;
  dataRegistro: string;
  tipo: "HIPO" | "HIPER";
  totalAlertas: number;
}

export interface DetalheGlicemiaPaciente {
  pacienteId: string;
  nome: string;
  recordCode: string;
  medicoes: number;
  mediaMgDl: number;
  ultimoValor: number;
  alertasCriticos: number;
  ultimaData: string;
}

export interface DetalheDietaPaciente {
  pacienteId: string;
  nome: string;
  recordCode: string;
  totalCheckins: number;
  percentualAdesao: number | null;
  seguiu: number;
  trocas: number;
  naoFez: number;
  ultimoDia: string;
}

export interface DetalheIntestinoPaciente {
  pacienteId: string;
  nome: string;
  recordCode: string;
  totalRegistros: number;
  ultimoTipo: number;
  padraoPredominante: "ideal" | "constipacao" | "diarreia";
  sintomasRecentes: string[];
  ultimaData: string;
}

export interface DetalheHidratacaoPaciente {
  pacienteId: string;
  nome: string;
  recordCode: string;
  volumeTotalL: number;
  volumeMedioDiarioMl: number;
  metaDiariaMl: number;
  percentual: number;
  diasRegistrados: number;
}

export interface DetalheTreinoPaciente {
  pacienteId: string;
  nome: string;
  recordCode: string;
  diasAtivos: number;
  metaEsperada: number;
  percentualAdesao: number;
  modalidade: string;
}

export interface RadarTriagemItem {
  id: string;
  pacienteId: string;
  nome: string;
  recordCode: string;
  cpf: string;
  telefone: string;
  severidade: "CRITICO" | "ATENCAO" | "EVASAO";
  categoria: "GLICEMIA" | "INTESTINO" | "EVASAO" | "DIETA";
  motivo: string;
  detalhe: string;
  ultimoSinalEm: string | null;
}

export interface LiveFeedItem {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  pacienteRecordCode: string;
  tipo:
    | "PESAGEM"
    | "DIETA"
    | "GLICEMIA"
    | "INTESTINO"
    | "MEDIDAS"
    | "TREINO"
    | "HIDRATACAO";
  titulo: string;
  resumo: string;
  severidade: "normal" | "positivo" | "atencao" | "critico";
  timestamp: string;
}

export interface TelemetriaDashboardResponse {
  success: boolean;
  periodo: PeriodoTelemetria;
  periodoLabel: string;
  diasJanela: number;
  geradoEm: string;
  resumo: {
    totalPacientesAtivos: number;
    ativosNoPeriodo: number;
    taxaEngajamento: number;
    indiceClinicoGlobal: number | null;
    pilaresIndice: PilarIndiceItem[];
    consultasAgendadas: {
      hoje: number;
      proximos7Dias: number;
      proximas: ConsultaProximaItem[];
    };
  };
  impactoCorporal: {
    emagrecimento: {
      totalEliminadoKg: number;
      mediaPorPacienteKg: number;
      maiorReducaoKg: number;
      maiorReducaoPacienteNome: string | null;
      pacientesComReducao: number;
      totalPacientesPerfil: number;
      periodoAnteriorKg: number | null;
      deltaAnteriorPct: number | null;
      temBaseAnterior: boolean;
      detalhes: DetalheEmagrecimentoPaciente[];
    };
    hipertrofia: {
      totalPacientesAtivos: number;
      evolucaoPonderalMediaKg: number | null;
      pacientesComGanho: number;
      variacaoMediaCinturaCm: number | null;
      variacaoMediaBracoCm: number | null;
      variacaoMediaCoxaCm: number | null;
      detalhes: DetalheHipertrofiaPaciente[];
    };
  };
  serieAtividade: PontoSerieAtividade[];
  glicemia: {
    totalMedicoes: number;
    mediaMgDl: number | null;
    alertasCriticos: number;
    episodiosHipo: number;
    episodiosHiper: number;
    timeInRange: {
      hipoPct: number;
      metaPct: number;
      hiperPct: number;
    };
    sparkline: SparklineGlicemiaItem[];
    pacientesCriticos: PacienteGlicemiaCritica[];
    detalhesPorPaciente: DetalheGlicemiaPaciente[];
  };
  dieta: {
    totalCheckins: number;
    percentualAdesao: number | null;
    seguiuPct: number;
    trocaInteligentePct: number;
    naoFezPct: number;
    seguiuCount: number;
    trocaInteligenteCount: number;
    naoFezCount: number;
    opcionaisBonus: number;
    gargaloPrincipal: {
      refeicaoId: string;
      nome: string;
      horario: string | null;
      label: string;
      totalRegistros: number;
      naoFez: number;
      percentualAdesao: number;
    } | null;
    detalhesPorPaciente: DetalheDietaPaciente[];
  };
  intestino: {
    totalRegistros: number;
    distribuicao: {
      ideal: number;
      constipacao: number;
      diarreia: number;
      idealPct: number;
      constipacaoPct: number;
      diarreiaPct: number;
    };
    histograma: {
      tipo1: number;
      tipo2: number;
      tipo3: number;
      tipo4: number;
      tipo5: number;
      tipo6: number;
      tipo7: number;
    };
    detalhesPorPaciente: DetalheIntestinoPaciente[];
  };
  hidratacaoETreinos: {
    hidratacao: {
      totalRegistros: number;
      totalConsumidoL: number;
      metaTotalL: number;
      percentualAderencia: number | null;
      pacientesRegistraram: number;
      detalhesPorPaciente: DetalheHidratacaoPaciente[];
    };
    treinos: {
      totalLogs: number;
      diasAtivosTotal: number;
      metaTotalEsperada: number;
      percentualAdesao: number | null;
      pacientesAtivosTreino: number;
      detalhesPorPaciente: DetalheTreinoPaciente[];
    };
  };
  radarTriagem: RadarTriagemItem[];
  liveFeed: LiveFeedItem[];
}
