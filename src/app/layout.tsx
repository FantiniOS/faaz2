import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Clínica FAAZ | FRdoc 2.0 — Gestão Clínica",
    template: "%s | FRdoc 2.0",
  },
  description:
    "Plataforma clínica FRdoc 2.0 da Clínica FAAZ — gestão clínica, prontuário integrado e agendamentos.",
  applicationName: "FRdoc 2.0",
  openGraph: {
    title: "Clínica FAAZ | FRdoc 2.0 — Gestão Clínica",
    description:
      "Plataforma clínica FRdoc 2.0 da Clínica FAAZ — gestão clínica, prontuário integrado e agendamentos.",
    siteName: "FRdoc 2.0",
    locale: "pt_BR",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
