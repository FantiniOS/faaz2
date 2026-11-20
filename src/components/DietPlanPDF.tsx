import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import {
  CLINICA_PDF_COLORS,
  formatarPorcaoPdf,
} from "@/lib/pdf-clinica-template";
import {
  ClinicaPdfFooter,
  ClinicaPdfHeader,
  ClinicaPdfSignatureBlock,
  ClinicaPdfTopAccent,
} from "@/components/PdfClinicaChrome";

export interface DietPlanPdfSubstituicao {
  nome: string;
  quantidade: number;
  unidade?: string | null;
  medidaCaseira?: string | null;
}

export interface DietPlanPdfItem {
  nome: string;
  quantidade: number;
  unidade?: string | null;
  medidaCaseira?: string | null;
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  substituicoes: DietPlanPdfSubstituicao[];
}

export interface DietPlanPdfRefeicao {
  nome: string;
  horario?: string | null;
  opcional?: boolean;
  observacoes?: string | null;
  itens: DietPlanPdfItem[];
  totais: {
    calorias: number;
    proteinas: number;
    carboidratos: number;
    gorduras: number;
  };
}

export interface DietPlanPdfVariacao {
  nome: string;
  descricao?: string | null;
  refeicoes: DietPlanPdfRefeicao[];
  totais: {
    calorias: number;
    proteinas: number;
    carboidratos: number;
    gorduras: number;
  };
}

