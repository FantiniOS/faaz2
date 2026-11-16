"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  User,
  Phone,
  FileText,
  UserPlus,
  Loader2,
  X,
  Sparkles,
  ArrowRight,
  CornerDownLeft,
  Calendar,
} from "lucide-react";

export interface PacienteBuscaItem {
  id: string;
  recordCode: string;
  nome: string;
  nomeSocial?: string | null;
  cpf: string;
  telefone: string;
  planoFaaz: boolean;
  convenio: string;
  cidade: string;
  status: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserCargo?: string | null;
}

export function CommandPalette({
  isOpen,
  onClose,
  currentUserCargo,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<PacienteBuscaItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Foco automático ao abrir
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResultados([]);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Debounced search (300ms)
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResultados([]);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/busca?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setResultados(data.pacientes || []);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("[CommandPalette] Erro na busca:", err);
      } finally {
        setCarregando(false);
      }
    }, 280);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, isOpen]);

  const handleSelectPaciente = useCallback(
    (paciente: PacienteBuscaItem) => {
      onClose();
      // Se for perfil de Secretária, encaminha para a busca de cadastro ou agendamento (LGPD compliant)
      if (currentUserCargo === "SECRETARIA") {
        router.push(`/dashboard/pacientes?search=${encodeURIComponent(paciente.nome)}`);
      } else {
        // Médicos e Admins: abre o prontuário digital diretamente
        router.push(`/pacientes/${paciente.id}`);
      }
    },
    [onClose, currentUserCargo, router]
  );

  const handleCadastrarNovo = useCallback(() => {
    onClose();
    router.push("/dashboard/pacientes?novo=true");
  }, [onClose, router]);

  // Navegação por teclado (Enter, Esc, ArrowUp, ArrowDown)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          resultados.length > 0 ? (prev + 1) % resultados.length : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          resultados.length > 0
            ? (prev - 1 + resultados.length) % resultados.length
            : 0
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (resultados.length > 0 && resultados[selectedIndex]) {
          handleSelectPaciente(resultados[selectedIndex]);
        } else if (query.trim()) {
          handleCadastrarNovo();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, resultados, selectedIndex, handleSelectPaciente, query, handleCadastrarNovo]);

  if (!isOpen) return null;

  function formatPhone(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return raw || "—";
  }

  function formatCpf(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
    return raw;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar do Command Palette */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, telefone WhatsApp ou CPF..."
            className="w-full bg-transparent text-sm sm:text-base text-slate-800 placeholder-slate-400 focus:outline-none font-medium"
          />

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {carregando && (
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
            )}
            {query && !carregando && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                title="Limpar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
              ESC
            </kbd>
          </div>
        </div>

        {/* Lista de Resultados */}
        <div className="overflow-y-auto p-2 divide-y divide-slate-100 max-h-[60vh]">
          {/* Estado Inicial (Sem busca digitada) */}
          {!query.trim() && (
            <div className="p-6 text-center text-slate-400 space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center border border-emerald-100">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-700">
                  Busca Global Inteligente da Clínica FAAZ
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Localize qualquer paciente em milissegundos por nome, CPF ou WhatsApp.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded font-mono">
                  <span>Ctrl</span> + <span>K</span>
                </span>
                <span>ou</span>
                <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded font-mono">
                  <span>⌘</span> + <span>K</span>
                </span>
                <span>para abrir a qualquer momento.</span>
              </div>
            </div>
          )}

          {/* Estado com Resultados */}
          {query.trim() && resultados.length > 0 && (
            <div className="space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Pacientes Encontrados ({resultados.length})</span>
                <span className="hidden sm:inline text-slate-400">Pressione ↑↓ para navegar e ↵ Enter para abrir</span>
              </div>

              {resultados.map((p, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPaciente(p)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50/90 border border-emerald-300/80 shadow-2xs"
                        : "hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-black ${
                          p.planoFaaz
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : isSelected
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {p.planoFaaz ? "✨" : p.nome.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-bold truncate ${
                              isSelected ? "text-emerald-950 font-extrabold" : "text-slate-900"
                            }`}
                          >
                            {p.nome}
                          </span>
                          {p.planoFaaz && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-50 border border-amber-300 text-amber-700 text-[10px] font-black uppercase tracking-wider shadow-2xs">
                              FAAZ ✨
                            </span>
                          )}
                          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded border border-slate-200">
                            {p.recordCode}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                          {p.telefone && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600">
                              <Phone className="w-3 h-3 text-emerald-600" />
                              {formatPhone(p.telefone)}
                            </span>
                          )}
                          {p.cpf && (
                            <span className="font-mono text-[11px] text-slate-400">
                              CPF: {formatCpf(p.cpf)}
                            </span>
                          )}
                          {p.cidade && (
                            <span className="text-[11px] text-slate-400 truncate max-w-xs">
                              {p.cidade}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span
                        className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg ${
                          isSelected
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {currentUserCargo === "SECRETARIA" ? "Ver Paciente" : "Prontuário"}
                        <CornerDownLeft className="w-3 h-3 ml-0.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Estado Vazio (Sem correspondência) */}
          {query.trim() && !carregando && resultados.length === 0 && (
            <div className="p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Nenhum paciente encontrado para &ldquo;{query}&rdquo;
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Verifique a ortografia ou cadastre um novo registro na clínica.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCadastrarNovo}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>+ Cadastrar novo paciente</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Palette */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-white border border-slate-200 rounded text-[10px] font-mono">↑</kbd>
              <kbd className="px-1 bg-white border border-slate-200 rounded text-[10px] font-mono">↓</kbd>
              <span className="ml-1">Navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 bg-white border border-slate-200 rounded text-[10px] font-mono">↵</kbd>
              <span className="ml-1">Selecionar</span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleCadastrarNovo}
            className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>+ Novo Paciente</span>
          </button>
        </div>
      </div>
    </div>
  );
}
