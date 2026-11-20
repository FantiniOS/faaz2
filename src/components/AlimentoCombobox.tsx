"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Plus, Flame, X, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { FoodThumbnail } from "@/components/FoodThumbnail";

export type UnidadeMedidaOption = "g" | "ml" | "un";

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

export interface AlimentoAddExtra {
  unidade: UnidadeMedidaOption;
  medidaCaseira: string | null;
}

interface AlimentoAddRowProps {
  onAddAlimento: (
    alimento: AlimentoOption,
    quantidadeGramas: number,
    extra?: AlimentoAddExtra
  ) => void;
  disabled?: boolean;
  showUnitAndMeasure?: boolean;
  compact?: boolean;
  placeholder?: string;
  buttonLabel?: string;
  allowQuickCreate?: boolean;
}

const CATEGORIAS_CUSTOM = [
  "Suplementos",
  "Pães e Massas",
  "Laticínios",
  "Bebidas",
  "Proteínas",
  "Frutas",
  "Gorduras",
  "Cereais e Grãos",
  "Outros",
];

export function AlimentoCombobox({
  onAddAlimento,
  disabled = false,
  showUnitAndMeasure = false,
  compact = false,
  placeholder = "Buscar alimento (ex: arroz, frango, maçã)...",
  buttonLabel = "Adicionar",
  allowQuickCreate = true,
}: AlimentoAddRowProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [resultados, setResultados] = useState<AlimentoOption[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [selectedAlimento, setSelectedAlimento] = useState<AlimentoOption | null>(null);
  const [gramas, setGramas] = useState<number>(100);
  const [unidade, setUnidade] = useState<UnidadeMedidaOption>("g");
  const [medidaCaseira, setMedidaCaseira] = useState<string>("");

  // Mini-modal de cadastro rápido de suplemento / item próprio
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("Suplementos");
  const [novaPorcaoBase, setNovaPorcaoBase] = useState("100");
  const [novasCalorias, setNovasCalorias] = useState("");
  const [novasProteinas, setNovasProteinas] = useState("0");
  const [novosCarbos, setNovosCarbos] = useState("0");
  const [novasGorduras, setNovasGorduras] = useState("0");
  const [novasFibras, setNovasFibras] = useState("0");
  const [criandoCustom, setCriandoCustom] = useState(false);
  const [erroCustom, setErroCustom] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputSearchRef = useRef<HTMLInputElement>(null);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Busca Assíncrona no Banco TACO + Itens Próprios (cancela respostas antigas fora de ordem)
  const executarBusca = useCallback(async (termo: string) => {
    const seq = ++requestSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setCarregando(true);
      const url = termo.trim()
        ? `/api/alimentos?q=${encodeURIComponent(termo.trim())}`
        : "/api/alimentos";

      const res = await fetch(url, { signal: controller.signal });
      if (res.ok && seq === requestSeqRef.current) {
        const data = await res.json();
        setResultados(data.alimentos || []);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("Erro na busca assíncrona de alimentos:", err);
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setCarregando(false);
      }
    }
  }, []);

  // Busca em Tempo Real com useDebounce (imediata ao montar/limpar, 250ms ao digitar)
  useEffect(() => {
    const delay = search.trim() ? 250 : 0;
    const timer = setTimeout(() => {
      executarBusca(search);
    }, delay);

    return () => clearTimeout(timer);
  }, [search, executarBusca]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

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
    onAddAlimento(selectedAlimento, gramas > 0 ? gramas : 100, {
      unidade,
      medidaCaseira: medidaCaseira.trim() || null,
    });
    setSelectedAlimento(null);
    setGramas(100);
    setUnidade("g");
    setMedidaCaseira("");
  };

  const handleOpenQuickCreate = () => {
    setOpen(false);
    setErroCustom(null);
    setNovoNome(search.trim());
    setNovaCategoria("Suplementos");
    setNovaPorcaoBase("100");
    setNovasCalorias("");
    setNovasProteinas("0");
    setNovosCarbos("0");
    setNovasGorduras("0");
    setNovasFibras("0");
    setIsQuickCreateOpen(true);
  };

  const handleSalvarCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroCustom(null);

    const nomeTrim = novoNome.trim();
    if (nomeTrim.length < 2) {
      setErroCustom("Informe o nome do suplemento ou alimento (mín. 2 caracteres).");
      return;
    }

    const kcalNum = Number(String(novasCalorias).replace(",", "."));
    if (!Number.isFinite(kcalNum) || kcalNum < 0) {
      setErroCustom("Informe um valor válido de calorias.");
      return;
    }

    try {
      setCriandoCustom(true);
      const res = await fetch("/api/alimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeTrim,
          categoria: novaCategoria || "Suplementos",
          porcaoBase: Number(String(novaPorcaoBase).replace(",", ".")) || 100,
          calorias: kcalNum,
          proteinas: Number(String(novasProteinas).replace(",", ".")) || 0,
          carboidratos: Number(String(novosCarbos).replace(",", ".")) || 0,
          gorduras: Number(String(novasGorduras).replace(",", ".")) || 0,
          fibras: Number(String(novasFibras).replace(",", ".")) || 0,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.status === 409 && json.alimentoExistente) {
        setSelectedAlimento(json.alimentoExistente);
        setIsQuickCreateOpen(false);
        return;
      }

      if (!res.ok || !json.alimento) {
        setErroCustom(json.error || "Não foi possível cadastrar o item.");
        return;
      }

      setSelectedAlimento(json.alimento);
      setIsQuickCreateOpen(false);
      setSearch("");
      executarBusca("");
    } catch (err) {
      console.error("Erro ao cadastrar alimento/suplemento:", err);
      setErroCustom("Erro de conexão ao salvar o item.");
    } finally {
      setCriandoCustom(false);
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`relative flex flex-wrap items-center gap-2 ${
          compact ? "pt-1.5" : "pt-2 border-t border-slate-100"
        }`}
      >
        {/* 1. SELEÇÃO DO ALIMENTO (COMBOBOX COM MENU SUSPENSO ELEGANTE) */}
        <div
          className={`relative flex-1 ${
            compact ? "min-w-[200px] max-w-[320px]" : "min-w-[240px] max-w-[380px]"
          }`}
        >
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
                  className={compact ? "w-7 h-7 rounded-md" : "w-8 h-8 rounded-md"}
                />
                <div className="flex flex-col truncate">
                  <span className="font-bold text-emerald-950 truncate max-w-[180px] sm:max-w-[220px]">
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
                  if (resultados.length === 0 && !carregando) executarBusca(search);
                }}
                placeholder={placeholder}
                className={`w-full text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg pl-8 pr-7 outline-hidden transition-all placeholder:text-slate-400 shadow-2xs ${
                  compact ? "py-1.5" : "py-2"
                }`}
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

              {/* 2. MENU SUSPENSO ELEGANTE */}
              {open && !selectedAlimento && (
                <div className="absolute top-full left-0 w-full z-50 bg-white shadow-lg border border-slate-200 rounded-md mt-1.5 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                  {carregando ? (
                    <div className="py-6 text-center text-xs text-slate-500 font-medium flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                      <span>Buscando alimentos...</span>
                    </div>
                  ) : resultados.length === 0 ? (
                    <div className="py-5 px-4 text-center text-xs text-slate-500 font-medium flex flex-col items-center justify-center gap-1">
                      <span>Nenhum alimento encontrado para esta busca.</span>
                      {search && (
                        <span className="text-[11px] text-slate-400">
                          Cadastre abaixo como suplemento ou item próprio se não estiver na TACO.
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

                  {allowQuickCreate && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleOpenQuickCreate();
                      }}
                      className="sticky bottom-0 w-full px-3 py-2.5 bg-teal-50/95 hover:bg-teal-100/90 text-teal-800 text-xs font-bold flex items-center justify-center gap-1.5 border-t border-teal-200/80 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-700" />
                      <span>
                        Cadastrar suplemento / item próprio
                        {search.trim() ? `: "${search.trim()}"` : ""}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. INPUT DE QUANTIDADE + UNIDADE (g / ml / un) */}
        <div className="flex items-center gap-1">
          <div className="relative flex items-center">
            <input
              type="number"
              min={1}
              step={unidade === "un" ? 1 : 5}
              value={gramas}
              onChange={(e) => setGramas(Math.max(0, Number(e.target.value) || 0))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedAlimento) {
                  e.preventDefault();
                  handleConfirmAdd();
                }
              }}
              disabled={disabled || !selectedAlimento}
              placeholder="100"
              className={`w-16 pl-2 pr-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg text-xs font-mono font-bold text-slate-800 outline-hidden text-right transition-colors disabled:opacity-40 shadow-2xs ${
                compact ? "py-1.5" : "py-2"
              }`}
            />
          </div>

          {showUnitAndMeasure ? (
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as UnidadeMedidaOption)}
              disabled={disabled || !selectedAlimento}
              aria-label="Unidade de medida"
              className={`px-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg text-xs font-mono font-bold text-slate-700 outline-hidden transition-colors disabled:opacity-40 shadow-2xs cursor-pointer ${
                compact ? "py-1.5" : "py-2"
              }`}
            >
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="un">un</option>
            </select>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 -ml-0.5 pr-1">g</span>
          )}
        </div>

        {/* 3.5 MEDIDA CASEIRA OPCIONAL */}
        {showUnitAndMeasure && (
          <input
            type="text"
            value={medidaCaseira}
            onChange={(e) => setMedidaCaseira(e.target.value.slice(0, 120))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && selectedAlimento) {
                e.preventDefault();
                handleConfirmAdd();
              }
            }}
            disabled={disabled || !selectedAlimento}
            placeholder="Medida caseira (ex: 2 col. sopa)"
            className={`w-44 px-2.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-lg text-xs text-slate-700 placeholder:text-slate-400 outline-hidden transition-colors disabled:opacity-40 shadow-2xs ${
              compact ? "py-1.5" : "py-2"
            }`}
          />
        )}

        {/* 4. BOTÃO + ADICIONAR */}
        <button
          type="button"
          disabled={disabled || !selectedAlimento}
          onClick={handleConfirmAdd}
          className={`inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 active:scale-95 ${
            compact ? "py-1.5" : "py-2"
          }`}
          title="Adicionar à prescrição"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{buttonLabel}</span>
        </button>
      </div>

      {/* MINI-MODAL DE CADASTRO RÁPIDO DE SUPLEMENTO / ITEM PRÓPRIO */}
      {isQuickCreateOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="cl-modal-header px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Cadastrar Suplemento / Item Próprio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickCreateOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSalvarCustom}>
              <div className="p-5 space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nome do alimento ou suplemento *
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Ex: Palatinose, Whey protein isolado, Rap10 integral"
                    className="w-full px-3 py-2 text-xs border border-slate-200 focus:border-teal-500 rounded-xl outline-none text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Categoria
                    </label>
                    <select
                      value={novaCategoria}
                      onChange={(e) => setNovaCategoria(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 focus:border-teal-500 rounded-xl outline-none bg-white text-slate-800"
                    >
                      {CATEGORIAS_CUSTOM.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Porção base (g ou ml)
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={novaPorcaoBase}
                      onChange={(e) => setNovaPorcaoBase(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-200 focus:border-teal-500 rounded-xl outline-none text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-amber-800 block mb-1">
                      Kcal *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      required
                      value={novasCalorias}
                      onChange={(e) => setNovasCalorias(e.target.value)}
                      placeholder="380"
                      className="w-full px-2.5 py-2 text-xs font-mono font-bold border border-slate-200 focus:border-teal-500 rounded-xl outline-none text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-emerald-800 block mb-1">
                      Prot. (g)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={novasProteinas}
                      onChange={(e) => setNovasProteinas(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 focus:border-teal-500 rounded-xl outline-none text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-amber-700 block mb-1">
                      Carb. (g)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={novosCarbos}
                      onChange={(e) => setNovosCarbos(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 focus:border-teal-500 rounded-xl outline-none text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-rose-700 block mb-1">
                      Gord. (g)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={novasGorduras}
                      onChange={(e) => setNovasGorduras(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 focus:border-teal-500 rounded-xl outline-none text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Fibras (g) — opcional
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={novasFibras}
                    onChange={(e) => setNovasFibras(e.target.value)}
                    className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-200 focus:border-teal-500 rounded-xl outline-none text-slate-800"
                  />
                </div>

                {erroCustom && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{erroCustom}</span>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={criandoCustom}
                  onClick={() => setIsQuickCreateOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={criandoCustom}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {criandoCustom ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar e Selecionar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
