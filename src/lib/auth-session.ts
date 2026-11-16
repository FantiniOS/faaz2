// ============================================================================
// JWT SESSION MANAGEMENT — CLÍNICA FAAZ
// Utiliza jose para criação e validação de tokens JWT (Edge-compatible)
// ============================================================================
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Cargo, UserSessionPayload } from "./auth-rbac";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "endoc-faaz-secret-dev-key-change-in-prod-2024"
);

const COOKIE_NAME = "endoc_session";

/**
 * Cria um JWT com os dados da sessão e define o cookie HTTP-only
 */
export async function criarSessao(payload: UserSessionPayload): Promise<string> {
  const token = await new SignJWT({
    userId: payload.userId,
    nome: payload.nome,
    cargo: payload.cargo,
    email: payload.email,
    organizationId: payload.organizationId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h") // Sessão de 8 horas (turno clínico)
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60, // 8 horas
  });

  return token;
}

/**
 * Recupera e valida a sessão do usuário a partir do cookie JWT
 */
export async function getSessao(req?: any): Promise<UserSessionPayload | null> {
  try {
    let token: string | undefined;
    if (req && req.cookies && typeof req.cookies.get === "function") {
      token = req.cookies.get(COOKIE_NAME)?.value;
    }
    if (!token) {
      const cookieStore = await cookies();
      token = cookieStore.get(COOKIE_NAME)?.value;
    }
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);

    return {
      userId: payload.userId as string,
      nome: payload.nome as string,
      cargo: payload.cargo as Cargo,
      email: payload.email as string,
      organizationId: payload.organizationId as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Verifica JWT de string pura (para uso no Middleware/Edge)
 */
export async function verificarTokenString(token: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      nome: payload.nome as string,
      cargo: payload.cargo as Cargo,
      email: payload.email as string,
      organizationId: payload.organizationId as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Destroi a sessão (logout) removendo o cookie
 */
export async function destruirSessao(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