export interface DietPlanPDFProps {
  nomePlano: string;
  pacienteNome: string;
  pacienteRecordCode?: string | null;
  objetivoTratamento?: string | null;
  dataEmissao: string;
  localCidade?: string;
  medicoNome: string;
  crm?: string;
  especialidades: string;
  clinicaNome: string;
  clinicaSubtitulo?: string;
  clinicaContato: string;
  logoSrc?: string;
  incluirMacros: boolean;
  variacoes: DietPlanPdfVariacao[];
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: CLINICA_PDF_COLORS.white,
    paddingTop: 34,
    paddingBottom: 56,
    paddingHorizontal: 38,
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
    letterSpacing: 0.8,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  patientMainCol: {
    flex: 1,
    paddingRight: 14,
  },
  patientRightCol: {
    alignItems: "flex-end",
    minWidth: 120,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.2,
    color: CLINICA_PDF_COLORS.slate500,
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  patientNameValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    color: CLINICA_PDF_COLORS.slate900,
  },
  patientMetaRow: {
    fontSize: 8.4,
    color: CLINICA_PDF_COLORS.slate600,
    marginTop: 3,
    lineHeight: 1.35,
  },
  patientMetaBold: {
    fontFamily: "Helvetica-Bold",
    color: CLINICA_PDF_COLORS.slate800,
  },
  dateValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.8,
    color: CLINICA_PDF_COLORS.slate900,
    textAlign: "right",
  },
  doctorInlineValue: {
    fontSize: 8.2,
    color: CLINICA_PDF_COLORS.slate600,
    textAlign: "right",
    marginTop: 6,
  },
  planSubtitleWrap: {
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 0.75,
    borderBottomColor: CLINICA_PDF_COLORS.slate200,
  },
  planSubtitleText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.8,
    color: CLINICA_PDF_COLORS.primaryDark,
  },
  variationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CLINICA_PDF_COLORS.tealBg,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.tealBorder,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  variationTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.8,
    color: CLINICA_PDF_COLORS.primaryDark,
    letterSpacing: 0.4,
  },
  variationDesc: {
    fontSize: 8,
    color: CLINICA_PDF_COLORS.slate600,
    marginTop: 1.5,
  },
  variationBadge: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: CLINICA_PDF_COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  mealCard: {
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 7,
    marginBottom: 10,
    backgroundColor: CLINICA_PDF_COLORS.white,
    overflow: "hidden",
  },
  mealHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CLINICA_PDF_COLORS.slate50,
    borderBottomWidth: 1,
    borderBottomColor: CLINICA_PDF_COLORS.slate200,
    paddingVertical: 6.5,
    paddingHorizontal: 11,
  },
  mealHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
    paddingRight: 8,
  },
  mealAccentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CLINICA_PDF_COLORS.primary,
  },
  mealName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.6,
    color: CLINICA_PDF_COLORS.primaryDark,
    letterSpacing: 0.3,
  },
  mealTimePill: {
    backgroundColor: CLINICA_PDF_COLORS.white,
    borderWidth: 0.75,
    borderColor: CLINICA_PDF_COLORS.slate300,
    borderRadius: 4,
    paddingVertical: 1.5,
    paddingHorizontal: 5.5,
  },
  mealTimeText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.8,
    color: CLINICA_PDF_COLORS.slate700,
  },
  optionalPill: {
    backgroundColor: CLINICA_PDF_COLORS.purpleBg,
    borderWidth: 0.75,
    borderColor: CLINICA_PDF_COLORS.purpleBorder,
    borderRadius: 4,
    paddingVertical: 1.5,
    paddingHorizontal: 5.5,
  },
  optionalPillText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.2,
    color: CLINICA_PDF_COLORS.purpleText,
  },
  mealKcalText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.2,
    color: CLINICA_PDF_COLORS.amberText,
  },
  mealBody: {
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  itemBlock: {
    paddingVertical: 4.5,
    borderBottomWidth: 0.6,
    borderBottomColor: CLINICA_PDF_COLORS.slate100,
  },
  itemBlockLast: {
    paddingVertical: 4.5,
    borderBottomWidth: 0,
  },
  itemMainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  itemTextWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 6,
  },
  itemBullet: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: CLINICA_PDF_COLORS.primary,
    lineHeight: 1.35,
  },
  itemLine: {
    fontSize: 9.2,
    color: CLINICA_PDF_COLORS.slate800,
    lineHeight: 1.4,
    flex: 1,
  },
  itemFoodName: {
    fontFamily: "Helvetica-Bold",
    color: CLINICA_PDF_COLORS.slate900,
  },
  itemMeasureHighlight: {
    fontFamily: "Helvetica-Bold",
    color: CLINICA_PDF_COLORS.primary,
  },
  itemMeasureComplement: {
    fontSize: 8.5,
    color: CLINICA_PDF_COLORS.slate600,
  },
  itemMacrosInline: {
    fontSize: 7.5,
    color: CLINICA_PDF_COLORS.slate500,
    textAlign: "right",
    minWidth: 108,
    marginTop: 1,
  },
  subsBox: {
    marginTop: 3.5,
    marginLeft: 12,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    backgroundColor: CLINICA_PDF_COLORS.slate50,
    borderLeftWidth: 2,
    borderLeftColor: CLINICA_PDF_COLORS.tealPillBorder,
    borderRadius: 3,
  },
  subsLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.6,
    color: CLINICA_PDF_COLORS.primary,
  },
  subsLine: {
    fontSize: 8,
    color: CLINICA_PDF_COLORS.slate600,
    lineHeight: 1.4,
  },
  notesBox: {
    marginTop: 6,
    paddingVertical: 5.5,
    paddingHorizontal: 8.5,
    backgroundColor: CLINICA_PDF_COLORS.amberBg,
    borderWidth: 0.75,
    borderColor: CLINICA_PDF_COLORS.amberBorder,
    borderRadius: 5,
  },
  notesLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.8,
    color: CLINICA_PDF_COLORS.amberText,
  },
  notesText: {
    fontSize: 8.3,
    color: CLINICA_PDF_COLORS.slate700,
    lineHeight: 1.42,
    marginTop: 1.5,
  },
  emptyMealText: {
    fontSize: 8.5,
    color: CLINICA_PDF_COLORS.slate400,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  macrosSummaryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CLINICA_PDF_COLORS.slate50,
    borderWidth: 1,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 2,
    marginBottom: 10,
  },
  macrosSummaryLeft: {
    flexDirection: "column",
  },
  macrosSummaryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.2,
    color: CLINICA_PDF_COLORS.slate500,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  macrosSummaryKcal: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    color: CLINICA_PDF_COLORS.slate900,
    marginTop: 1.5,
  },
  macrosPillRow: {
    flexDirection: "row",
    gap: 8,
  },
  macroPill: {
    backgroundColor: CLINICA_PDF_COLORS.white,
    borderWidth: 0.75,
    borderColor: CLINICA_PDF_COLORS.slate200,
    borderRadius: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: "center",
    minWidth: 68,
  },
  macroPillTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    color: CLINICA_PDF_COLORS.slate500,
    textTransform: "uppercase",
  },
  macroPillValProt: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: CLINICA_PDF_COLORS.emeraldText,
    marginTop: 1,
  },
  macroPillValCarb: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: CLINICA_PDF_COLORS.amberText,
    marginTop: 1,
  },
  macroPillValFat: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: CLINICA_PDF_COLORS.roseText,
    marginTop: 1,
  },
});

function formatDecimalPt(val: number): string {
  if (!Number.isFinite(val)) return "0,0";
  return val.toFixed(1).replace(".", ",");
}

