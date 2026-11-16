import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

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
    backgroundColor: "#FFFFFF",
    paddingTop: 34,
    paddingBottom: 128,
    paddingHorizontal: 40,
    color: "#1E293B",
    position: "relative",
  },
  topAccentPrimary: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: "#0F766E",
  },
  topAccentSecondary: {
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#C8A45D",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    marginBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: "#0F766E",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "48%",
  },
  logoWrap: {
    width: 44,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 4,
  },
  logo: {
    width: 34,
    height: 41,
  },
  brandTextGroup: {
    flexDirection: "column",
    justifyContent: "center",
  },
  clinicTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    letterSpacing: 1.1,
    color: "#0F766E",
  },
  clinicSubtitle: {
    fontSize: 8.5,
    color: "#475569",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  doctorBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
    maxWidth: "50%",
  },
  doctorName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    color: "#0F172A",
    textAlign: "right",
  },
  doctorCrm: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0F766E",
    marginTop: 3,
    textAlign: "right",
  },
  doctorSpecialties: {
    fontSize: 8.2,
    color: "#475569",
    marginTop: 2,
    textAlign: "right",
    lineHeight: 1.3,
  },
  docBannerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  docTypePill: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  docTypePillText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#0F766E",
    letterSpacing: 0.8,
  },
  recordCodeBadge: {
    fontSize: 8.5,
    color: "#64748B",
  },
  patientCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 3.5,
    borderLeftColor: "#0F766E",
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
    color: "#64748B",
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  patientNameValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    color: "#0F172A",
  },
  patientSubValue: {
    fontSize: 8.5,
    color: "#475569",
    marginTop: 3,
  },
  dateValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#0F172A",
    textAlign: "right",
  },
  contentTitleWrap: {
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.75,
    borderBottomColor: "#E2E8F0",
  },
  contentTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: "#134E4A",
  },
  bodyContainer: {
    flexDirection: "column",
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  bodyLine: {
    fontSize: 10.8,
    lineHeight: 1.55,
    color: "#1E293B",
    marginBottom: 2,
  },
  paragraphSpacer: {
    height: 8,
  },
  emptyBodyNotice: {
    fontSize: 10,
    color: "#94A3B8",
    fontStyle: "italic",
  },
  locationDateNote: {
    marginTop: 24,
    fontSize: 9.5,
    color: "#475569",
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "column",
  },
  signatureSection: {
    alignItems: "center",
    marginBottom: 14,
  },
  signatureLine: {
    width: 245,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    marginBottom: 5,
  },
  signatureDoctor: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#0F172A",
  },
  signatureDetails: {
    fontSize: 8.2,
    color: "#475569",
    marginTop: 1.5,
    textAlign: "center",
  },
  signatureHint: {
    fontSize: 7.2,
    color: "#94A3B8",
    marginTop: 2,
  },
  footerContactBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#CBD5E1",
  },
  footerContactText: {
    fontSize: 7.8,
    color: "#64748B",
    maxWidth: "82%",
  },
  pageNumberText: {
    fontSize: 7.8,
    color: "#64748B",
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
  medicoNome = "Dra. Maria Luiza",
  crm = "CRM-MG XXXXX",
  especialidades = "Endocrinologia, Metabologia & Saúde Integrativa",
  clinicaNome = "Clínica FAAZ",
  clinicaSubtitulo = "Medicina & Saúde Integrativa",
  clinicaContato = "Clínica FAAZ Medicina & Saúde Integrativa  •  WhatsApp: (31) 98440-0076",
  logoSrc,
}: PrescriptionPDFProps) {
  const badgeConfig = DOC_BADGES[tipo] || DOC_BADGES.RECEITUARIO;
  const resolvedTitle = tituloDocumento?.trim() || badgeConfig.title;
  const resolvedClinic = clinicaNome.trim() || "Clínica FAAZ";
  const resolvedDoctor = medicoNome.trim() || "Dra. Maria Luiza";
  const resolvedCrm = crm.trim() || "CRM-MG XXXXX";
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
        <View fixed style={styles.topAccentPrimary} />
        <View fixed style={styles.topAccentSecondary} />

        {/* CABEÇALHO FIXO: Logo Clínica FAAZ + Dra. Maria Luiza (Malu) */}
        <View fixed style={styles.header}>
          <View style={styles.brandBlock}>
            {logoSrc ? (
              <View style={styles.logoWrap}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={logoSrc} style={styles.logo} />
              </View>
            ) : null}
            <View style={styles.brandTextGroup}>
              <Text style={styles.clinicTitle}>
                {resolvedClinic.toUpperCase()}
              </Text>
              <Text style={styles.clinicSubtitle}>{clinicaSubtitulo}</Text>
            </View>
          </View>

          <View style={styles.doctorBlock}>
            <Text style={styles.doctorName}>{resolvedDoctor}</Text>
            <Text style={styles.doctorCrm}>{resolvedCrm}</Text>
            <Text style={styles.doctorSpecialties}>{resolvedSpecialties}</Text>
          </View>
        </View>

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
        <View fixed style={styles.footer}>
          <View style={styles.signatureSection}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureDoctor}>{resolvedDoctor}</Text>
            <Text style={styles.signatureDetails}>
              {resolvedCrm}  •  {resolvedSpecialties}
            </Text>
            <Text style={styles.signatureHint}>Assinatura e Carimbo Médico</Text>
          </View>

          <View style={styles.footerContactBar}>
            <Text style={styles.footerContactText}>{clinicaContato}</Text>
            <Text
              style={styles.pageNumberText}
              render={({ pageNumber, totalPages }) =>
                `Página ${pageNumber} de ${totalPages}`
              }
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
