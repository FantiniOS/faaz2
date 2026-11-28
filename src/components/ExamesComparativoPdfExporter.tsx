"use client";

import React from "react";
import { pdf } from "@react-pdf/renderer";
import {
  ExamesComparativoPDF,
  type ExamesComparativoPDFProps,
} from "@/components/ExamesComparativoPDF";

/**
 * Gera o Blob do Relatório Comparativo de Exames em PDF no navegador
 * (Client-Only para nunca executar @react-pdf/renderer no SSR) e inicia download.
 */
export async function downloadExamesComparativoPdf(
  props: ExamesComparativoPDFProps,
  fileName: string,
): Promise<void> {
  const blob = await pdf(<ExamesComparativoPDF {...props} />).toBlob();
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
