"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Plus, Flame, X, Loader2 } from "lucide-react";
import { FoodThumbnail } from "@/components/FoodThumbnail";

export interface AlimentoOption {
  id: string;
  nome: string;
  porcaoBase: number;
  calorias: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  fibras?: number | null;
  categoria?: string | null;
  fonte?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  fotoUrl?: string | null;
  // Aliases TACO e inglês para resiliência de mapeamento
  protein?: number;
  proteins?: number;
  carbohydrate?: number;
  carbohydrates?: number;
  lipid?: number;
  lipids?: number;
  fats?: number;
  calories?: number;
  caloriasBase?: number;
  caloriasPorcao?: number;
  proteinasPorcao?: number;
  carboidratosPorcao?: number;
  gordurasPorcao?: number;
  fibrasPorcao?: number;
}

interface AlimentoAddRowProps {
  onAddAlimento: (alimento: AlimentoOption, quantidadeGramas: number) => void;
  disabled?: boolean;
}

export function AlimentoCombobox({
  onAddAlimento,
  disabled = false,
}: AlimentoAddRowProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [resultados, setResultados] = useState<AlimentoOption[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [selectedAlimento, setSelectedAlimento] = useState<AlimentoOption | null>(null);
  const [gramas, setGramas] = useState<number>(100);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputSearchRef = useRef<HTMLInputElement>(null);

  // Busca Assíncrona no Banco TACO
  const executarBusca = useCallback(async (termo: string) => {
    try {
      setCarregando(true);
      const url = termo.trim()
        ? `/api/alimentos?q=${encodeURIComponent(termo.trim())}`
        : "/api/alimentos";

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setResultados(data.alimentos || []);
      }
    } catch (err) {
      console.error("Erro na busca assíncrona de alimentos:", err);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Busca em Tempo Real com useDebounce (300ms) diretamente ao digitar no input
  useEffect(() => {
    const timer = setTimeout(() => {
      executarBusca(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, executarBusca]);

  // Carrega sugestões iniciais ao montar o componente
  useEffect(() => {
    executarBusca("");
  }, [executarBusca]);

  // Fecha o dropdown ao clicar fora ou pressionar Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSelect = (alimento: AlimentoOption) => {
    setSelectedAlimento(alimento);
    setOpen(false);
    setSearch("");
  };

  const handleConfirmAdd = () => {
    if (!selectedAlimento) return;
    onAddAlimento(selectedAlimento, gramas > 0 ? gramas : 100);
    setSelectedAlimento(null);
    setGramas(100);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100"
    >
      {/* 1. SELEÇÃO DO ALIMENTO (COMBOBOX COM MENU SUSPENSO ELEGANTE) */}
      <div className="relative flex-1 min-w-[260px] max-w-[420px]">
        {selectedAlimento ? (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <FoodThumbnail
                nome={selectedAlimento.nome}
                categoria={selectedAlimento.categoria}
                imageUrl={
                  selectedAlimento.thumbnailUrl ||
                  selectedAlimento.imageUrl ||
                  selectedAlimento.fotoUrl
                }
                className="w-8 h-8 rounded-md"
              />
              <div className="flex flex-col truncate">
                <span className="font-bold text-emerald-950 truncate max-w-[180px] sm:max-w-[240px]">
                  {selectedAlimento.nome}
                </span>
                <span className="text-[10px] font-mono text-emerald-700">
                  {selectedAlimento.calorias} kcal / {selectedAlimento.porcaoBase || 100}g
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedAlimento(null);
                setOpen(true);
                setTimeout(() => inputSearchRef.current?.focus(), 50);
              }}
              className="text-emerald-700 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-200/50 cursor-pointer transition-colors"
              title="Trocar alimento selecionado"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              {carregando ? (
                <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
            </div>

            {/* INPUT DE BUSCA REAL-TIME 100% RESPONSIVO E DESBLOQUEADO */}
            <input
              ref={inputSearchRef}
              type="text"
              disabled={disabled}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!open) setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                if (resultados.length === 0) executarBusca(search);
              }}
              placeholder="Buscar alimento (ex: arroz, frango, maçã)..."
              className="w-full text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg pl-8 pr-7 py-2 outline-hidden transition-all placeholder:text-slate-400 shadow-2xs"
            />

            {search.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  inputSearchRef.current?.focus();
                }}
                className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* 2. MENU SUSPENSO ELEGANTE (ABSOLUTE / Z-50 / ABAIXO DO INPUT COM ROLAGEM INTERNA) */}
            {open && !selectedAlimento && (
              <div className="absolute top-full left-0 w-full z-50 bg-white shadow-lg border border-slate-200 rounded-md mt-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                {carregando ? (
                  <div className="py-6 text-center text-xs text-slate-500 font-medium flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                    <span>Buscando alimentos...</span>
                  </div>
                ) : resultados.length === 0 ? (
                  <div className="py-6 px-4 text-center text-xs text-slate-500 font-medium flex flex-col items-center justify-center gap-1">
                    <span>Nenhum alimento encontrado para esta busca.</span>
                    {search && (
                      <span className="text-[11px] text-slate-400">
                        Tente buscar por termos mais genéricos (ex: &quot;arroz&quot;, &quot;frango&quot;, &quot;ovo&quot;).
                      </span>
                    )}
                  </div>
                ) : (
                  resultados.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className="flex items-center justify-between p-2.5 hover:bg-teal-50/80 cursor-pointer transition-colors group gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FoodThumbnail
                          nome={item.nome}
                          categoria={item.categoria}
                          imageUrl={item.thumbnailUrl || item.imageUrl || item.fotoUrl}
                        />
                        <div className="flex flex-col text-left truncate">
                          <span className="font-bold text-xs text-slate-800 group-hover:text-teal-950 truncate">
                            {item.nome}
                          </span>
                          <span className="text-[10px] text-slate-400 group-hover:text-teal-800">
                            {item.categoria || "Geral"} • P: {item.proteinas}g | C: {item.carboidratos}g | G: {item.gorduras}g
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/70 font-mono text-[10px] font-bold shadow-2xs">
                          <Flame className="w-2.5 h-2.5 text-amber-500" />
                          {item.calorias} kcal
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. INPUT DE GRAMAS */}
      <div className="relative flex items-center">
        <input
          type="number"
          min={5}
          step={5}
          value={gramas}
          onChange={(e) => setGramas(Math.max(1, Number(e.target.value) || 0))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && selectedAlimento) {
              e.preventDefault();
              handleConfirmAdd();
            }
          }}
          disabled={disabled || !selectedAlimento}
          placeholder="100"
          className="w-20 pl-2 pr-6 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg text-xs font-mono font-bold text-slate-800 outline-hidden text-right transition-colors disabled:opacity-40 shadow-2xs"
        />
        <span className="absolute right-2 text-[10px] font-bold text-slate-400 pointer-events-none">
          g
        </span>
      </div>

      {/* 4. BOTÃO + ADICIONAR */}
      <button
        type="button"
        disabled={disabled || !selectedAlimento}
        onClick={handleConfirmAdd}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 active:scale-95"
        title="Adicionar alimento à refeição"
      >
        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>Adicionar</span>
      </button>
    </div>
  );
}
