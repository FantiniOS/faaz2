"use client";

import React, { useState, useTransition } from "react";
import {
  Ruler,
  Percent,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  History,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  saveAnthropometricMeasurement,
  MeasurementDTO,
} from "@/actions/measurement-actions";
import { formatarDataBR, getDataDiaBR } from "@/lib/date-br";

export interface MeasurementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  latestMeasurement?: MeasurementDTO | null;
  totalRecords?: number;
  onSaved: (created: MeasurementDTO) => void;
  onOpenHistory?: () => void;
}

interface FormFieldsState {
  measuredAt: string;
  bodyFatPercentage: string;
  waist: string;
  abdomen: string;
  hips: string;
  rightArm: string;
  leftArm: string;
  rightThigh: string;
  leftThigh: string;
  notes: string;
}

function getTodayIsoDate(): string {
  return getDataDiaBR();
}

function formatBrDecimal(val: number): string {
  return val.toFixed(1).replace(".", ",");
}

const EMPTY_FORM = (): FormFieldsState => ({
  measuredAt: getTodayIsoDate(),
  bodyFatPercentage: "",
  waist: "",
  abdomen: "",
  hips: "",
  rightArm: "",
  leftArm: "",
  rightThigh: "",
  leftThigh: "",
  notes: "",
});

const CIRCUMFERENCE_FIELDS: Array<{
  key: keyof Omit<FormFieldsState, "measuredAt" | "notes">;
  label: string;
  shortLabel: string;
  unit: string;
  placeholder: string;
  highlight?: boolean;
}> = [
  {
    key: "bodyFatPercentage",
    label: "% de Gordura (Bioimpedância / Pregas · Opcional)",
    shortLabel: "Gordura",
    unit: "%",
    placeholder: "Ex: 24.5",
    highlight: true,
  },
  {
    key: "waist",
    label: "Cintura",
    shortLabel: "Cintura",
    unit: "cm",
    placeholder: "Ex: 78.0",
    highlight: true,
  },
  {
    key: "abdomen",
    label: "Abdômen",
    shortLabel: "Abdômen",
    unit: "cm",
    placeholder: "Ex: 85.0",
    highlight: true,
  },
  {
    key: "hips",
    label: "Quadril",
    shortLabel: "Quadril",
    unit: "cm",
    placeholder: "Ex: 101.0",
  },
  {
    key: "rightArm",
    label: "Braço Direito",
    shortLabel: "Braço Dir.",
    unit: "cm",
    placeholder: "Ex: 29.5",
  },
  {
    key: "leftArm",
    label: "Braço Esquerdo",
    shortLabel: "Braço Esq.",
    unit: "cm",
    placeholder: "Ex: 29.0",
  },
  {
    key: "rightThigh",
    label: "Coxa Direita",
    shortLabel: "Coxa Dir.",
    unit: "cm",
    placeholder: "Ex: 56.0",
  },
  {
    key: "leftThigh",
    label: "Coxa Esquerda",
    shortLabel: "Coxa Esq.",
    unit: "cm",
    placeholder: "Ex: 55.8",
  },
];

