import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import logoFaaz from "../assets/logo.png";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Info,
  Send,
} from "lucide-react-native";
import { usePatientAuth } from "../contexts/PatientAuthContext";
import { StandardHeader } from "../components/StandardHeader";
import api from "../services/api";

export interface BristolOption {
  tipo: number;
  tituloLeigo: string;
  descricao: string;
  classificacao: "alerta" | "ideal" | "atencao";
  tagTexto: string;
}

const bristolOptions: BristolOption[] = [
  {
    tipo: 1,
    tituloLeigo: "Bolinhas duras e separadas",
    descricao: "Difícil de evacuar, parece pequenos coquinhos secos.",
    classificacao: "alerta",
    tagTexto: "Pouca água ou fibra",
  },
  {
    tipo: 2,
    tituloLeigo: "Formato de salsicha, mas empedrado",
    descricao: "Massa firme e irregular, ainda um pouco desconfortável.",
    classificacao: "atencao",
    tagTexto: "Quase constipado",
  },
  {
    tipo: 3,
    tituloLeigo: "Formato de salsicha com rachaduras",
    descricao: "Consistência boa, fácil de sair, com algumas fissuras na superfície.",
    classificacao: "ideal",
    tagTexto: "Muito bom",
  },
  {
    tipo: 4,
    tituloLeigo: "Salsicha lisa e macia (O Ideal)",
    descricao: "Consistência perfeita, lisa, macia e sai sem nenhum esforço.",
    classificacao: "ideal",
    tagTexto: "Ideal & Saudável ⭐",
  },
  {
    tipo: 5,
    tituloLeigo: "Pedaços macios e separados",
    descricao: "Pedaços fáceis de sair, mas sem formato contínuo.",
    classificacao: "atencao",
    tagTexto: "Digestão rápida",
  },
  {
    tipo: 6,
    tituloLeigo: "Pastoso e esfarrapado",
    descricao: "Bordas desfeitas, fezes muito moles e pastosas.",
    classificacao: "alerta",
    tagTexto: "Leve desarranjo",
  },
  {
    tipo: 7,
    tituloLeigo: "Totalmente líquido",
    descricao: "Sem partes sólidas, quase totalmente água.",
    classificacao: "alerta",
    tagTexto: "Atenção (Diarreia)",
  },
];

export interface BristolCheckinScreenProps {
  onBack: () => void;
  onSuccess?: (tipo: number) => void;
}

