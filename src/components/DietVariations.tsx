"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Layers,
  Edit2,
  Trash2,
  Plus,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { VariacaoDietaState } from "@/components/DietaTab";

export interface DietVariationsProps {
  variacoes: VariacaoDietaState[];
  variacaoAtiva: VariacaoDietaState | null;
  onSelectVariacao: (variacaoId: string) => void;
  onRename: (variacaoId: string, novoNome: string) => void;
  onDeleteVariacao: (variacaoId: string) => Promise<void>;
  onOpenNovaVariacao: () => void;
}

interface DietVariationTabProps {
  variacao: VariacaoDietaState;
  isAtiva: boolean;
  podeExcluir: boolean;
  onSelect: (variacaoId: string) => void;
  onRename: (variacaoId: string, novoNome: string) => void;
  onRequestDelete: (variacao: VariacaoDietaState) => void;
}

function DietVariationTab({
  variacao,
  isAtiva,
  podeExcluir,
  onSelect,
  onRename,
  onRequestDelete,
}: DietVariationTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(variacao.nome);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    handledRef.current = false;
    setTempName(variacao.nome);
    setIsEditing(true);
  };

  const commitEdit = () => {
    if (handledRef.current) {
      return;
    }
    handledRef.current = true;
    const trimmed = tempName.trim();
    if (trimmed && trimmed !== variacao.nome) {
      onRename(variacao.id, trimmed);
    } else {
      setTempName(variacao.nome);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    handledRef.current = true;
    setTempName(variacao.nome);
    setIsEditing(false);
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-2xs ${
        isAtiva
          ? "bg-white text-teal-900 border border-teal-500/30 shadow-xs ring-1 ring-teal-500/20"
          : "text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent"
      }`}
    >
      <Layers
        className={`w-3.5 h-3.5 shrink-0 ${
          isAtiva ? "text-teal-600" : "text-slate-400"
        }`}
      />

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={tempName}
          maxLength={100}
          aria-label="Editar título da variação de dieta"
          onChange={(e) => setTempName(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancelEdit();
            }
          }}
          className="w-36 sm:w-44 px-1.5 py-0.5 text-xs font-bold text-teal-950 bg-teal-50/70 border border-teal-400 rounded-md outline-none focus:ring-2 focus:ring-teal-500/25"
        />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={isAtiva}
          onClick={() => onSelect(variacao.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onSelect(variacao.id);
            startEditing();
          }}
          title={
            isAtiva
              ? "Clique duas vezes para renomear esta variação"
              : `Selecionar ${variacao.nome}`
          }
          className="inline-flex items-center gap-2 cursor-pointer focus:outline-none"
        >
          <span>{variacao.nome}</span>
          {variacao.refeicoes.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isAtiva
                  ? "bg-teal-50 text-teal-700 font-extrabold"
                  : "bg-slate-200/70 text-slate-500"
              }`}
            >
              {variacao.refeicoes.length} ref
            </span>
          )}
        </button>
      )}

      {isAtiva && !isEditing && (
        <div className="inline-flex items-center gap-0.5 ml-0.5 pl-1.5 border-l border-slate-200/80">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            title="Renomear variação"
            aria-label={`Renomear ${variacao.nome}`}
            className="p-1 rounded-md text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
          >
            <Edit2 className="w-3 h-3" />
          </button>

          {podeExcluir && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(variacao);
              }}
              title="Excluir variação"
              aria-label={`Excluir ${variacao.nome}`}
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Barra de navegação entre variações de dieta com edição de título in-place,
 * exclusão com modal de confirmação (shadcn/ui) e proteção da última variação.
 */
export function DietVariations({
  variacoes,
  variacaoAtiva,
  onSelectVariacao,
  onRename,
  onDeleteVariacao,
  onOpenNovaVariacao,
}: DietVariationsProps) {
  const [variacaoParaExcluir, setVariacaoParaExcluir] =
    useState<VariacaoDietaState | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  const podeExcluir = variacoes.length > 1;

  const handleConfirmDelete = async () => {
    if (!variacaoParaExcluir || !podeExcluir || excluindo) return;

    try {
      setExcluindo(true);
      setErroExclusao(null);
      await onDeleteVariacao(variacaoParaExcluir.id);
      setVariacaoParaExcluir(null);
    } catch (err) {
      setErroExclusao(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir a variação de dieta."
      );
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <>
      <div className="px-6 py-2.5 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
        <div
          role="tablist"
          aria-label="Variações de dieta"
          className="flex items-center gap-1.5 overflow-x-auto py-0.5"
        >
          {variacoes.map((variacao) => (
            <DietVariationTab
              key={variacao.id}
              variacao={variacao}
              isAtiva={variacao.id === variacaoAtiva?.id}
              podeExcluir={podeExcluir}
              onSelect={onSelectVariacao}
              onRename={onRename}
              onRequestDelete={(target) => {
                setErroExclusao(null);
                setVariacaoParaExcluir(target);
              }}
            />
          ))}

          {/* Botão + Nova Variação */}
          <button
            type="button"
            onClick={onOpenNovaVariacao}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/80 hover:bg-white text-slate-700 hover:text-teal-800 border border-dashed border-slate-300 hover:border-teal-400 transition-all cursor-pointer shadow-2xs whitespace-nowrap ml-1"
          >
            <Plus className="w-3.5 h-3.5 text-teal-600" />
            <span>+ Nova Variação</span>
          </button>
        </div>

        {variacaoAtiva?.descricao && (
          <span className="text-[11px] text-slate-500 italic hidden lg:inline truncate max-w-sm">
            {variacaoAtiva.descricao}
          </span>
        )}
      </div>

      {/* Modal de Confirmação de Exclusão (shadcn/ui Dialog) */}
      <Dialog
        open={Boolean(variacaoParaExcluir)}
        onOpenChange={(open) => {
          if (!open && !excluindo) {
            setVariacaoParaExcluir(null);
            setErroExclusao(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <DialogTitle>Excluir variação de dieta</DialogTitle>
            </div>
            <DialogDescription className="pt-1.5 text-slate-600">
              Tem certeza que deseja excluir esta variação e todas as suas
              refeições? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-3">
            {variacaoParaExcluir && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700 flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 truncate">
                  {variacaoParaExcluir.nome}
                </span>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {variacaoParaExcluir.refeicoes.length} refeição(ões)
                </span>
              </div>
            )}

            {erroExclusao && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-xs font-medium text-rose-700">
                {erroExclusao}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              disabled={excluindo}
              onClick={() => {
                setVariacaoParaExcluir(null);
                setErroExclusao(null);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={excluindo}
              onClick={handleConfirmDelete}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {excluindo ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>{excluindo ? "Excluindo..." : "Excluir Variação"}</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
