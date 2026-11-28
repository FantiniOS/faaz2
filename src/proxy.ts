import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "endoc-faaz-secret-dev-key-change-in-prod-2024"
);

const COOKIE_NAME = "endoc_session";

// Rotas clínicas sensíveis protegidas por sigilo médico (RBAC - Clínica FAAZ)
const ROTAS_CLINICAS_SENSIVEIS = [
  "/api/prontuarios",
  "/api/dietas",
  "/api/modelos-dieta",
  "/api/consultas",
  "/api/dados-clinicos",
  "/api/checkins/glicemia",
  "/api/checkins/insulina",
  "/api/checkins/intestino",
  "/api/checkins/hidratacao",
  "/api/checkins/refeicoes",
  "/api/checkins/auditoria",
  "/api/dashboard/telemetria",
  "/dashboard/prontuarios",
];

/**
 * Extrai e valida o JWT da requisição (Edge/Node-compatible)
 */
async function extrairSessao(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      nome: payload.nome as string,
      cargo: payload.cargo as string,
      role: typeof payload.role === "string" ? payload.role : undefined,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 0. Tratamento global de CORS Preflight (OPTIONS) para o App Mobile / PWA
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin") || "*";
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, paciente-id",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 1. Assets estáticos do Next.js
  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // 2. Extrai e valida sessão JWT real
  const sessao = await extrairSessao(request);

  // 3. BLOQUEIO RIGOROSO DE DADOS CLÍNICOS PARA O PERFIL DE SECRETÁRIA (LGPD e RBAC)
  const isSecretaria =
    sessao?.cargo === "SECRETARIA" ||
    sessao?.role === "SECRETARIA" ||
    sessao?.role === "RECEPTIONIST";

  if (isSecretaria) {
    const isRotaProntuarioPagina =
      pathname.startsWith("/pacientes/") &&
      pathname !== "/pacientes/" &&
      !pathname.startsWith("/pacientes/novo");

    const isRotaClinica =
      ROTAS_CLINICAS_SENSIVEIS.some((rota) => pathname.startsWith(rota)) ||
      isRotaProntuarioPagina ||
      pathname.includes("/prontuario") ||
      pathname.includes("/exames") ||
      pathname.includes("/termometro") ||
      pathname.includes("/protocolo-glicemico") ||
      pathname.includes("/mapa-glicemico");

    if (isRotaClinica) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "Acesso Negado (LGPD/RBAC)",
            motivo:
              "Secretárias possuem acesso restrito à Agenda e Recepção. Prontuários e dados clínicos são restritos ao corpo médico.",
            cargoAtual: sessao?.cargo || "SECRETARIA",
            cargosAutorizados: ["DONO_CLINICA", "MEDICO"],
          },
          { status: 403 }
        );
      }

      const redirectUrl = new URL("/dashboard", request.url);
      redirectUrl.searchParams.set("erro", "acesso_negado_clinico");
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname === "/alertas" || pathname.startsWith("/alertas/")) {
      const redirectUrl = new URL("/dashboard", request.url);
      redirectUrl.searchParams.set("erro", "acesso_negado_alertas");
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 4. Rotas de autenticação e APIs públicas do mobile / portal do paciente
  if (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/checkins") ||
    pathname.startsWith("/api/checkin") ||
    pathname.startsWith("/api/checkin-intestinal") ||
    (pathname.startsWith("/api/pacientes/") &&
      request.method === "GET" &&
      !pathname.includes("/prontuario") &&
      !pathname.includes("/exames") &&
      !pathname.includes("/termometro") &&
      !pathname.endsWith("/pacotes")) ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/proxima-consulta")) ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/plano-resumo") &&
      request.method === "GET") ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.includes("/dieta")) ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/metas")) ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/treinos")) ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/pesagens")) ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/medicoes") &&
      request.method === "POST") ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/avatar")) ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/contato") &&
      request.method === "PATCH") ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/aceitar-termos") &&
      request.method === "POST") ||
    pathname === "/privacidade" ||
    pathname.startsWith("/privacidade/") ||
    pathname === "/api/paciente/dieta" ||
    pathname.startsWith("/api/paciente/") ||
    pathname.startsWith("/app") ||
    pathname.startsWith("/dieta")
  ) {
    const response = NextResponse.next();
    const origin = request.headers.get("origin") || "*";
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, paciente-id"
    );
    response.headers.set("Access-Control-Allow-Credentials", "true");
    return response;
  }

  const isRotaLogin =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/");

  // 5. Se estiver em /login com flag de quebra de loop (?error=loop ou ?logout=1)
  if (
    isRotaLogin &&
    (searchParams.get("error") === "loop" || searchParams.get("logout") === "1")
  ) {
    const response = NextResponse.next();
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // 6. Regra explícita para /login (sem Ping-Pong)
  if (isRotaLogin) {
    if (!sessao) {
      const response = NextResponse.next();
      if (request.cookies.has(COOKIE_NAME)) {
        response.cookies.delete(COOKIE_NAME);
      }
      return response;
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 7. Rotas protegidas sem sessão válida -> manda para /login limpando cookie corrompido
  if (!sessao) {
    if (pathname.startsWith("/api/")) {
      const hasPatientCreds =
        Boolean(request.headers.get("authorization")?.trim().toLowerCase().startsWith("bearer ")) ||
        Boolean(request.headers.get("paciente-id")?.trim());
      if (pathname.includes("/exames") && hasPatientCreds) {
        return NextResponse.json(
          {
            error:
              "Acesso negado (Sigilo Médico). Exames laboratoriais são restritos ao painel do corpo clínico.",
            bloqueado: true,
          },
          { status: 403 }
        );
      }
      const res = NextResponse.json(
        { error: "Não autenticado. Faça login para continuar.", autenticado: false },
        { status: 401 }
      );
      res.cookies.delete(COOKIE_NAME);
      return res;
    }

    if (
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/inicio") ||
      pathname.startsWith("/agenda") ||
      pathname.startsWith("/pacientes") ||
      pathname.startsWith("/configuracoes") ||
      pathname.startsWith("/alertas")
    ) {
      const loginUrl = new URL("/login", request.url);
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete(COOKIE_NAME);
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/inicio",
    "/inicio/:path*",
    "/login",
    "/dashboard/:path*",
    "/agenda/:path*",
    "/pacientes/:path*",
    "/alertas/:path*",
    "/api/prontuarios/:path*",
    "/api/dietas/:path*",
    "/api/consultas/:path*",
    "/api/dados-clinicos/:path*",
    "/api/checkins/glicemia",
    "/api/checkins/insulina",
    "/api/checkins/intestino",
    "/api/checkins/hidratacao",
    "/api/checkins/refeicoes",
    "/api/checkins/auditoria",
    "/api/dashboard/telemetria",
    "/configuracoes",
    "/configuracoes/:path*",
    "/api/usuarios/:path*",
    "/api/equipe/:path*",
    "/api/especialidades",
    "/api/especialidades/:path*",
    "/api/pacientes/:path*",
    "/api/busca",
    "/api/auth/me",
  ],
};