export function BristolCheckinScreen({
  onBack,
  onSuccess,
}: BristolCheckinScreenProps) {
  const { paciente } = usePatientAuth();
  const realPacienteId = paciente?.id || "64c92488-a3be-465e-9af8-9553eb12a07c";
  const nomePaciente = paciente?.nome || "Carlos Fantini";

  const [selectedTipo, setSelectedTipo] = useState<number>(4); // Default no ideal
  const [sintoma, setSintoma] = useState<string>("Nenhum");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  async function handleSalvar() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const categoria =
      selectedTipo <= 2
        ? "constipacao"
        : selectedTipo <= 4
        ? "ideal"
        : "diarreia";

    const sintomasArray = sintoma !== "Nenhum" ? [sintoma] : [];

    try {
      await api.checkins.registrarIntestino({
        pacienteId: realPacienteId,
        tipoBristol: selectedTipo,
        categoria,
        sintomas: sintomasArray,
      });

      // 3. Re-fetch e Reatividade de Interface
      if (onSuccess) {
        onSuccess(selectedTipo);
      }

      // 2. Feedback visual nativo rápido
      const feedbackMsg = `Registro intestinal sincronizado com sucesso com o prontuário de ${nomePaciente}.`;
      if (typeof alert === "function") {
        alert(feedbackMsg);
      } else {
        Alert.alert("Sucesso", feedbackMsg);
      }

      // Desmontagem automática e imediata
      onBack();
    } catch (err: any) {
      const errorMsg =
        err?.message || "Não foi possível sincronizar o registro. Verifique a conexão.";
      if (typeof alert === "function") {
        alert(errorMsg);
      } else {
        Alert.alert("Falha no Registro", errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-slate-50" style={{ flex: 1, backgroundColor: "#f8fafc" }}>

      {/* CABEÇALHO PADRÃO GLOBAL */}
      <StandardHeader
        title="Check-in Intestinal"
        onBack={onBack}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 }}
        style={{ flex: 1 }}
        className="flex-1 px-4 sm:px-6 pt-4"
      >
        {/* BANNER ACOLHEDOR */}
        <View className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center gap-2 mb-1">
            <Sparkles size={16} color="#059669" />
            <Text className="text-xs font-semibold text-emerald-800">
              COMO FOI HOJE?
            </Text>
          </View>
          <Text className="text-xs text-emerald-900 font-normal leading-relaxed">
            Escolha a opção que mais se pareceu com sua evacuação de hoje. Essa
            informação ajuda seu médico a ajustar suas fibras, água e probióticos!
          </Text>
        </View>

        {/* LISTA DAS OPÇÕES LEIGAS (BRISTOL) */}
        <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
          Selecione a textura mais próxima:
        </Text>

        <View className="space-y-2.5 mb-6">
          {bristolOptions.map((opt) => {
            const isSelected = selectedTipo === opt.tipo;
            const isIdeal = opt.classificacao === "ideal";

            return (
              <TouchableOpacity
                key={opt.tipo}
                activeOpacity={0.8}
                onPress={() => setSelectedTipo(opt.tipo)}
                className={`p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? "bg-emerald-50/90 border-emerald-500 shadow-xs"
                    : "bg-white border-slate-100 shadow-xs"
                }`}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-1">
                      <Text
                        className={`text-sm font-semibold ${
                          isSelected ? "text-emerald-900" : "text-slate-900"
                        }`}
                      >
                        {opt.tituloLeigo}
                      </Text>

                      <View
                        className={`px-2 py-0.5 rounded-md ${
                          isIdeal
                            ? "bg-emerald-100"
                            : opt.classificacao === "atencao"
                            ? "bg-amber-100"
                            : "bg-rose-100"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${
                            isIdeal
                              ? "text-emerald-800"
                              : opt.classificacao === "atencao"
                              ? "text-amber-800"
                              : "text-rose-800"
                          }`}
                        >
                          {opt.tagTexto}
                        </Text>
                      </View>
                    </View>

                    <Text className="text-xs text-slate-600 font-normal leading-relaxed">
                      {opt.descricao}
                    </Text>
                  </View>

                  <View
                    className={`w-6 h-6 rounded-full items-center justify-center mt-0.5 ${
                      isSelected
                        ? "bg-emerald-600"
                        : "border-2 border-slate-200"
                    }`}
                  >
                    {isSelected && <CheckCircle2 size={16} color="#ffffff" />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* PERGUNTA COMPLEMENTAR: DESCONFORTO */}
        <View className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs mb-6">
          <Text className="text-xs font-semibold text-slate-700 mb-2">
            Sentiu algum desconforto hoje?
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {["Nenhum", "Gases", "Estufamento", "Cólica leve"].map((item) => {
              const active = sintoma === item;
              return (
                <TouchableOpacity
                  key={item}
                  activeOpacity={0.7}
                  onPress={() => setSintoma(item)}
                  className={`px-3 py-1.5 rounded-xl border ${
                    active
                      ? "bg-emerald-600 border-emerald-600"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      active ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* BOTÃO SALVAR */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSalvar}
          disabled={isSubmitting}
          style={isSubmitting ? { opacity: 0.6 } : undefined}
          className={`py-4 rounded-2xl items-center justify-center shadow-md flex-row gap-2 ${
            isSubmitting
              ? "bg-emerald-400"
              : "bg-emerald-600 active:bg-emerald-700"
          }`}
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text className="text-sm font-semibold text-white">
                SALVANDO...
              </Text>
            </>
          ) : (
            <>
              <Send size={18} color="#ffffff" />
              <Text className="text-sm font-semibold text-white">
                SALVAR REGISTRO
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export default BristolCheckinScreen;
