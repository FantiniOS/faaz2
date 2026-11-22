import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  Lock,
  Phone,
  ShieldCheck,
} from "lucide-react";
import {
  AVISO_EMERGENCIA_TERMOS,
  DATA_VIGENCIA_TERMOS,
  SECOES_TERMOS_PRIVACIDADE,
  VERSAO_ATUAL_TERMOS,
  WHATSAPP_CLINICA_EXIBICAO,
} from "@/lib/termos-privacidade";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Termos de Uso e Política de Privacidade — Clínica FAAZ",
  description:
    "Termos de Uso, Política de Privacidade (LGPD) e normas de guarda de prontuário (CFM) do ecossistema FRdoc 2.0 — Clínica FAAZ.",
  openGraph: {
    title: "Termos de Uso e Política de Privacidade — Clínica FAAZ | FRdoc 2.0",
    description:
      "Termos de Uso, Política de Privacidade (LGPD) e normas de guarda de prontuário (CFM) do ecossistema FRdoc 2.0 — Clínica FAAZ.",
    siteName: "FRdoc 2.0",
    locale: "pt_BR",
    type: "article",
  },
};

export default function PrivacidadePage() {
  return (
    <div
      className="min-h-screen cl-page text-slate-900 selection:bg-emerald-100 selection:text-emerald-900"
      style={{
        background:
          "linear-gradient(180deg, #F8FAFC 0%, #F4FBF8 45%, #F8FAFC 100%)",
      }}
    >
      {/* CABEÇALHO INSTITUCIONAL CLINICAL LIGHT */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 flex items-center shrink-0">
              <Image
                src="/logo.png"
                alt="Clínica FAAZ"
                width={848}
                height={1024}
                className="h-9 w-auto object-contain shrink-0"
                priority
              />
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="min-w-0 leading-tight">
              <span className="block text-xs font-extrabold tracking-[0.12em] uppercase text-slate-900 truncate">
                Clínica FAAZ
              </span>
              <span className="block text-[11px] font-medium text-slate-500 truncate">
                Medicina &amp; Saúde Integrativa
              </span>
            </div>
          </div>

          <Link
            href="/login"
            className="cl-btn-secondary px-3 py-1.5 text-xs shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Voltar ao acesso</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {/* HERO DOCUMENTAL */}
        <section className="cl-hero p-6 sm:p-8 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cl-badge-emerald px-3 py-1 text-[11px] tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Versão {VERSAO_ATUAL_TERMOS} · LGPD &amp; CFM</span>
            </span>
            <span className="cl-badge-slate px-2.5 py-1 text-[11px]">
              Vigência: {DATA_VIGENCIA_TERMOS}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Termos de Uso e Política de Privacidade
          </h1>
          <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-2xl">
            Documento de transparência sobre o tratamento de dados pessoais e
            dados sensíveis de saúde no aplicativo e ecossistema clínico FRdoc
            2.0 da Clínica FAAZ.
          </p>
        </section>

        {/* CARD DE DESTAQUE — AVISO DE NÃO-URGÊNCIA / EMERGÊNCIA (SAMU 192) */}
        <section
          aria-label="Aviso de não-urgência e emergência médica"
          className="rounded-2xl border border-amber-300/90 bg-gradient-to-br from-amber-50/90 via-rose-50/45 to-white p-5 sm:p-6 shadow-xs"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100/90 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold text-rose-950">
                  {AVISO_EMERGENCIA_TERMOS.titulo}
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  SAMU 192
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                {AVISO_EMERGENCIA_TERMOS.textoCompleto}
              </p>
            </div>
          </div>
        </section>

        {/* SEÇÕES NUMERADAS EM .cl-card */}
        <article className="cl-card p-6 sm:p-8 divide-y divide-slate-200/80">
          {SECOES_TERMOS_PRIVACIDADE.map((secao) => (
            <section
              key={secao.id}
              id={secao.id}
              className="py-6 first:pt-0 last:pb-0 space-y-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-7 h-7 rounded-lg text-xs font-extrabold font-mono flex items-center justify-center shrink-0 border ${
                    secao.destaque === "emergencia"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  {secao.numero}
                </span>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  {secao.titulo}
                </h2>
              </div>

              <div className="space-y-2.5 pl-0 sm:pl-10">
                {secao.paragrafos.map((paragrafo, idx) => (
                  <p
                    key={idx}
                    className="text-sm text-slate-600 leading-relaxed"
                  >
                    {paragrafo}
                  </p>
                ))}

                {secao.topicos && secao.topicos.length > 0 ? (
                  <ul className="space-y-2 pt-1">
                    {secao.topicos.map((topico, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed bg-slate-50/90 border border-slate-200/70 rounded-xl px-3.5 py-2.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
                        <span>{topico}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </article>

        {/* RODAPÉ INSTITUCIONAL */}
        <footer className="cl-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="space-y-1">
            <p className="font-extrabold text-slate-800">
              Clínica FAAZ — Medicina &amp; Saúde Integrativa
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>LGPD (Lei nº 13.709/2018)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Criptografia TLS</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>Oracle Cloud São Paulo</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href="https://wa.me/5531984400076"
              target="_blank"
              rel="noopener noreferrer"
              className="cl-btn-secondary px-3 py-1.5 text-xs"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>{WHATSAPP_CLINICA_EXIBICAO}</span>
            </a>
            <span className="font-mono text-[11px] text-slate-400">
              FRdoc 2.0 · v{VERSAO_ATUAL_TERMOS}
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
