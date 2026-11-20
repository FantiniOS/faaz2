import React from "react";
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { CLINICA_PDF_COLORS } from "@/lib/pdf-clinica-template";

export const clinicaChromeStyles = StyleSheet.create({
  topAccentPrimary: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: CLINICA_PDF_COLORS.primary,
  },
  topAccentSecondary: {
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: CLINICA_PDF_COLORS.gold,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    marginBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: CLINICA_PDF_COLORS.primary,
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
    backgroundColor: CLINICA_PDF_COLORS.tealBg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.tealBorder,
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
    color: CLINICA_PDF_COLORS.primary,
  },
  clinicSubtitle: {
    fontSize: 8.5,
    color: CLINICA_PDF_COLORS.slate600,
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
    color: CLINICA_PDF_COLORS.slate900,
    textAlign: "right",
  },
  doctorCrm: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: CLINICA_PDF_COLORS.primary,
    marginTop: 3,
    textAlign: "right",
  },
  doctorSpecialties: {
    fontSize: 8.2,
    color: CLINICA_PDF_COLORS.slate600,
    marginTop: 2,
    textAlign: "right",
    lineHeight: 1.3,
  },
  signatureSection: {
    alignItems: "center",
    marginBottom: 14,
  },
  signatureSectionInline: {
    alignItems: "center",
    marginTop: 22,
    marginBottom: 8,
    paddingTop: 10,
  },
  locationDateNote: {
    marginBottom: 18,
    fontSize: 9.2,
    color: CLINICA_PDF_COLORS.slate600,
    textAlign: "right",
    width: "100%",
  },
  signatureLine: {
    width: 245,
    borderTopWidth: 1,
    borderTopColor: CLINICA_PDF_COLORS.slate700,
    marginBottom: 5,
  },
  signatureDoctor: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: CLINICA_PDF_COLORS.slate900,
  },
  signatureDetails: {
    fontSize: 8.2,
    color: CLINICA_PDF_COLORS.slate600,
    marginTop: 1.5,
    textAlign: "center",
  },
  signatureHint: {
    fontSize: 7.2,
    color: CLINICA_PDF_COLORS.slate400,
    marginTop: 2,
  },
  footerFixed: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "column",
  },
  footerContactBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: CLINICA_PDF_COLORS.slate300,
  },
  footerContactText: {
    fontSize: 7.8,
    color: CLINICA_PDF_COLORS.slate500,
    maxWidth: "82%",
  },
  pageNumberText: {
    fontSize: 7.8,
    color: CLINICA_PDF_COLORS.slate500,
    textAlign: "right",
  },
});

export interface ClinicaPdfHeaderProps {
  clinicaNome: string;
  clinicaSubtitulo: string;
  logoSrc?: string;
  medicoNome: string;
  crm?: string;
  especialidades: string;
}

export function ClinicaPdfTopAccent() {
  return (
    <>
      <View fixed style={clinicaChromeStyles.topAccentPrimary} />
      <View fixed style={clinicaChromeStyles.topAccentSecondary} />
    </>
  );
}

export function ClinicaPdfHeader({
  clinicaNome,
  clinicaSubtitulo,
  logoSrc,
  medicoNome,
  crm,
  especialidades,
}: ClinicaPdfHeaderProps) {
  return (
    <View fixed style={clinicaChromeStyles.header}>
      <View style={clinicaChromeStyles.brandBlock}>
        {logoSrc ? (
          <View style={clinicaChromeStyles.logoWrap}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={logoSrc} style={clinicaChromeStyles.logo} />
          </View>
        ) : null}
        <View style={clinicaChromeStyles.brandTextGroup}>
          <Text style={clinicaChromeStyles.clinicTitle}>
            {clinicaNome.toUpperCase()}
          </Text>
          <Text style={clinicaChromeStyles.clinicSubtitle}>
            {clinicaSubtitulo}
          </Text>
        </View>
      </View>

      <View style={clinicaChromeStyles.doctorBlock}>
        <Text style={clinicaChromeStyles.doctorName}>{medicoNome}</Text>
        {crm?.trim() ? (
          <Text style={clinicaChromeStyles.doctorCrm}>{crm.trim()}</Text>
        ) : null}
        <Text style={clinicaChromeStyles.doctorSpecialties}>
          {especialidades}
        </Text>
      </View>
    </View>
  );
}

export interface ClinicaPdfSignatureProps {
  medicoNome: string;
  crm?: string;
  especialidades: string;
  localCidade?: string;
  dataEmissao?: string;
  inline?: boolean;
}

export function ClinicaPdfSignatureBlock({
  medicoNome,
  crm,
  especialidades,
  localCidade,
  dataEmissao,
  inline = false,
}: ClinicaPdfSignatureProps) {
  const detailsText = crm?.trim()
    ? `${crm.trim()}  •  ${especialidades}`
    : especialidades;

  return (
    <View
      wrap={false}
      style={
        inline
          ? clinicaChromeStyles.signatureSectionInline
          : clinicaChromeStyles.signatureSection
      }
    >
      {inline && localCidade?.trim() && dataEmissao ? (
        <Text style={clinicaChromeStyles.locationDateNote}>
          {localCidade.trim()}, {dataEmissao}.
        </Text>
      ) : null}
      <View style={clinicaChromeStyles.signatureLine} />
      <Text style={clinicaChromeStyles.signatureDoctor}>{medicoNome}</Text>
      <Text style={clinicaChromeStyles.signatureDetails}>{detailsText}</Text>
      <Text style={clinicaChromeStyles.signatureHint}>
        Assinatura e Carimbo Médico
      </Text>
    </View>
  );
}

export interface ClinicaPdfFooterProps {
  clinicaContato: string;
  /** Em documentos curtos (receitas/atestados) a assinatura fica fixa no rodapé; em planos multi-página fica ao final do conteúdo. */
  signature?: {
    medicoNome: string;
    crm?: string;
    especialidades: string;
  };
  onlyShowPageNumberWhenMultiple?: boolean;
}

export function ClinicaPdfFooter({
  clinicaContato,
  signature,
  onlyShowPageNumberWhenMultiple = false,
}: ClinicaPdfFooterProps) {
  return (
    <View fixed style={clinicaChromeStyles.footerFixed}>
      {signature ? (
        <ClinicaPdfSignatureBlock
          medicoNome={signature.medicoNome}
          crm={signature.crm}
          especialidades={signature.especialidades}
        />
      ) : null}

      <View style={clinicaChromeStyles.footerContactBar}>
        <Text style={clinicaChromeStyles.footerContactText}>
          {clinicaContato}
        </Text>
        <Text
          style={clinicaChromeStyles.pageNumberText}
          render={({ pageNumber, totalPages }) => {
            if (onlyShowPageNumberWhenMultiple && totalPages <= 1) {
              return "";
            }
            return `Página ${pageNumber} de ${totalPages}`;
          }}
        />
      </View>
    </View>
  );
}
