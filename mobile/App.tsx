import "./global.css";
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Component,
  ErrorInfo,
  ReactNode,
} from "react";
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { HomeScreen } from "./src/screens/HomeScreen";
import { BristolCheckinScreen } from "./src/screens/BristolCheckinScreen";
import { GlicemiaCheckinScreen } from "./src/screens/GlicemiaCheckinScreen";
import { MedidasCheckinScreen } from "./src/screens/MedidasCheckinScreen";
import { DietaScreen } from "./src/screens/DietaScreen";
import { SleepCheckInScreen } from "./src/screens/SleepCheckInScreen";
import { MetasScreen } from "./src/screens/MetasScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { PatientLoginScreen } from "./src/screens/PatientLoginScreen";
import {
  PatientAuthProvider,
  usePatientAuth,
  PacienteLogado,
} from "./src/contexts/PatientAuthContext";
import { DiarioAlimentarProvider } from "./src/contexts/DiarioAlimentarContext";

// Error Boundary para evitar crashes silenciosos (Black Screen) no boot do app
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  errorDescription: string;
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorDescription: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorDescription: error?.message || "Erro inesperado" };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppErrorBoundary] Erro capturado no layout:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorDescription: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Clínica FAAZ</Text>
          <Text style={styles.errorSubtitle}>Recuperação de Interface</Text>
          <Text style={styles.errorText}>
            Detectamos uma inconsistência no carregamento da tela:
          </Text>
          <Text style={styles.errorCode}>{this.state.errorDescription}</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={this.handleReset}
            activeOpacity={0.8}
          >
            <Text style={styles.errorButtonText}>Recarregar Interface</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

type ScreenRoute =
  | "home"
  | "bristol"
  | "glicemia"
  | "medidas"
  | "dieta"
  | "sono"
  | "metas"
  | "perfil";

interface AppRouterProps {
  paciente: PacienteLogado | null;
  isInitializing: boolean;
  onPacienteUpdated: (parcial: Partial<PacienteLogado>) => Promise<void>;
}

function AppRouter({
  paciente,
  isInitializing,
  onPacienteUpdated,
}: AppRouterProps) {
  const [screenStack, setScreenStack] = useState<ScreenRoute[]>(["home"]);
  const stackRef = useRef<ScreenRoute[]>(["home"]);
  const [completedCheckins, setCompletedCheckins] = useState<string[]>([]);
  const [refreshVersion, setRefreshVersion] = useState<number>(0);

  const currentScreen: ScreenRoute = screenStack[screenStack.length - 1] ?? "home";
  const hasAuthenticatedSession = Boolean(paciente) && !isInitializing;

  const navigation = useMemo(
    () => ({
      canGoBack: () => hasAuthenticatedSession && stackRef.current.length > 1,
      goBack: () => {
        if (!hasAuthenticatedSession || stackRef.current.length <= 1) {
          return false;
        }
        const next = stackRef.current.slice(0, -1);
        stackRef.current = next;
        setScreenStack(next);
        return true;
      },
      popToTop: () => {
        const next: ScreenRoute[] = ["home"];
        stackRef.current = next;
        setScreenStack(next);
      },
      reset: (
        stateOrRoute?:
          | ScreenRoute
          | { index?: number; routes?: Array<{ name: ScreenRoute }> }
      ) => {
        if (typeof stateOrRoute === "string") {
          const next: ScreenRoute[] =
            stateOrRoute === "home" ? ["home"] : ["home", stateOrRoute];
          stackRef.current = next;
          setScreenStack(next);
          return;
        }
        if (
          stateOrRoute &&
          Array.isArray(stateOrRoute.routes) &&
          stateOrRoute.routes.length > 0
        ) {
          const next = stateOrRoute.routes.map((r) => r.name);
          stackRef.current = next;
          setScreenStack(next);
          return;
        }
        const next: ScreenRoute[] = ["home"];
        stackRef.current = next;
        setScreenStack(next);
      },
      navigate: (target: ScreenRoute) => {
        if (target === "home") {
          const next: ScreenRoute[] = ["home"];
          stackRef.current = next;
          setScreenStack(next);
          return;
        }
        const prev = stackRef.current;
        if (prev[prev.length - 1] === target) return;
        // Deduplica rotas repetidas preservando a Home como raiz da pilha
        const next: ScreenRoute[] = [...prev.filter((s) => s !== target), target];
        stackRef.current = next;
        setScreenStack(next);
      },
    }),
    [hasAuthenticatedSession]
  );

  // Interceptação global do botão físico / gesto nativo "Voltar" no Android
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [navigation]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleTabPress = useCallback(
    (tabName: string) => {
      const key = tabName.trim().toLowerCase();
      if (key === "hoje" || key === "home") {
        navigation.reset({ index: 0, routes: [{ name: "home" }] });
      } else if (key === "dieta") {
        navigation.reset({ index: 1, routes: [{ name: "home" }, { name: "dieta" }] });
      } else if (key === "evolução" || key === "evolucao" || key === "metas") {
        navigation.reset({ index: 1, routes: [{ name: "home" }, { name: "metas" }] });
      } else if (key === "clínica" || key === "clinica" || key === "perfil") {
        navigation.reset({ index: 1, routes: [{ name: "home" }, { name: "perfil" }] });
      }
    },
    [navigation]
  );

  const handleNavigateToCheckin = useCallback(
    (id: string) => {
      if (id === "glicemia") {
        navigation.navigate("glicemia");
      } else if (id === "bristol") {
        navigation.navigate("bristol");
      } else if (id === "medidas") {
        navigation.navigate("medidas");
      } else if (id === "sono") {
        navigation.navigate("sono");
      }
    },
    [navigation]
  );

  function handleCheckinSuccess(checkinId: string) {
    setCompletedCheckins((prev) =>
      prev.includes(checkinId) ? prev : [...prev, checkinId]
    );
    setRefreshVersion((v) => v + 1);
  }

  // Enquanto valida o SecureStore (Persistent Login), exibe tela de inicialização suave
  if (isInitializing) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.splashText}>Iniciando Clínica FAAZ...</Text>
      </View>
    );
  }

  // Se não houver paciente autenticado, exibe a tela de login elegante da Clínica FAAZ
  if (!paciente) {
    return (
      <View style={styles.screenContainer} pointerEvents="box-none">
        <PatientLoginScreen />
      </View>
    );
  }

  return (
    <View style={styles.screenContainer} pointerEvents="box-none">
      {currentScreen === "home" ? (
        <HomeScreen
          completedCheckins={completedCheckins}
          refreshKey={refreshVersion}
          onNavigateToCheckin={handleNavigateToCheckin}
          onTabPress={handleTabPress}
          onNavigateToDieta={() => handleTabPress("Dieta")}
          onNavigateToMetas={() => handleTabPress("Evolução")}
        />
      ) : currentScreen === "metas" ? (
        <MetasScreen
          pacienteId={paciente.id}
          pacienteNome={paciente.nome}
          refreshKey={refreshVersion}
          onTabPress={handleTabPress}
          onNavigateToCheckin={handleNavigateToCheckin}
          onNavigateToDieta={() => handleTabPress("Dieta")}
        />
      ) : currentScreen === "perfil" ? (
        <ProfileScreen
          onTabPress={handleTabPress}
          onNavigateToDieta={() => handleTabPress("Dieta")}
          onNavigateToMetas={() => handleTabPress("Evolução")}
          onPacienteUpdated={onPacienteUpdated}
        />
      ) : currentScreen === "glicemia" ? (
        <GlicemiaCheckinScreen
          onBack={handleBack}
          onSuccess={() => handleCheckinSuccess("glicemia")}
        />
      ) : currentScreen === "bristol" ? (
        <BristolCheckinScreen
          onBack={handleBack}
          onSuccess={() => handleCheckinSuccess("bristol")}
        />
      ) : currentScreen === "medidas" ? (
        <MedidasCheckinScreen
          pacienteId={paciente.id}
          onBack={handleBack}
          onSuccess={() => handleCheckinSuccess("medidas")}
        />
      ) : currentScreen === "sono" ? (
        <SleepCheckInScreen
          pacienteId={paciente.id}
          onBack={handleBack}
          onSuccess={() => handleCheckinSuccess("sono")}
        />
      ) : (
        <DietaScreen
          pacienteId={paciente.id}
          pacienteNome={paciente.nome}
          onTabPress={handleTabPress}
        />
      )}
    </View>
  );
}

