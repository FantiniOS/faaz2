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
  "/api/consultas",
  "/api/dados-clinicos",
  "/api/checkins/glicemia",
  "/api/checkins/intestino",
  "/api/checkins/hidratacao",
  "/api/checkins/auditoria",
  "/dashboard/prontuarios",
];

// Rotas administrativas (gestão de equipe)
const ROTAS_ADMINISTRATIVAS = [
  "/api/equipe",
  "/dashboard/equipe",
  "/configuracoes/equipe",
  "/api/usuarios",
];

// Rotas públicas que NÃO exigem autenticação
const ROTAS_PUBLICAS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/paciente",   // Autenticação do App Mobile do Paciente via CPF
  "/api/checkins",       // API pública para o app móvel
  "/api/checkin-intestinal",
];

// Rotas protegidas que exigem autenticação mas não são clínicas
const ROTAS_PROTEGIDAS_PADRAO = [
  "/dashboard",
  "/agenda",
  "/alertas",
  "/api/auth/me",
  "/api/pacientes",
  "/api/busca",
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
    (sessao as any)?.role === "SECRETARIA" ||
    (sessao as any)?.role === "RECEPTIONIST";

  if (isSecretaria) {
    const isRotaClinica =
      ROTAS_CLINICAS_SENSIVEIS.some((rota) => pathname.startsWith(rota)) ||
      pathname.includes("/prontuario");

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
    (pathname.startsWith("/api/pacientes/") && request.method === "GET") ||
    (pathname.startsWith("/api/pacientes/") &&
      pathname.endsWith("/proxima-consulta")) ||
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
    "/api/checkins/intestino",
    "/api/checkins/hidratacao",
    "/api/checkins/auditoria",
    "/configuracoes",
    "/configuracoes/:path*",
    "/api/usuarios/:path*",
    "/api/equipe/:path*",
    "/api/pacientes/:path*",
    "/api/busca",
    "/api/auth/me",
  ],
};
