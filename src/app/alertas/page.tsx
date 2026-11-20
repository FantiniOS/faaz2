'use client';

import React from "react";
import Link from "next/link";
import { AlertCircle, Wrench, ArrowLeft } from "lucide-react";
import { TopMenu } from "@/components/TopMenu";

export default function AlertasPage() {
  return (
    <div className="min-h-screen cl-page flex flex-col">
      {/* Menu Superior Principal */}
      <TopMenu activePath="/alertas" />

      {/* Container Central Estático e Responsivo */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="cl-card w-full max-w-md p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 mx-auto shadow-2xs">
            <AlertCircle className="w-7 h-7 stroke-[2]" />
          </div>

          <div className="space-y-1.5">
            <span className="cl-badge-amber px-2.5 py-0.5 text-[11px]">
              <Wrench className="w-3 h-3" />
              <span>Central de Alertas Clínicos</span>
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Módulo em Construção
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              O monitoramento em tempo real de alertas metabólicos, check-ins fora da meta e notificações prioritárias está sendo preparado.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/dashboard"
              className="cl-btn-primary px-4 py-2 text-xs"
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
