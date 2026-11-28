import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import {
  CLINICA_PDF_COLORS,
  getClinicaLogoUrl,
} from "@/lib/pdf-clinica-template";
import {
  ClinicaPdfFooter,
  ClinicaPdfHeader,
  ClinicaPdfSignatureBlock,
  ClinicaPdfTopAccent,
} from "@/components/PdfClinicaChrome";
import {
  LAUDO_BY_KEY,
  formatExamNumber,
  type ExameLaboratorialDTO,
  type ExamEvolutionResult,
} from "@/lib/exames-catalog";
import { formatarDataBR } from "@/lib/date-br";

export interface PdfExameRow {
  key: string;
  label: string;
  unit: string;
  refLabel: string;
  isCalculated?: boolean;
  valuesByLoteId: Record<string, { display: string; status?: "ok" | "high" | "low" }>;
  evolution: ExamEvolutionResult | null;
}

export interface PdfExameGroup {
  categoryLabel: string;
  rows: PdfExameRow[];
}

export interface ExamesComparativoPDFProps {
  pacienteNome: string;
  pacienteRecordCode?: string | null;
  pacienteCpf?: string | null;
  dataEmissao: string;
  localCidade?: string;
  medicoNome: string;
  crm?: string;
  especialidades: string;
  clinicaNome: string;
  clinicaSubtitulo?: string;
  clinicaContato: string;
  logoSrc?: string;
  lotes: ExameLaboratorialDTO[]; // ordenados do mais antigo -> mais recente
  groups: PdfExameGroup[];
  scoreboard: {
    improved: number;
    attention: number;
    onTarget: number;
  };
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: CLINICA_PDF_COLORS.white,
    paddingTop: 34,
    paddingBottom: 56,
    paddingHorizontal: 32,
    color: CLINICA_PDF_COLORS.slate800,
    position: "relative",
  },
  docBannerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    color: CLINICA_PDF_COLORS.slate500,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  patientName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.8,
    color: CLINICA_PDF_COLORS.slate900,
  },
  patientSub: {
    fontSize: 8,
    color: CLINICA_PDF_COLORS.slate600,
    marginTop: 2,
  },
  kpiStrip: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  kpiLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    marginTop: 2,
  },
  groupHeader: {
    backgroundColor: CLINICA_PDF_COLORS.tealBg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: CLINICA_PDF_COLORS.tealPillBorder,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  groupHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: CLINICA_PDF_COLORS.primaryDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
    minHeight: 24,
  },
  tableDataRow: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: CLINICA_PDF_COLORS.slate200,
    alignItems: "center",
    minHeight: 22,
  },
  colExam: {
    width: "34%",
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRightWidth: 0.6,
    borderRightColor: CLINICA_PDF_COLORS.slate200,
  },
  colDate: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 0.6,
    borderRightColor: CLINICA_PDF_COLORS.slate200,
  },
  colDelta: {
    width: "16%",
    paddingVertical: 4,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  thText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.4,
    color: CLINICA_PDF_COLORS.slate700,
    textAlign: "center",
  },
  thSub: {
    fontSize: 6,
    color: CLINICA_PDF_COLORS.slate500,
    textAlign: "center",
    marginTop: 1,
  },
  examName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: CLINICA_PDF_COLORS.slate900,
  },
  examRef: {
    fontSize: 6.4,
    color: CLINICA_PDF_COLORS.slate500,
    marginTop: 1,
  },
  valText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.2,
    color: CLINICA_PDF_COLORS.slate800,
    textAlign: "center",
  },
  valMuted: {
    fontSize: 8,
    color: CLINICA_PDF_COLORS.slate300,
    textAlign: "center",
  },
  deltaMain: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.8,
    textAlign: "center",
  },
  deltaBadge: {
    fontSize: 6.2,
    marginTop: 1,
    textAlign: "center",
  },
  laudosSection: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 6,
    padding: 9,
    backgroundColor: CLINICA_PDF_COLORS.slate50,
  },
  laudosTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.4,
    color: CLINICA_PDF_COLORS.primaryDark,
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  laudoDateCard: {
    backgroundColor: CLINICA_PDF_COLORS.white,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 4,
    padding: 7,
    marginBottom: 5,
  },
  laudoDateHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.8,
    color: CLINICA_PDF_COLORS.primary,
    marginBottom: 3,
  },
  laudoItemLine: {
    fontSize: 7.6,
    color: CLINICA_PDF_COLORS.slate700,
    lineHeight: 1.35,
    marginBottom: 2,
  },
  laudoItemLabel: {
    fontFamily: "Helvetica-Bold",
    color: CLINICA_PDF_COLORS.slate900,
  },
});