export function DietPlanPDF({
  nomePlano,
  pacienteNome,
  pacienteRecordCode,
  objetivoTratamento,
  dataEmissao,
  localCidade,
  medicoNome,
  crm,
  especialidades,
  clinicaNome,
  clinicaSubtitulo = "Medicina & Saúde Integrativa",
  clinicaContato,
  logoSrc,
  incluirMacros,
  variacoes,
}: DietPlanPDFProps) {
  const showVariationHeaders = variacoes.length > 1;
  const normalizedPlanName = (nomePlano || "").trim();
  const showCustomPlanTitle =
    normalizedPlanName.length > 0 &&
    normalizedPlanName.toLowerCase() !== "plano alimentar individualizado";

  return (
    <Document
      title={`Plano Alimentar Individualizado - ${pacienteNome}`}
      author={medicoNome}
      subject={normalizedPlanName || "Plano Alimentar Individualizado"}
      creator="Clínica FAAZ Prontuário Digital"
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

        {/* FAIXA DO DOCUMENTO */}
        <View style={styles.docBannerRow}>
          <View style={styles.docTypePill}>
            <Text style={styles.docTypePillText}>
              PLANO ALIMENTAR INDIVIDUALIZADO
            </Text>
          </View>
          {pacienteRecordCode ? (
            <Text style={styles.recordCodeBadge}>
              Prontuário: {pacienteRecordCode}
            </Text>
          ) : null}
        </View>

        {/* IDENTIFICAÇÃO DO PACIENTE */}
        <View style={styles.patientCard}>
          <View style={styles.patientMainCol}>
            <Text style={styles.metaLabel}>PACIENTE</Text>
            <Text style={styles.patientNameValue}>
              {pacienteNome.trim() || "Paciente"}
            </Text>
            {objetivoTratamento?.trim() ? (
              <Text style={styles.patientMetaRow}>
                Objetivo do Tratamento:{" "}
                <Text style={styles.patientMetaBold}>
                  {objetivoTratamento.trim()}
                </Text>
              </Text>
            ) : null}
          </View>

          <View style={styles.patientRightCol}>
            <Text style={styles.metaLabel}>DATA DE EMISSÃO</Text>
            <Text style={styles.dateValue}>{dataEmissao}</Text>
            <Text style={styles.doctorInlineValue}>
              Resp.: {medicoNome}
            </Text>
          </View>
        </View>

        {showCustomPlanTitle ? (
          <View style={styles.planSubtitleWrap}>
            <Text style={styles.planSubtitleText}>{normalizedPlanName}</Text>
          </View>
        ) : null}

        {/* VARIAÇÕES E CARDS DE REFEIÇÃO */}
        {variacoes.map((variacao, varIdx) => {
          const refeicoesComConteudo = variacao.refeicoes.filter(
            (r) => r.itens.length > 0 || Boolean(r.observacoes?.trim()),
          );
          const refeicoesRender =
            refeicoesComConteudo.length > 0
              ? refeicoesComConteudo
              : variacao.refeicoes;

          return (
            <View key={`var-${varIdx}`}>
              {(showVariationHeaders || variacao.descricao?.trim()) ? (
                <View
                  style={styles.variationHeader}
                  wrap={false}
                  minPresenceAhead={90}
                >
                  <View>
                    <Text style={styles.variationTitle}>
                      {variacao.nome.toUpperCase()}
                    </Text>
                    {variacao.descricao?.trim() ? (
                      <Text style={styles.variationDesc}>
                        {variacao.descricao.trim()}
                      </Text>
                    ) : null}
                  </View>
                  {showVariationHeaders ? (
                    <Text style={styles.variationBadge}>
                      Cardápio {varIdx + 1} de {variacoes.length}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {refeicoesRender.map((refeicao, refIdx) => {
                // Evita quebrar um card de refeição pela metade (cards muito extensos > 10 itens
                // quebram apenas entre itens completos para nunca estourar a altura da página A4).
                const keepCardIntact = refeicao.itens.length <= 10;

                return (
                  <View
                    key={`var-${varIdx}-ref-${refIdx}`}
                    style={styles.mealCard}
                    wrap={!keepCardIntact}
                  >
                    <View
                      style={styles.mealHeader}
                      wrap={false}
                      minPresenceAhead={48}
                    >
                      <View style={styles.mealHeaderLeft}>
                        <View style={styles.mealAccentDot} />
                        <Text style={styles.mealName}>
                          {(refeicao.nome || "REFEIÇÃO").toUpperCase()}
                        </Text>
                        {refeicao.horario?.trim() ? (
                          <View style={styles.mealTimePill}>
                            <Text style={styles.mealTimeText}>
                              {refeicao.horario.trim()}
                            </Text>
                          </View>
                        ) : null}
                        {refeicao.opcional ? (
                          <View style={styles.optionalPill}>
                            <Text style={styles.optionalPillText}>
                              Opcional
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {incluirMacros ? (
                        <Text style={styles.mealKcalText}>
                          {Math.round(refeicao.totais.calorias)} kcal
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.mealBody}>
                      {refeicao.itens.length === 0 ? (
                        <Text style={styles.emptyMealText}>
                          Sem alimentos especificados nesta refeição.
                        </Text>
                      ) : (
                        refeicao.itens.map((item, itemIdx) => {
                          const isLast = itemIdx === refeicao.itens.length - 1;
                          const porcao = formatarPorcaoPdf(
                            item.quantidade,
                            item.unidade,
                            item.medidaCaseira,
                          );

                          return (
                            <View
                              key={`item-${itemIdx}`}
                              wrap={false}
                              style={
                                isLast ? styles.itemBlockLast : styles.itemBlock
                              }
                            >
                              <View style={styles.itemMainRow}>
                                <View style={styles.itemTextWrap}>
                                  <Text style={styles.itemBullet}>•</Text>
                                  <Text style={styles.itemLine}>
                                    <Text style={styles.itemFoodName}>
                                      {item.nome}
                                    </Text>
                                    {"  —  "}
                                    <Text style={styles.itemMeasureHighlight}>
                                      {porcao.destaque}
                                    </Text>
                                    {porcao.complemento ? (
                                      <Text
                                        style={styles.itemMeasureComplement}
                                      >
                                        {" "}
                                        {porcao.complemento}
                                      </Text>
                                    ) : null}
                                  </Text>
                                </View>

                                {incluirMacros ? (
                                  <Text style={styles.itemMacrosInline}>
                                    {Math.round(item.calorias)} kcal · P{" "}
                                    {formatDecimalPt(item.proteinas)}g · C{" "}
                                    {formatDecimalPt(item.carboidratos)}g · G{" "}
                                    {formatDecimalPt(item.gorduras)}g
                                  </Text>
                                ) : null}
                              </View>

                              {item.substituicoes.length > 0 ? (
                                <View style={styles.subsBox}>
                                  <Text style={styles.subsLine}>
                                    <Text style={styles.subsLabel}>
                                      Pode substituir por:{" "}
                                    </Text>
                                    {item.substituicoes
                                      .map((sub) => {
                                        const subPorcao = formatarPorcaoPdf(
                                          sub.quantidade,
                                          sub.unidade,
                                          sub.medidaCaseira,
                                        );
                                        const porcaoTxt = subPorcao.complemento
                                          ? `${subPorcao.destaque} ${subPorcao.complemento}`
                                          : subPorcao.destaque;
                                        return `• ${sub.nome} (${porcaoTxt})`;
                                      })
                                      .join("   ")}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })
                      )}

                      {refeicao.observacoes?.trim() ? (
                        <View style={styles.notesBox} wrap={false}>
                          <Text style={styles.notesLabel}>
                            Preparo / Orientações:
                          </Text>
                          <Text style={styles.notesText}>
                            {refeicao.observacoes.trim()}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              {/* RESUMO NUTRICIONAL OPCIONAL POR VARIAÇÃO */}
              {incluirMacros ? (
                <View style={styles.macrosSummaryBar} wrap={false}>
                  <View style={styles.macrosSummaryLeft}>
                    <Text style={styles.macrosSummaryLabel}>
                      Total Diário ({variacao.nome})
                    </Text>
                    <Text style={styles.macrosSummaryKcal}>
                      {Math.round(variacao.totais.calorias)} kcal / dia
                    </Text>
                  </View>

                  <View style={styles.macrosPillRow}>
                    <View style={styles.macroPill}>
                      <Text style={styles.macroPillTitle}>Proteínas</Text>
                      <Text style={styles.macroPillValProt}>
                        {formatDecimalPt(variacao.totais.proteinas)} g
                      </Text>
                    </View>
                    <View style={styles.macroPill}>
                      <Text style={styles.macroPillTitle}>Carboidratos</Text>
                      <Text style={styles.macroPillValCarb}>
                        {formatDecimalPt(variacao.totais.carboidratos)} g
                      </Text>
                    </View>
                    <View style={styles.macroPill}>
                      <Text style={styles.macroPillTitle}>Gorduras</Text>
                      <Text style={styles.macroPillValFat}>
                        {formatDecimalPt(variacao.totais.gorduras)} g
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* BLOCO DE ASSINATURA (protegido contra quebra de página) */}
        <ClinicaPdfSignatureBlock
          medicoNome={medicoNome}
          crm={crm}
          especialidades={especialidades}
          localCidade={localCidade}
          dataEmissao={dataEmissao}
          inline
        />

        {/* RODAPÉ INSTITUCIONAL FIXO COM PAGINAÇÃO */}
        <ClinicaPdfFooter
          clinicaContato={clinicaContato}
          onlyShowPageNumberWhenMultiple
        />
      </Page>
    </Document>
  );
}
