import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import { CLINICA_PDF_COLORS } from "@/lib/pdf-clinica-template";
import {
  ClinicaPdfFooter,
  ClinicaPdfHeader,
  ClinicaPdfTopAccent,
} from "@/components/PdfClinicaChrome";

export type TipoDocumentoMedico = "RECEITUARIO" | "EXAMES" | "ATESTADO";

export interface PrescriptionPDFProps {
  tipo: TipoDocumentoMedico;
  tituloDocumento?: string;
  conteudo: string;
  pacienteNome: string;
  pacienteCpf?: string | null;
  pacienteRecordCode?: string | null;
  dataEmissao: string;
  localCidade?: string;
  medicoNome?: string;
  crm?: string;
  especialidades?: string;
  clinicaNome?: string;
  clinicaSubtitulo?: string;
  clinicaContato?: string;
  logoSrc?: string;
}

const DOC_BADGES: Record<TipoDocumentoMedico, { label: string; title: string }> = {
  RECEITUARIO: {
    label: "RECEITUÁRIO MÉDICO",
    title: "Prescrição Médica Individualizada",
  },
  EXAMES: {
    label: "SOLICITAÇÃO DE EXAMES",
    title: "Pedido de Exames Laboratoriais e Diagnósticos",
  },
  ATESTADO: {
    label: "ATESTADO MÉDICO",
    title: "Declaração e Atestado Clínico",
  },
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: CLINICA_PDF_COLORS.white,
    paddingTop: 34,
    paddingBottom: 128,
    paddingHorizontal: 40,
    color: CLINICA_PDF_COLORS.slate800,
    position: "relative",
  },
  docBannerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  docTypePill: {
    backgroundColor: CLINICA_PDF_COLORS.tealBg,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.tealPillBorder,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  docTypePillText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: CLINICA_PDF_COLORS.primary,
    letterSpacing: 0.8,
  },
  recordCodeBadge: {
    fontSize: 8.5,
    color: CLINICA_PDF_COLORS.slate500,
  },
  patientCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: CLINICA_PDF_COLORS.slate50,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderLeftWidth: 3.5,
    borderLeftColor: CLINICA_PDF_COLORS.primary,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  patientMainCol: {
    flex: 1,
    paddingRight: 14,
  },
  patientDateCol: {
    alignItems: "flex-end",
    minWidth: 110,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: CLINICA_PDF_COLORS.slate500,
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  patientNameValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    color: CLINICA_PDF_COLORS.slate900,
  },
  patientSubValue: {
    fontSize: 8.5,
    color: CLINICA_PDF_COLORS.slate600,
    marginTop: 3,
  },
  dateValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: CLINICA_PDF_COLORS.slate900,
    textAlign: "right",
  },
  contentTitleWrap: {
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: CLINICA_PDF_COLORS.slate200,
  },
  contentTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: CLINICA_PDF_COLORS.primaryDark,
  },
  bodyContainer: {
    flexDirection: "column",
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  bodyLine: {
    fontSize: 10.8,
    lineHeight: 1.55,
    color: CLINICA_PDF_COLORS.slate800,
    marginBottom: 2,
  },
  paragraphSpacer: {
    height: 8,
  },
  emptyBodyNotice: {
    fontSize: 10,
    color: CLINICA_PDF_COLORS.slate400,
    fontStyle: "italic",
  },
  locationDateNote: {
    marginTop: 24,
    fontSize: 9.5,
    color: CLINICA_PDF_COLORS.slate600,
    textAlign: "right",
  },
});

