'use client';

import React from "react";
import Link from "next/link";
import { AlertCircle, Wrench, ArrowLeft } from "lucide-react";
import { TopMenu } from "@/components/TopMenu";

export default function AlertasPage() {
  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col">
      {/* Menu Superior Principal */}
      <TopMenu activePath="/alertas" />

      {/* Container Central Estático e Responsivo */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200/90 shadow-xs p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 mx-auto shadow-2xs">
            <AlertCircle className="w-7 h-7 stroke-[2]" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <Wrench className="w-3 h-3" />
              <span>Central de Alertas Clínicos</span>
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Módulo em Construção
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              O monitoramento em tempo real de alertas metabólicos, check-ins fora da meta e notificações prioritárias está sendo preparado.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Início</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
