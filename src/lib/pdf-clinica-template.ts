import type { UsuarioLogado } from "@/contexts/AuthContext";
import { formatarDataBR } from "@/lib/date-br";

/**
 * Paleta institucional unificada para todos os PDFs clínicos da Clínica FAAZ
 * (Receitas, Pedidos de Exames, Atestados e Planos Alimentares).
 */
export const CLINICA_PDF_COLORS = {
  primary: "#0F766E",
  primaryDark: "#134E4A",
  gold: "#C8A45D",
  tealBg: "#F0FDFA",
  tealBorder: "#CCFBF1",
  tealPillBorder: "#99F6E4",
  slate900: "#0F172A",
  slate800: "#1E293B",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748B",
  slate400: "#94A3B8",
  slate300: "#CBD5E1",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  white: "#FFFFFF",
  amberBg: "#FFFBEB",
  amberBorder: "#FDE68A",
  amberText: "#92400E",
  purpleBg: "#FAF5FF",
  purpleBorder: "#E9D5FF",
  purpleText: "#7E22CE",
  emeraldBg: "#ECFDF5",
  emeraldBorder: "#A7F3D0",
  emeraldText: "#065F46",
  roseText: "#BE123C",
} as const;

export interface ResolvedDoctorProfile {
  medicoNome: string;
  crm: string;
  especialidades: string;
  clinicaNome: string;
  clinicaSubtitulo: string;
  localCidade: string;
  clinicaContato: string;
}

const DEFAULT_CLINIC_NAME = "Clínica FAAZ";
const DEFAULT_CLINIC_SUBTITLE = "Medicina & Saúde Integrativa";
const DEFAULT_SPECIALTIES = "Endocrinologia, Metabologia & Saúde Integrativa";
const DEFAULT_LOCAL_CITY = "Belo Horizonte - MG";
const DEFAULT_CLINIC_WHATSAPP = "(31) 98440-0076";

/**
 * Resolve dinamicamente os dados institucionais e do profissional logado
 * sem nomes de médicos hardcoded.
 */
export function resolveDoctorProfile(
  usuario: UsuarioLogado | null | undefined,
): ResolvedDoctorProfile {
  const clinicaNome = usuario?.clinicaNome?.trim() || DEFAULT_CLINIC_NAME;
  const clinicaContato = `${clinicaNome} ${DEFAULT_CLINIC_SUBTITLE}  •  WhatsApp: ${DEFAULT_CLINIC_WHATSAPP}`;

  const rawName = (usuario?.fullName || usuario?.nome || "").trim();
  const rawTitle = (usuario?.title || "").trim();

  let medicoNome = "Corpo Clínico";
  if (rawName) {
    if (
      rawTitle &&
      !rawName.toLowerCase().startsWith(rawTitle.toLowerCase())
    ) {
      medicoNome = `${rawTitle} ${rawName}`;
    } else {
      medicoNome = rawName;
    }
  } else if (rawTitle) {
    medicoNome = rawTitle;
  }

  const councilNumber = usuario?.councilNumber?.trim() || "";
  const councilType = usuario?.councilType?.trim() || "CRM";
  const crm = councilNumber ? `${councilType} ${councilNumber}` : "";

  const especialidades =
    usuario?.specialty?.trim() || DEFAULT_SPECIALTIES;

  return {
    medicoNome,
    crm,
    especialidades,
    clinicaNome,
    clinicaSubtitulo: DEFAULT_CLINIC_SUBTITLE,
    localCidade: DEFAULT_LOCAL_CITY,
    clinicaContato,
  };
}

export function getClinicaLogoUrl(): string {
  return typeof window !== "undefined"
    ? `${window.location.origin}/logo-faaz.png`
    : "/logo-faaz.png";
}

/**
 * Gera o nome de arquivo padronizado para o Plano Alimentar em PDF:
 * Plano_Alimentar_<NomePaciente>_<DD-MM-AAAA>.pdf
 */
export function formatarNomeArquivoPlanoAlimentar(
  pacienteNome: string,
  data: Date = new Date(),
): string {
  const nomeSanitizado = (pacienteNome || "Paciente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  const dataBr = formatarDataBR(data).replace(/\//g, "-");
  return `Plano_Alimentar_${nomeSanitizado || "Paciente"}_${dataBr}.pdf`;
}

/**
 * Formata quantidade + unidade + medida caseira em leitura natural para o paciente.
 * Ex.: medidaCaseira="2 fatias", quantidade=50, unidade="g" -> "2 fatias (50g)"
 */
export function formatarPorcaoPdf(
  quantidade: number,
  unidade?: string | null,
  medidaCaseira?: string | null,
): { destaque: string; complemento: string | null } {
  const qtdNum = Number(quantidade);
  const qtdFmt = Number.isFinite(qtdNum)
    ? Number.isInteger(qtdNum)
      ? String(qtdNum)
      : qtdNum.toFixed(1).replace(".", ",")
    : "0";
  const un = (unidade || "g").trim();
  const qtdComUnidade =
    un === "g" || un === "ml" ? `${qtdFmt}${un}` : `${qtdFmt} ${un}`;

  const medida = (medidaCaseira || "").trim();
  if (medida) {
    const medidaNorm = medida.toLowerCase().replace(/\s+/g, "");
    const qtdNorm = qtdComUnidade.toLowerCase().replace(/\s+/g, "");
    if (medidaNorm.includes(qtdNorm)) {
      return { destaque: medida, complemento: null };
    }
    return { destaque: medida, complemento: `(${qtdComUnidade})` };
  }

  return { destaque: qtdComUnidade, complemento: null };
}

/**
 * Monta URL pronta de WhatsApp (https://wa.me/55...) com mensagem amigável
 * para envio do Plano Alimentar Individualizado ao paciente.
 */
export function buildWhatsAppPlanoUrl(
  telefone?: string | null,
  pacienteNome?: string | null,
  clinicaNome?: string | null,
): string | null {
  const digitsRaw = (telefone || "").replace(/\D/g, "");
  if (digitsRaw.length < 10) return null;

  const digits =
    digitsRaw.length === 10 || digitsRaw.length === 11
      ? `55${digitsRaw}`
      : digitsRaw;

  const primeiroNome =
    (pacienteNome || "").trim().split(/\s+/)[0] || "paciente";
  const clinica = (clinicaNome || DEFAULT_CLINIC_NAME).trim();

  const mensagem = `Olá ${primeiroNome}, segue seu Plano Alimentar Individualizado da ${clinica}! Qualquer dúvida sobre as refeições ou substituições, estou à disposição.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(mensagem)}`;
}