function MainNavigator() {
  const { paciente, isInitializing, atualizarPacienteLocal } = usePatientAuth();
  const isAuthenticated = Boolean(paciente) && !isInitializing;

  return (
    <SafeAreaView
      edges={
        isAuthenticated
          ? ["bottom", "left", "right"]
          : ["top", "bottom", "left", "right"]
      }
      className="flex-1 w-full h-full"
      style={styles.safeAreaContainer}
      pointerEvents="box-none"
    >
      <StatusBar
        barStyle={isAuthenticated ? "light-content" : "dark-content"}
        {...(Platform.OS === "android"
          ? { backgroundColor: isAuthenticated ? "#0f172a" : "#f8fafc" }
          : {})}
      />
      <View style={styles.navigatorWrapper} pointerEvents="box-none">
        <AppRouter
          key={paciente?.id ?? "guest"}
          paciente={paciente}
          isInitializing={isInitializing}
          onPacienteUpdated={atualizarPacienteLocal}
        />
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider
      initialMetrics={initialWindowMetrics}
      style={styles.rootContainer}
      pointerEvents="box-none"
    >
      <AppErrorBoundary>
        <PatientAuthProvider>
          <DiarioAlimentarProvider>
            <MainNavigator />
          </DiarioAlimentarProvider>
        </PatientAuthProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: Platform.OS === "web" ? "#f1f5f9" : "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  safeAreaContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#f8fafc",
    alignSelf: "center",
    ...(Platform.OS === "web"
      ? {
          maxWidth: 480,
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.12,
          shadowRadius: 28,
          elevation: 10,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: "#e2e8f0",
          overflow: "hidden" as const,
        }
      : {}),
  },
  navigatorWrapper: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#f8fafc",
  },
  screenContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#f8fafc",
  },
  errorContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f766e",
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#334155",
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: "#4b5563",
    textAlign: "center",
    marginBottom: 8,
  },
  errorCode: {
    fontSize: 12,
    color: "#e11d48",
    backgroundColor: "#ffe4e6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 20,
    textAlign: "center",
  },
  splashContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  splashText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f766e",
    letterSpacing: 0.3,
  },
  errorButton: {
    backgroundColor: "#0d9488",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
});
