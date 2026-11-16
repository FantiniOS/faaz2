"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type {
  PDFDownloadLinkProps,
  PDFViewerProps,
} from "@react-pdf/renderer";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import {
  PrescriptionPDF,
  PrescriptionPDFProps,
} from "@/components/PrescriptionPDF";

// Isolamento estrito Client-Only (ssr: false) para impedir renderização do @react-pdf no servidor
const PDFDownloadLink = dynamic<PDFDownloadLinkProps>(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  {
    ssr: false,
    loading: () => (
      <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-600/80 text-white shadow-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Carregando PDF...</span>
      </span>
    ),
  }
);

const PDFViewer = dynamic<PDFViewerProps>(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[640px] rounded-xl border border-slate-300 bg-white flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        <span>Inicializando visualizador PDF...</span>
      </div>
    ),
  }
);

export interface PdfDownloadButtonClientProps {
  pdfProps: PrescriptionPDFProps;
  fileName: string;
  disabled: boolean;
  onDownloadTriggered?: () => void;
}

export function PdfDownloadButtonClient({
  pdfProps,
  fileName,
  disabled,
  onDownloadTriggered,
}: PdfDownloadButtonClientProps) {
  const documentElement = useMemo(
    () => <PrescriptionPDF {...pdfProps} />,
    [pdfProps]
  );

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-200 text-slate-400 cursor-not-allowed"
      >
        <Download className="w-4 h-4" />
        <span>Baixar PDF Premium</span>
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={documentElement}
      fileName={fileName}
      onClick={() => {
        onDownloadTriggered?.();
      }}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-700 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 text-white shadow-sm shadow-teal-700/20 transition-all cursor-pointer"
    >
      {({ loading, error }) => {
        if (error) {
          return (
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-200" />
              <span>Erro ao gerar PDF</span>
            </span>
          );
        }

        if (loading) {
          return (
            <span className="inline-flex items-center gap-2 opacity-90">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Preparando PDF...</span>
            </span>
          );
        }

        return (
          <span className="inline-flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>Baixar PDF Premium</span>
          </span>
        );
      }}
    </PDFDownloadLink>
  );
}

export interface PdfViewerClientProps {
  pdfProps: PrescriptionPDFProps;
  className?: string;
}

export function PdfViewerClient({
  pdfProps,
  className = "w-full h-[640px] rounded-xl border border-slate-300 bg-white shadow-sm",
}: PdfViewerClientProps) {
  const documentElement = useMemo(
    () => <PrescriptionPDF {...pdfProps} />,
    [pdfProps]
  );

  return (
    <PDFViewer
      width="100%"
      height="640px"
      showToolbar={true}
      className={className}
    >
      {documentElement}
    </PDFViewer>
  );
}
