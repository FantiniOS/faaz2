/**
 * Conteúdo legal unificado — Termos de Uso e Política de Privacidade (LGPD / CFM)
 * Versão 1.0 — Espelho exato de src/lib/termos-privacidade.ts para paridade Web & Mobile.
 */

export const VERSAO_ATUAL_TERMOS = "1.0";
export const DATA_VIGENCIA_TERMOS = "Novembro de 2026";
export const URL_PRIVACIDADE_WEB = "https://faaz2.vercel.app/privacidade";
export const WHATSAPP_CLINICA_EXIBICAO = "(31) 98440-0076";

export interface SecaoTermosPrivacidade {
  numero: number;
  id: string;
  titulo: string;
  destaque?: "emergencia";
  paragrafos: string[];
  topicos?: string[];
}

export const AVISO_EMERGENCIA_TERMOS = {
  titulo: "Aviso Importante — Não é Canal de Urgência ou Emergência",
  resumoCurto:
    "Este aplicativo é para acompanhamento clínico entre consultas e NÃO substitui atendimento de urgência ou emergência (em caso de mal-estar agudo, procure pronto-socorro ou ligue 192).",
  textoCompleto:
    "O aplicativo da Clínica FAAZ (FRdoc 2.0) destina-se exclusivamente ao acompanhamento clínico e nutricional entre consultas agendadas. Ele NÃO realiza monitoramento médico em tempo real, NÃO aciona socorro automático e NÃO substitui avaliação presencial. Diante de qualquer urgência ou emergência médica — como hipoglicemia grave, hiperglicemia sintomática, dor no peito, falta de ar ou mal-estar agudo — procure imediatamente o pronto-socorro mais próximo ou acione o SAMU pelo telefone 192.",
} as const;

export const SECOES_TERMOS_PRIVACIDADE: readonly SecaoTermosPrivacidade[] = [
  {
    numero: 1,
    id: "controlador-finalidade",
    titulo: "Identificação do Controlador e Finalidade do Aplicativo",
    paragrafos: [
      "A Clínica FAAZ — Medicina & Saúde Integrativa atua como Controladora dos dados pessoais tratados no ecossistema FRdoc 2.0, em conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018) e com as normas do Conselho Federal de Medicina (CFM).",
      "Este aplicativo foi desenvolvido exclusivamente para pacientes atendidos pela Clínica FAAZ com a finalidade de apoiar o acompanhamento clínico, metabólico e nutricional entre consultas presenciais ou online, permitindo visualizar prescrições, acompanhar agendamentos e registrar hábitos e parâmetros de saúde compartilhados com sua equipe assistencial.",
    ],
  },
  {
    numero: 2,
    id: "nao-urgencia",
    titulo: "Aviso Crítico — Não é Canal de Urgência ou Emergência",
    destaque: "emergencia",
    paragrafos: [
      "O aplicativo FRdoc 2.0 não realiza plantão nem monitoramento em tempo real dos registros enviados. Informações inseridas pelo paciente são analisadas pela equipe médica durante o acompanhamento programado e nas consultas clínicas.",
      "Em situações de urgência ou emergência médica — incluindo hipoglicemia grave, hiperglicemia persistente ou sintomática, tontura intensa, desmaio, reações adversas agudas ou qualquer mal-estar súbito — não aguarde resposta pelo aplicativo: procure imediatamente um serviço de pronto-socorro ou ligue para o SAMU (192).",
    ],
  },
  {
    numero: 3,
    id: "dados-coletados",
    titulo: "Dados Pessoais e Dados Sensíveis de Saúde Coletados (LGPD)",
    paragrafos: [
      "Para viabilizar o cuidado clínico contínuo e a comunicação com a clínica, tratamos exclusivamente os dados necessários à prestação dos serviços de saúde:",
    ],
    topicos: [
      "Dados cadastrais e de identificação: nome completo, CPF, código de prontuário, telefone/WhatsApp, e-mail e foto de perfil opcional.",
      "Dados clínicos e registros de saúde (dados sensíveis — Art. 5º, II e Art. 11, II, 'f' da LGPD): peso corporal, bioimpedância, medidas antropométricas, plano alimentar e adesão às refeições, hidratação diária, prática de treinos, registros intestinais, medições de glicemia capilar, doses de insulina (quando prescritas), medicações em uso, metas clínicas e histórico de agendamentos.",
      "Registro de aceite: versão dos Termos de Uso e Política de Privacidade aceita e data/hora do consentimento, para fins de transparência e auditoria.",
    ],
  },
  {
    numero: 4,
    id: "sigilo-acesso-seguranca",
    titulo: "Sigilo Médico, Acesso Restrito e Segurança da Informação",
    paragrafos: [
      "Todos os dados clínicos são protegidos por sigilo profissional médico e controle rigoroso de acesso por perfil (RBAC — Role-Based Access Control). A equipe administrativa e de recepção acessa apenas dados cadastrais e de agenda, sendo tecnicamente bloqueada de visualizar prontuários, evoluções, exames, dietas ou registros médicos.",
      "Os dados são armazenados em infraestrutura de nuvem de alta segurança (Oracle Cloud Infrastructure — região São Paulo, Brasil) com criptografia em trânsito (TLS) e controles de autenticação dedicados.",
      "A Clínica FAAZ jamais vende, aluga ou compartilha seus dados pessoais ou de saúde com terceiros para fins comerciais, publicitários ou de marketing.",
    ],
  },
  {
    numero: 5,
    id: "retencao-prontuario-cfm",
    titulo: "Retenção Legal e Guarda do Prontuário Médico (CFM)",
    paragrafos: [
      "Os dados clínicos e registros de acompanhamento vinculados ao seu atendimento integram a documentação médica da Clínica FAAZ e estão sujeitos às obrigações legais e regulatórias da área da saúde.",
      "Mesmo que você opte por deixar de utilizar o aplicativo ou solicite a desativação do seu acesso digital, o prontuário médico e os registros assistenciais deverão permanecer armazenados com segurança pelo prazo legal mínimo determinado pela Lei nº 13.787/2018 e pelas Resoluções vigentes do Conselho Federal de Medicina (mínimo de 20 anos a partir do último registro, conforme aplicável).",
    ],
  },
  {
    numero: 6,
    id: "direitos-titular-contato",
    titulo: "Direitos do Titular (LGPD) e Canal de Atendimento",
    paragrafos: [
      "Nos termos do Art. 18 da LGPD, você tem direito a confirmar a existência de tratamento, acessar seus dados, solicitar informações sobre o uso e o compartilhamento, atualizar seus dados cadastrais e revogar o uso do aplicativo quando desejar.",
      "Você pode atualizar diretamente no aplicativo, a qualquer momento, seu número de WhatsApp e seu e-mail na aba Clínica (card Dados do Paciente & Conta). Alterações em nome, CPF ou demais dados oficiais do prontuário devem ser solicitadas à recepção para validação documental.",
      `Para exercer seus direitos como titular de dados, esclarecer dúvidas sobre privacidade ou solicitar apoio administrativo, entre em contato com os canais oficiais da Clínica FAAZ pelo WhatsApp ${WHATSAPP_CLINICA_EXIBICAO}.`,
    ],
  },
] as const;
