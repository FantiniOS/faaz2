import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { IsNull, Not, Raw } from "typeorm";
import { withRepositoryRetry } from "@/lib/db/data-source";
import { UserEntity } from "@/lib/db/entities";
import { criarSessao } from "@/lib/auth-session";
import type { Cargo } from "@/lib/auth-rbac";

const GENERIC_AUTH_ERROR = "Usuário ou senha inválidos.";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Informe usuário e senha para acessar o painel." },
        { status: 400 },
      );
    }

    const rawIdentifier =
      typeof body.username === "string" && body.username.trim()
        ? body.username
        : typeof body.email === "string"
          ? body.email
          : "";
    const identifier = rawIdentifier.toLowerCase().trim();
    const senha = typeof body.senha === "string" ? body.senha : "";

    if (!identifier || !senha) {
      return NextResponse.json(
        { error: "Informe usuário e senha para acessar o painel." },
        { status: 400 },
      );
    }

    // Busca estritamente usuários ativos (não excluídos, não bloqueados/revogados e não-paciente)
    // Projeção explícita sem CLOBs (mfaSecretEncrypted) para respeitar o pool leve do Oracle ADB
    const user = await withRepositoryRetry(
      UserEntity,
      (repo) =>
        repo.findOne({
          where: [
            {
              username: Raw((alias) => `LOWER(${alias}) = :id`, {
                id: identifier,
              }),
              deletedAt: IsNull(),
              accountStatus: "ACTIVE",
              role: Not("PATIENT"),
            },
            {
              email: Raw((alias) => `LOWER(${alias}) = :id`, {
                id: identifier,
              }),
              deletedAt: IsNull(),
              accountStatus: "ACTIVE",
              role: Not("PATIENT"),
            },
          ],
          select: {
            id: true,
            organizationId: true,
            fullName: true,
            username: true,
            email: true,
            passwordHash: true,
            role: true,
            cargo: true,
            podeAcessarProntuario: true,
            accountStatus: true,
            organization: {
              id: true,
              tradeName: true,
            },
          },
          relations: { organization: true },
        }),
      { label: "auth-login:find-user" },
    );

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: GENERIC_AUTH_ERROR },
        { status: 401 },
      );
    }

    const senhaValida = await bcrypt.compare(senha, user.passwordHash);
    if (!senhaValida) {
      return NextResponse.json(
        { error: GENERIC_AUTH_ERROR },
        { status: 401 },
      );
    }

    // Cria sessão JWT e define o cookie HTTP-only
    const token = await criarSessao({
      userId: user.id,
      nome: user.fullName,
      cargo: user.cargo as Cargo,
      email: user.email || "",
      organizationId: user.organizationId,
    });

    // Atualiza registro de último login sem bloquear a sessão caso falhe
    await withRepositoryRetry(
      UserEntity,
      (repo) => repo.update({ id: user.id }, { lastLoginAt: new Date() }),
      { label: "auth-login:update-last-login" },
    ).catch(() => {});

    return NextResponse.json({
      sucesso: true,
      usuario: {
        id: user.id,
        nome: user.fullName,
        username: user.username,
        email: user.email,
        cargo: user.cargo,
        role: user.role,
        podeAcessarProntuario: user.podeAcessarProntuario,
        organizacao: user.organization?.tradeName,
      },
      token,
    });
  } catch (error: unknown) {
    console.error("[AUTH/LOGIN] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor de autenticação." },
      { status: 500 },
    );
  }
}
