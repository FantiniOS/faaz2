import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { CLINICA_PDF_COLORS } from "@/lib/pdf-clinica-template";
import {
  ClinicaPdfFooter,
  ClinicaPdfHeader,
  ClinicaPdfSignatureBlock,
  ClinicaPdfTopAccent,
} from "@/components/PdfClinicaChrome";
import {
  classificarGlicemiaMapa,
  formatarUI,
  resumirEtiquetaProtocolo,
  SLOTS_MAPA_ORDER,
  SLOT_META,
  type LinhaMapaGlicemicoDTO,
  type MediasPorColunaMapa,
  type ProtocoloGlicemicoDTO,
  type ResumoMapaGlicemicoDTO,
  type StatusCelulaGlicemia,
} from "@/lib/mapa-glicemico";

export interface MapaGlicemicoPDFProps {
  pacienteNome: string;
  pacienteRecordCode?: string | null;
  dias: number;
  dataEmissao: string;
  localCidade?: string;
  medicoNome: string;
  crm?: string;
  especialidades: string;
  clinicaNome: string;
  clinicaSubtitulo?: string;
  clinicaContato: string;
  logoSrc?: string;
  protocolo: ProtocoloGlicemicoDTO;
  resumo: ResumoMapaGlicemicoDTO;
  linhas: LinhaMapaGlicemicoDTO[];
  mediasPorColuna: MediasPorColunaMapa;
}

function getStatusPdfColors(status: StatusCelulaGlicemia): {
  bg: string;
  border: string;
  text: string;
} {
  switch (status) {
    case "HIPO":
      return {
        bg: "#FFE4E6",
        border: "#FDA4AF",
        text: "#9F1239",
      };
    case "ALVO":
      return {
        bg: "#ECFDF5",
        border: "#A7F3D0",
        text: "#065F46",
      };
    case "ATENCAO":
      return {
        bg: "#FFFBEB",
        border: "#FDE68A",
        text: "#92400E",
      };
    case "HIPER":
      return {
        bg: "#E11D48",
        border: "#BE123C",
        text: "#FFFFFF",
      };
  }
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: CLINICA_PDF_COLORS.white,
    paddingTop: 34,
    paddingBottom: 56,
    paddingHorizontal: 36,
    color: CLINICA_PDF_COLORS.slate800,
    position: "relative",
  },
  docBannerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
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
    letterSpacing: 0.7,
  },
  recordCodeBadge: {
    fontSize: 8.2,
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
    paddingVertical: 9,
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  patientMainCol: {
    flex: 1,
    paddingRight: 12,
  },
  patientRightCol: {
    alignItems: "flex-end",
    minWidth: 118,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: CLINICA_PDF_COLORS.slate500,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  patientNameValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: CLINICA_PDF_COLORS.slate900,
  },
  patientMetaRow: {
    fontSize: 8.2,
    color: CLINICA_PDF_COLORS.slate600,
    marginTop: 2.5,
    lineHeight: 1.3,
  },
  patientMetaBold: {
    fontFamily: "Helvetica-Bold",
    color: CLINICA_PDF_COLORS.slate800,
  },
  dateValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: CLINICA_PDF_COLORS.slate900,
    textAlign: "right",
  },
  kpiStrip: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: CLINICA_PDF_COLORS.slate50,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  kpiLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    color: CLINICA_PDF_COLORS.slate500,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: CLINICA_PDF_COLORS.slate900,
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 6.8,
    color: CLINICA_PDF_COLORS.slate500,
    marginTop: 1,
  },
  tableWrap: {
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 10,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: CLINICA_PDF_COLORS.slate100,
    borderBottomWidth: 1,
    borderBottomColor: CLINICA_PDF_COLORS.slate300,
    alignItems: "center",
    minHeight: 22,
  },
  tableDataRow: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: CLINICA_PDF_COLORS.slate200,
    alignItems: "stretch",
    minHeight: 24,
  },
  tableFooterRow: {
    flexDirection: "row",
    backgroundColor: CLINICA_PDF_COLORS.tealBg,
    borderTopWidth: 1,
    borderTopColor: CLINICA_PDF_COLORS.tealPillBorder,
    alignItems: "center",
    minHeight: 24,
  },
  colDate: {
    width: 58,
    paddingVertical: 4,
    paddingHorizontal: 6,
    justifyContent: "center",
    borderRightWidth: 0.6,
    borderRightColor: CLINICA_PDF_COLORS.slate200,
  },
  colSlot: {
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 3,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 0.6,
    borderRightColor: CLINICA_PDF_COLORS.slate200,
  },
  colBasal: {
    width: 54,
    paddingVertical: 3,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  thText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.2,
    color: CLINICA_PDF_COLORS.slate700,
    textAlign: "center",
  },
  dateCellMain: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.8,
    color: CLINICA_PDF_COLORS.slate900,
  },
  dateCellSub: {
    fontSize: 6.5,
    color: CLINICA_PDF_COLORS.slate500,
  },
  cellPill: {
    width: "100%",
    borderRadius: 3.5,
    borderWidth: 0.8,
    paddingVertical: 2.5,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  cellValueText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.6,
  },
  cellSubLine: {
    fontSize: 6.2,
    marginTop: 0.5,
  },
  cellInsulinTag: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.2,
    marginTop: 1,
  },
  emptyCellDash: {
    fontSize: 8,
    color: CLINICA_PDF_COLORS.slate300,
  },
  basalBadge: {
    backgroundColor: "#EEF2FF",
    borderWidth: 0.8,
    borderColor: "#C7D2FE",
    borderRadius: 3.5,
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    alignItems: "center",
    width: "100%",
  },
  basalValueText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.6,
    color: "#3730A3",
  },
  basalSubText: {
    fontSize: 6,
    color: "#4F46E5",
  },
  footerAvgLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: CLINICA_PDF_COLORS.primaryDark,
  },
  footerAvgValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.6,
    color: CLINICA_PDF_COLORS.primaryDark,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  legendText: {
    fontSize: 7.2,
    color: CLINICA_PDF_COLORS.slate500,
  },
  guidanceCard: {
    backgroundColor: CLINICA_PDF_COLORS.slate50,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  guidanceTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.6,
    color: CLINICA_PDF_COLORS.primaryDark,
    marginBottom: 3,
  },
  guidanceLine: {
    fontSize: 7.5,
    color: CLINICA_PDF_COLORS.slate700,
    marginTop: 1.5,
    lineHeight: 1.3,
  },
});

