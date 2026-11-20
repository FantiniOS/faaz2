"use client";

import React from "react";
import { pdf } from "@react-pdf/renderer";
import {
  MapaGlicemicoPDF,
  type MapaGlicemicoPDFProps,
} from "@/components/MapaGlicemicoPDF";

/**
 * Gera o Blob do Mapa Glicêmico & Controle de Insulina em PDF no navegador
 * (isolado Client-Only para nunca executar @react-pdf/renderer no SSR)
 * e dispara o download nativo.
 */
export async function downloadMapaGlicemicoPdf(
  props: MapaGlicemicoPDFProps,
  fileName: string,
): Promise<void> {
  const blob = await pdf(<MapaGlicemicoPDF {...props} />).toBlob();
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