export function ExamesComparativoPDF({
  pacienteNome,
  pacienteRecordCode,
  pacienteCpf,
  dataEmissao,
  localCidade = "Belo Horizonte - MG",
  medicoNome,
  crm,
  especialidades,
  clinicaNome,
  clinicaSubtitulo = "Medicina & Saúde Integrativa",
  clinicaContato,
  logoSrc = getClinicaLogoUrl(),
  lotes,
  groups,
  scoreboard,
}: ExamesComparativoPDFProps) {
  // Exibe até as 4 coletas mais recentes lado a lado para manter legibilidade A4
  const visibleLotes = lotes.slice(-4);

  const lotesComLaudos = [...lotes]
    .reverse()
    .filter(
      (l) =>
        Object.keys(l.laudosImagem || {}).length > 0 ||
        Boolean(l.observacoes?.trim()),
    );

  return (
    <Document
      title={`Exames Comparativos - ${pacienteNome}`}
      author={medicoNome}
      subject="Painel Comparativo de Exames Laboratoriais e Laudos"
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

        <View style={styles.docBannerRow}>
          <View style={styles.docTypePill}>
            <Text style={styles.docTypePillText}>
              RELATÓRIO COMPARATIVO DE EXAMES LABORATORIAIS & LAUDOS
            </Text>
          </View>
          {pacienteRecordCode ? (
            <Text style={styles.recordCodeBadge}>
              Prontuário: {pacienteRecordCode}
            </Text>
          ) : null}
        </View>

        <View style={styles.patientCard}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.metaLabel}>PACIENTE</Text>
            <Text style={styles.patientName}>{pacienteNome}</Text>
            <Text style={styles.patientSub}>
              {pacienteCpf ? `CPF: ${pacienteCpf}  •  ` : ""}
              {lotes.length}{" "}
              {lotes.length === 1
                ? "coleta registrada"
                : "coletas registradas"}
              {lotes.length > 4 ? " (exibindo as 4 mais recentes)" : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.metaLabel}>EMISSÃO</Text>
            <Text style={[styles.patientName, { fontSize: 9.2 }]}>
              {dataEmissao}
            </Text>
          </View>
        </View>

        {/* Placar Clínico */}
        <View style={styles.kpiStrip}>
          <View
            style={[
              styles.kpiCard,
              {
                backgroundColor: CLINICA_PDF_COLORS.emeraldBg,
                borderColor: CLINICA_PDF_COLORS.emeraldBorder,
              },
            ]}
          >
            <Text
              style={[styles.kpiLabel, { color: CLINICA_PDF_COLORS.emeraldText }]}
            >
              Melhoraram
            </Text>
            <Text
              style={[styles.kpiValue, { color: CLINICA_PDF_COLORS.emeraldText }]}
            >
              {scoreboard.improved}
            </Text>
          </View>

          <View
            style={[
              styles.kpiCard,
              {
                backgroundColor: CLINICA_PDF_COLORS.amberBg,
                borderColor: CLINICA_PDF_COLORS.amberBorder,
              },
            ]}
          >
            <Text
              style={[styles.kpiLabel, { color: CLINICA_PDF_COLORS.roseText }]}
            >
              Em Atenção / Pioraram
            </Text>
            <Text
              style={[styles.kpiValue, { color: CLINICA_PDF_COLORS.roseText }]}
            >
              {scoreboard.attention}
            </Text>
          </View>

          <View
            style={[
              styles.kpiCard,
              {
                backgroundColor: CLINICA_PDF_COLORS.tealBg,
                borderColor: CLINICA_PDF_COLORS.tealPillBorder,
              },
            ]}
          >
            <Text
              style={[styles.kpiLabel, { color: CLINICA_PDF_COLORS.primaryDark }]}
            >
              Na Meta
            </Text>
            <Text
              style={[styles.kpiValue, { color: CLINICA_PDF_COLORS.primaryDark }]}
            >
              {scoreboard.onTarget}
            </Text>
          </View>
        </View>

        {/* Tabela Comparativa */}
        <View style={styles.tableWrap}>
          <View style={styles.tableHeaderRow} fixed>
            <View style={styles.colExam}>
              <Text style={[styles.thText, { textAlign: "left" }]}>
                Exame / Referência
              </Text>
            </View>
            {visibleLotes.map((lote) => (
              <View key={lote.id} style={styles.colDate}>
                <Text style={styles.thText}>
                  {formatarDataBR(lote.dataColeta)}
                </Text>
                {lote.laboratorio ? (
                  <Text style={styles.thSub}>
                    {lote.laboratorio.slice(0, 18)}
                  </Text>
                ) : null}
              </View>
            ))}
            <View style={styles.colDelta}>
              <Text style={styles.thText}>Evolução (Δ)</Text>
            </View>
          </View>

          {groups.map((group) => (
            <React.Fragment key={group.categoryLabel}>
              <View style={styles.groupHeader} wrap={false}>
                <Text style={styles.groupHeaderText}>
                  {group.categoryLabel}
                </Text>
              </View>
              {group.rows.map((row) => {
                const evo = row.evolution;
                const deltaColor =
                  evo?.trend === "improved"
                    ? CLINICA_PDF_COLORS.emeraldText
                    : evo?.trend === "worsened"
                      ? CLINICA_PDF_COLORS.roseText
                      : CLINICA_PDF_COLORS.slate500;

                return (
                  <View
                    key={row.key}
                    style={styles.tableDataRow}
                    wrap={false}
                  >
                    <View style={styles.colExam}>
                      <Text style={styles.examName}>
                        {row.label}
                        {row.unit ? ` (${row.unit})` : ""}
                      </Text>
                      {row.refLabel ? (
                        <Text style={styles.examRef}>Ref: {row.refLabel}</Text>
                      ) : null}
                    </View>

                    {visibleLotes.map((lote) => {
                      const cell = row.valuesByLoteId[lote.id];
                      if (!cell) {
                        return (
                          <View key={lote.id} style={styles.colDate}>
                            <Text style={styles.valMuted}>—</Text>
                          </View>
                        );
                      }
                      const cellColor =
                        cell.status === "high" || cell.status === "low"
                          ? CLINICA_PDF_COLORS.roseText
                          : CLINICA_PDF_COLORS.slate900;
                      return (
                        <View key={lote.id} style={styles.colDate}>
                          <Text style={[styles.valText, { color: cellColor }]}>
                            {cell.display}
                          </Text>
                        </View>
                      );
                    })}

                    <View style={styles.colDelta}>
                      {evo && evo.deltaFormatted ? (
                        <>
                          <Text
                            style={[styles.deltaMain, { color: deltaColor }]}
                          >
                            {evo.arrow} {evo.deltaFormatted}
                          </Text>
                          {evo.badgeLabel ? (
                            <Text
                              style={[styles.deltaBadge, { color: deltaColor }]}
                            >
                              {evo.badgeLabel}
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.valMuted}>—</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </React.Fragment>
          ))}
        </View>

        {/* Bloco de Laudos de Imagem & Complementares */}
        {lotesComLaudos.length > 0 ? (
          <View style={styles.laudosSection}>
            <Text style={styles.laudosTitle}>
              Imagem, Laudos Complementares & Observações
            </Text>
            {lotesComLaudos.map((lote) => (
              <View
                key={lote.id}
                style={styles.laudoDateCard}
                wrap={false}
              >
                <Text style={styles.laudoDateHeader}>
                  {formatarDataBR(lote.dataColeta)}
                  {lote.laboratorio ? `  •  ${lote.laboratorio}` : ""}
                </Text>
                {Object.entries(lote.laudosImagem || {}).map(([key, texto]) => {
                  if (!texto?.trim()) return null;
                  const def = LAUDO_BY_KEY[key];
                  return (
                    <Text key={key} style={styles.laudoItemLine}>
                      <Text style={styles.laudoItemLabel}>
                        {def?.label || key}:{" "}
                      </Text>
                      {texto}
                    </Text>
                  );
                })}
                {lote.observacoes?.trim() ? (
                  <Text style={styles.laudoItemLine}>
                    <Text style={styles.laudoItemLabel}>Observações: </Text>
                    {lote.observacoes}
                  </Text>
                ) : null}
              </View>
            ))}
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

export { formatExamNumber };
