"use client";

import React from "react";
import { pdf } from "@react-pdf/renderer";
import { DietPlanPDF, type DietPlanPDFProps } from "@/components/DietPlanPDF";

/**
 * Gera o Blob do Plano Alimentar Individualizado em PDF no navegador
 * (isolado Client-Only para nunca executar @react-pdf/renderer no SSR)
 * e dispara o download nativo.
 */
export async function downloadDietPlanPdf(
  props: DietPlanPDFProps,
  fileName: string,
): Promise<void> {
  const blob = await pdf(<DietPlanPDF {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}