export function PrescriptionPDF({
  tipo,
  tituloDocumento,
  conteudo,
  pacienteNome,
  pacienteCpf,
  pacienteRecordCode,
  dataEmissao,
  localCidade,
  medicoNome = "Corpo Clínico",
  crm = "",
  especialidades = "Endocrinologia, Metabologia & Saúde Integrativa",
  clinicaNome = "Clínica FAAZ",
  clinicaSubtitulo = "Medicina & Saúde Integrativa",
  clinicaContato = "Clínica FAAZ Medicina & Saúde Integrativa  •  WhatsApp: (31) 98440-0076",
  logoSrc,
}: PrescriptionPDFProps) {
  const badgeConfig = DOC_BADGES[tipo] || DOC_BADGES.RECEITUARIO;
  const resolvedTitle = tituloDocumento?.trim() || badgeConfig.title;
  const resolvedClinic = clinicaNome.trim() || "Clínica FAAZ";
  const resolvedDoctor = medicoNome.trim() || "Corpo Clínico";
  const resolvedCrm = crm.trim();
  const resolvedSpecialties =
    especialidades.trim() || "Endocrinologia, Metabologia & Saúde Integrativa";

  const lines = conteudo.replace(/\r\n/g, "\n").split("\n");
  const hasContent = conteudo.trim().length > 0;

  return (
    <Document
      title={`${badgeConfig.label} - ${pacienteNome}`}
      author={resolvedDoctor}
      subject={resolvedTitle}
      creator="Clínica FAAZ Prontuário Digital"
    >
      <Page size="A4" style={styles.page}>
        {/* Faixa institucional fixa no topo de todas as páginas */}
        <ClinicaPdfTopAccent />

        {/* CABEÇALHO FIXO: Logo Clínica FAAZ + Profissional Responsável */}
        <ClinicaPdfHeader
          clinicaNome={resolvedClinic}
          clinicaSubtitulo={clinicaSubtitulo}
          logoSrc={logoSrc}
          medicoNome={resolvedDoctor}
          crm={resolvedCrm}
          especialidades={resolvedSpecialties}
        />

        {/* IDENTIFICAÇÃO DO DOCUMENTO */}
        <View style={styles.docBannerRow}>
          <View style={styles.docTypePill}>
            <Text style={styles.docTypePillText}>{badgeConfig.label}</Text>
          </View>
          {pacienteRecordCode ? (
            <Text style={styles.recordCodeBadge}>
              Prontuário: {pacienteRecordCode}
            </Text>
          ) : null}
        </View>

        {/* BLOCO DE DADOS DO PACIENTE (Nome e Data) */}
        <View style={styles.patientCard}>
          <View style={styles.patientMainCol}>
            <Text style={styles.metaLabel}>PACIENTE</Text>
            <Text style={styles.patientNameValue}>
              {pacienteNome.trim() || "Paciente não identificado"}
            </Text>
            {pacienteCpf ? (
              <Text style={styles.patientSubValue}>CPF: {pacienteCpf}</Text>
            ) : null}
          </View>

          <View style={styles.patientDateCol}>
            <Text style={styles.metaLabel}>DATA DE EMISSÃO</Text>
            <Text style={styles.dateValue}>{dataEmissao}</Text>
          </View>
        </View>

        {/* TÍTULO CENTRAL DO DOCUMENTO */}
        <View style={styles.contentTitleWrap}>
          <Text style={styles.contentTitle}>{resolvedTitle}</Text>
        </View>

        {/* CORPO DINÂMICO (Receituário, Pedido de Exame ou Atestado) */}
        <View style={styles.bodyContainer}>
          {hasContent ? (
            lines.map((line, idx) =>
              line.trim().length === 0 ? (
                <View key={`sp-${idx}`} style={styles.paragraphSpacer} />
              ) : (
                <Text key={`ln-${idx}`} style={styles.bodyLine}>
                  {line}
                </Text>
              )
            )
          ) : (
            <Text style={styles.emptyBodyNotice}>
              Conteúdo clínico não preenchido.
            </Text>
          )}

          {localCidade?.trim() ? (
            <Text style={styles.locationDateNote}>
              {localCidade.trim()}, {dataEmissao}.
            </Text>
          ) : null}
        </View>

        {/* RODAPÉ FIXO: Assinatura / Carimbo e Contato da Clínica */}
        <ClinicaPdfFooter
          clinicaContato={clinicaContato}
          signature={{
            medicoNome: resolvedDoctor,
            crm: resolvedCrm,
            especialidades: resolvedSpecialties,
          }}
        />
      </Page>
    </Document>
  );
}