export function MeasurementModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  latestMeasurement,
  totalRecords = 0,
  onSaved,
  onOpenHistory,
}: MeasurementModalProps) {
  const [form, setForm] = useState<FormFieldsState>(EMPTY_FORM);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFieldChange = (field: keyof FormFieldsState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errorMsg) setErrorMsg(null);
    if (successMsg) setSuccessMsg(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const result = await saveAnthropometricMeasurement({
        patientId,
        measuredAt: form.measuredAt,
        bodyFatPercentage: form.bodyFatPercentage,
        waist: form.waist,
        abdomen: form.abdomen,
        hips: form.hips,
        rightArm: form.rightArm,
        leftArm: form.leftArm,
        rightThigh: form.rightThigh,
        leftThigh: form.leftThigh,
        notes: form.notes || null,
      });

      if (!result.success || !result.measurement) {
        setErrorMsg(
          result.error || "Não foi possível registrar as medidas corporais."
        );
        return;
      }

      onSaved(result.measurement);
      setForm(EMPTY_FORM());
      setSuccessMsg("Medidas corporais registradas com sucesso!");
      setTimeout(() => {
        setSuccessMsg(null);
        onOpenChange(false);
      }, 650);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
                <Ruler className="w-4 h-4 text-sky-700" />
              </div>
              <div>
                <DialogTitle>
                  Antropometria & Composição Corporal
                </DialogTitle>
                <DialogDescription>
                  Paciente: <strong className="text-slate-700">{patientName}</strong> • Circunferências em centímetros (cm) e composição corporal
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-6 space-y-5">
            {/* FAIXA DE CONTEXTO DA ÚLTIMA AVALIAÇÃO (CONSOLIDADA COM ÚLTIMO VALOR NÃO-NULO DE CADA CAMPO) */}
            {latestMeasurement && (() => {
              const summaryItems = CIRCUMFERENCE_FIELDS.map((field) => {
                const raw = latestMeasurement[field.key];
                if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
                  return null;
                }
                const formatted =
                  field.unit === "%"
                    ? `${formatBrDecimal(Number(raw))}%`
                    : `${formatBrDecimal(Number(raw))} cm`;
                return {
                  key: field.key,
                  label: field.shortLabel,
                  formatted,
                };
              }).filter((item): item is { key: keyof Omit<FormFieldsState, "measuredAt" | "notes">; label: string; formatted: string } => item !== null);

              return (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-sky-50/70 border border-sky-200/80 text-xs">
                  <div className="text-sky-950 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-bold">
                      Última aferição ({formatarDataBR(latestMeasurement.measuredAt)}):
                    </span>
                    {summaryItems.length > 0 ? (
                      summaryItems.slice(0, 4).map((item, idx) => (
                        <span key={item.key} className="inline-flex items-center gap-1">
                          {idx > 0 && <span className="text-sky-300">•</span>}
                          <span>{item.label}:</span>
                          <strong className="font-mono">{item.formatted}</strong>
                        </span>
                      ))
                    ) : (
                      <span className="text-sky-700">Medidas registradas</span>
                    )}
                    {summaryItems.length > 4 && (
                      <span className="text-[10px] font-semibold text-sky-700">
                        +{summaryItems.length - 4} medida(s)
                      </span>
                    )}
                  </div>
                  {onOpenHistory && totalRecords > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenHistory();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:text-sky-900 shrink-0 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Ver histórico ({totalRecords})</span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* DATA DA AVALIAÇÃO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 mb-1">
                  <CalendarDays className="w-3.5 h-3.5 text-teal-600" />
                  <span>Data da Avaliação</span>
                </label>
                <Input
                  type="date"
                  value={form.measuredAt}
                  onChange={(e) => handleFieldChange("measuredAt", e.target.value)}
                  className="bg-slate-50/60"
                />
              </div>

              <div className="text-[11px] text-slate-500 pb-2">
                Preencha os campos aferidos na consulta. Campos em branco não substituem medições anteriores.
              </div>
            </div>

            {/* GRID 2 COLUNAS: % GORDURA E CIRCUNFERÊNCIAS EM CM */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {CIRCUMFERENCE_FIELDS.map((field) => {
                const previousValue = latestMeasurement?.[field.key];
                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-xl border transition-colors ${
                      field.highlight
                        ? "bg-slate-50/90 border-slate-200"
                        : "bg-white border-slate-200/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        {field.key === "bodyFatPercentage" && (
                          <Percent className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        )}
                        <span>{field.label}</span>
                      </label>
                      {previousValue !== undefined && previousValue !== null && (
                        <span className="text-[10px] font-medium text-slate-400 shrink-0 font-mono">
                          Anterior: {formatBrDecimal(Number(previousValue))}
                          {field.unit === "%" ? "%" : " cm"}
                        </span>
                      )}
                    </div>
                    <div className="relative flex items-center">
                      <Input
                        type="text"
                        inputMode="decimal"
                        noUppercase
                        value={form[field.key]}
                        onChange={(e) =>
                          handleFieldChange(field.key, e.target.value)
                        }
                        placeholder={field.placeholder}
                        className="pr-10 font-mono text-sm font-semibold"
                      />
                      <span className="absolute right-3 text-[11px] font-bold text-slate-400 pointer-events-none">
                        {field.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* OBSERVAÇÕES CLÍNICAS OPCIONAIS */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Observações da Avaliação (Opcional)
              </label>
              <Input
                type="text"
                noUppercase
                value={form.notes}
                onChange={(e) => handleFieldChange("notes", e.target.value)}
                placeholder="Ex: Bioimpedância realizada em jejum matinal / Protocolo 7 pregas..."
              />
            </div>

            {/* FEEDBACKS */}
            {errorMsg && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-700 hover:to-teal-700 shadow-sm transition-all cursor-pointer disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando Medidas...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Antropometria</span>
                </>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