export function MapaGlicemicoPDF({
  pacienteNome,
  pacienteRecordCode,
  dias,
  dataEmissao,
  localCidade = "Belo Horizonte - MG",
  medicoNome,
  crm,
  especialidades,
  clinicaNome,
  clinicaSubtitulo = "Medicina & Saúde Integrativa",
  clinicaContato,
  logoSrc,
  protocolo,
  resumo,
  linhas,
  mediasPorColuna,
}: MapaGlicemicoPDFProps) {
  const mostrarColunaBasal =
    protocolo.usaInsulina ||
    linhas.some((l) => l.basalDoses && l.basalDoses.length > 0);

  const alvos = {
    alvoJejumMin: protocolo.alvoJejumMin,
    alvoJejumMax: protocolo.alvoJejumMax,
    alvoPosMax: protocolo.alvoPosMax,
  };

  const descricaoInsulinas: string[] = [];
  if (protocolo.usaInsulina) {
    if (protocolo.insulinaBasalNome || protocolo.insulinaBasalDoseRef) {
      const partes = [
        protocolo.insulinaBasalNome || "Basal",
        protocolo.insulinaBasalDoseRef
          ? formatarUI(protocolo.insulinaBasalDoseRef)
          : null,
        protocolo.insulinaBasalHorario
          ? `(${protocolo.insulinaBasalHorario})`
          : null,
      ].filter(Boolean);
      descricaoInsulinas.push(`Basal: ${partes.join(" ")}`);
    }
    if (protocolo.insulinaRapidaNome) {
      descricaoInsulinas.push(`Rápida: ${protocolo.insulinaRapidaNome}`);
    }
  }

  return (
    <Document
      title={`Mapa Glicêmico - ${pacienteNome}`}
      author={medicoNome}
      subject="Mapa Glicêmico e Controle de Insulina"
    >
      <Page size="A4" style={styles.page}>
        <ClinicaPdfTopAccent />

        <ClinicaPdfHeader
          clinicaNome={clinicaNome}
          clinicaSubtitulo={clinicaSubtitulo}
          logoSrc={logoSrc}
          medicoNome={medicoNome}
          crm={crm}
          especialidades={especialidades}
        />

        {/* Banner do Documento */}
        <View style={styles.docBannerRow}>
          <View style={styles.docTypePill}>
            <Text style={styles.docTypePillText}>
              MAPA GLICÊMICO & CONTROLE DE INSULINA • {dias} DIAS
            </Text>
          </View>
          {pacienteRecordCode ? (
            <Text style={styles.recordCodeBadge}>
              Prontuário: {pacienteRecordCode}
            </Text>
          ) : null}
        </View>

        {/* Dados do Paciente e Protocolo */}
        <View style={styles.patientCard}>
          <View style={styles.patientMainCol}>
            <Text style={styles.metaLabel}>PACIENTE</Text>
            <Text style={styles.patientNameValue}>{pacienteNome}</Text>
            <Text style={styles.patientMetaRow}>
              <Text style={styles.patientMetaBold}>Protocolo: </Text>
              {resumirEtiquetaProtocolo(protocolo)} • Alvo Jejum/Pré:{" "}
              {protocolo.alvoJejumMin}–{protocolo.alvoJejumMax} mg/dL • Alvo
              Pós-Refeição: ≤{protocolo.alvoPosMax} mg/dL
            </Text>
            {descricaoInsulinas.length > 0 ? (
              <Text style={styles.patientMetaRow}>
                <Text style={styles.patientMetaBold}>Esquema de Insulina: </Text>
                {descricaoInsulinas.join("  •  ")}
              </Text>
            ) : null}
          </View>

          <View style={styles.patientRightCol}>
            <Text style={styles.metaLabel}>EMISSÃO</Text>
            <Text style={styles.dateValue}>{dataEmissao}</Text>
            <Text style={styles.patientMetaRow}>
              {resumo.totalMedicoes} medições no período
            </Text>
          </View>
        </View>

        {/* KPIs Consolidados */}
        <View style={styles.kpiStrip}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Média Jejum</Text>
            <Text style={styles.kpiValue}>
              {resumo.mediaJejum !== null ? `${resumo.mediaJejum} mg/dL` : "--"}
            </Text>
            <Text style={styles.kpiSub}>
              Alvo {protocolo.alvoJejumMin}–{protocolo.alvoJejumMax}
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Média Pós-Prandial</Text>
            <Text style={styles.kpiValue}>
              {resumo.mediaPosPrandial !== null
                ? `${resumo.mediaPosPrandial} mg/dL`
                : "--"}
            </Text>
            <Text style={styles.kpiSub}>Alvo ≤{protocolo.alvoPosMax}</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Tempo no Alvo</Text>
            <Text
              style={[
                styles.kpiValue,
                { color: CLINICA_PDF_COLORS.emeraldText },
              ]}
            >
              {resumo.percentualNoAlvo !== null
                ? `${resumo.percentualNoAlvo}%`
                : "--"}
            </Text>
            <Text style={styles.kpiSub}>
              Média geral:{" "}
              {resumo.mediaGeral !== null ? `${resumo.mediaGeral} mg/dL` : "--"}
            </Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Hipo / Hiper (&gt;250)</Text>
            <Text
              style={[
                styles.kpiValue,
                resumo.episodiosHipo > 0 || resumo.episodiosHiper > 0
                  ? {
                      color: CLINICA_PDF_COLORS.roseText,
                    }
                  : undefined,
              ]}
            >
              {resumo.episodiosHipo} / {resumo.episodiosHiper}
            </Text>
            <Text style={styles.kpiSub}>Episódios críticos</Text>
          </View>

          {mostrarColunaBasal ? (
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Basal Média</Text>
              <Text style={[styles.kpiValue, { color: "#3730A3" }]}>
                {resumo.mediaDiariaBasalUI !== null
                  ? formatarUI(resumo.mediaDiariaBasalUI)
                  : "--"}
              </Text>
              <Text style={styles.kpiSub}>
                {resumo.mediaDiariaRapidaUI !== null
                  ? `Rápida: ${formatarUI(resumo.mediaDiariaRapidaUI)}/dia`
                  : "Dose diária"}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Matriz Glicêmica Colorida */}
        <View style={styles.tableWrap}>
          <View style={styles.tableHeaderRow} fixed>
            <View style={styles.colDate}>
              <Text style={[styles.thText, { textAlign: "left" }]}>Data</Text>
            </View>
            {SLOTS_MAPA_ORDER.map((slot, idx) => {
              const isLastSlot =
                !mostrarColunaBasal && idx === SLOTS_MAPA_ORDER.length - 1;
              return (
                <View
                  key={slot}
                  style={[
                    styles.colSlot,
                    isLastSlot ? { borderRightWidth: 0 } : undefined,
                  ]}
                >
                  <Text style={styles.thText}>{SLOT_META[slot].pdfHeader}</Text>
                </View>
              );
            })}
            {mostrarColunaBasal ? (
              <View style={styles.colBasal}>
                <Text style={styles.thText}>Basal</Text>
              </View>
            ) : null}
          </View>

          {linhas.length === 0 ? (
            <View style={[styles.tableDataRow, { padding: 14, justifyContent: "center" }]}>
              <Text style={{ fontSize: 8.5, color: CLINICA_PDF_COLORS.slate500 }}>
                Nenhuma medição glicêmica ou aplicação de insulina registrada no período selecionado.
              </Text>
            </View>
          ) : (
            linhas.map((linha) => {
              const basalTotal = linha.basalDoses.reduce(
                (acc, d) => acc + d.unidades,
                0,
              );
              const basalHora = linha.basalDoses[0]?.hora || "";

              return (
                <View
                  key={linha.dataDia}
                  style={styles.tableDataRow}
                  wrap={false}
                >
                  <View style={styles.colDate}>
                    <Text style={styles.dateCellMain}>{linha.dataLabel}</Text>
                    <Text style={styles.dateCellSub}>
                      {linha.diaSemanaCurto}
                    </Text>
                  </View>

                  {SLOTS_MAPA_ORDER.map((slot, idx) => {
                    const cel = linha.celulas[slot];
                    const isLastSlot =
                      !mostrarColunaBasal && idx === SLOTS_MAPA_ORDER.length - 1;

                    if (!cel) {
                      return (
                        <View
                          key={slot}
                          style={[
                            styles.colSlot,
                            isLastSlot ? { borderRightWidth: 0 } : undefined,
                          ]}
                        >
                          <Text style={styles.emptyCellDash}>—</Text>
                        </View>
                      );
                    }

                    const pal = getStatusPdfColors(cel.status);
                    return (
                      <View
                        key={slot}
                        style={[
                          styles.colSlot,
                          isLastSlot ? { borderRightWidth: 0 } : undefined,
                        ]}
                      >
                        <View
                          style={[
                            styles.cellPill,
                            {
                              backgroundColor: pal.bg,
                              borderColor: pal.border,
                            },
                          ]}
                        >
                          <Text
                            style={[styles.cellValueText, { color: pal.text }]}
                          >
                            {cel.valor}
                          </Text>
                          <Text
                            style={[
                              styles.cellSubLine,
                              {
                                color:
                                  cel.status === "HIPER"
                                    ? "#FFE4E6"
                                    : CLINICA_PDF_COLORS.slate500,
                              },
                            ]}
                          >
                            {cel.hora}
                          </Text>
                          {cel.insulinaUI && cel.insulinaUI > 0 ? (
                            <Text
                              style={[
                                styles.cellInsulinTag,
                                {
                                  color:
                                    cel.status === "HIPER"
                                      ? "#FFFFFF"
                                      : "#3730A3",
                                },
                              ]}
                            >
                              +{formatarUI(cel.insulinaUI)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}

                  {mostrarColunaBasal ? (
                    <View style={styles.colBasal}>
                      {basalTotal > 0 ? (
                        <View style={styles.basalBadge}>
                          <Text style={styles.basalValueText}>
                            {formatarUI(basalTotal)}
                          </Text>
                          {basalHora ? (
                            <Text style={styles.basalSubText}>{basalHora}</Text>
                          ) : null}
                        </View>
                      ) : (
                        <Text style={styles.emptyCellDash}>—</Text>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}

          {/* Linha Fixa de Médias por Coluna */}
          <View style={styles.tableFooterRow} wrap={false}>
            <View style={styles.colDate}>
              <Text style={styles.footerAvgLabel}>MÉDIAS</Text>
            </View>
            {SLOTS_MAPA_ORDER.map((slot, idx) => {
              const mediaCol = mediasPorColuna[slot];
              const isLastSlot =
                !mostrarColunaBasal && idx === SLOTS_MAPA_ORDER.length - 1;
              const statusCol =
                mediaCol !== null
                  ? classificarGlicemiaMapa(mediaCol, slot, alvos)
                  : null;
              const corTexto =
                statusCol === "HIPO" || statusCol === "HIPER"
                  ? CLINICA_PDF_COLORS.roseText
                  : statusCol === "ATENCAO"
                    ? CLINICA_PDF_COLORS.amberText
                    : CLINICA_PDF_COLORS.primaryDark;

              return (
                <View
                  key={slot}
                  style={[
                    styles.colSlot,
                    isLastSlot ? { borderRightWidth: 0 } : undefined,
                  ]}
                >
                  <Text style={[styles.footerAvgValue, { color: corTexto }]}>
                    {mediaCol !== null ? `${mediaCol}` : "—"}
                  </Text>
                </View>
              );
            })}
            {mostrarColunaBasal ? (
              <View style={styles.colBasal}>
                <Text style={[styles.footerAvgValue, { color: "#3730A3", fontSize: 7.8 }]}>
                  {resumo.mediaDiariaBasalUI !== null
                    ? formatarUI(resumo.mediaDiariaBasalUI)
                    : "—"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.legendRow}>
          <Text style={styles.legendText}>
            Valores em mg/dL (fuso oficial de Brasília). Verde: dentro do alvo •
            Âmbar: atenção • Rosa/Vermelho: hipoglicemia (&lt;
            {protocolo.alvoJejumMin}) ou hiperglicemia (&gt;250).
          </Text>
        </View>

        {protocolo.orientacaoHipo || protocolo.orientacaoHiper ? (
          <View style={styles.guidanceCard} wrap={false}>
            <Text style={styles.guidanceTitle}>
              ORIENTAÇÕES CLÍNICAS PERSONALIZADAS
            </Text>
            {protocolo.orientacaoHipo ? (
              <Text style={styles.guidanceLine}>
                • Se glicemia &lt; {protocolo.alvoJejumMin} mg/dL:{" "}
                {protocolo.orientacaoHipo}
              </Text>
            ) : null}
            {protocolo.orientacaoHiper ? (
              <Text style={styles.guidanceLine}>
                • Se glicemia &gt; 250 mg/dL: {protocolo.orientacaoHiper}
              </Text>
            ) : null}
          </View>
        ) : null}

        <ClinicaPdfSignatureBlock
          inline
          medicoNome={medicoNome}
          crm={crm}
          especialidades={especialidades}
          localCidade={localCidade}
          dataEmissao={dataEmissao}
        />

        <ClinicaPdfFooter
          clinicaContato={clinicaContato}
          onlyShowPageNumberWhenMultiple
        />
      </Page>
    </Document>
  );
}
