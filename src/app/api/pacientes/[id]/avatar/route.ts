export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/avatar
 * Retorna a foto de perfil (Base64 Data URI) do paciente
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, fullName: true, avatarUrl: true, photoUrl: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { sucesso: false, error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    const avatarUrl = paciente.avatarUrl || paciente.photoUrl || null;
    return NextResponse.json({ sucesso: true, avatarUrl });
  } catch (error: any) {
    console.error("[API_AVATAR_GET_ERROR]", error);
    return NextResponse.json(
      { sucesso: false, error: "Erro ao obter avatar.", details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pacientes/[id]/avatar
 * Salva a foto de perfil diretamente em formato Base64 (Data URI) no banco de dados.
 * Arquitetura Lean MVP (sem storage externo).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // 1. Verifica se o paciente existe
    const paciente = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { sucesso: false, error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    let base64String = "";

    const reqContentType = req.headers.get("content-type") || "";

    // A) Processamento via multipart/form-data
    if (reqContentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = (formData.get("file") || formData.get("avatar") || formData.get("image")) as File | null;

      if (!file) {
        return NextResponse.json(
          { sucesso: false, error: "Nenhum arquivo de imagem enviado no FormData." },
          { status: 400 }
        );
      }

      const mimeType = file.type || "image/jpeg";
      const bytes = await file.arrayBuffer();
      const rawBase64 = Buffer.from(bytes).toString("base64");
      base64String = `data:${mimeType};base64,${rawBase64}`;
    }
    // B) Processamento via application/json (padrão Lean Base64)
    else {
      const body = await req.json();
      const candidate = body.imageBase64 || body.avatarBase64 || body.avatarUrl;

      if (!candidate || typeof candidate !== "string") {
        return NextResponse.json(
          { sucesso: false, error: "Envie a string imageBase64 no formato data:image/jpeg;base64,..." },
          { status: 400 }
        );
      }

      // Garante o prefixo data:image/...;base64,
      if (candidate.startsWith("data:")) {
        base64String = candidate;
      } else {
        const mime = body.mimeType || "image/jpeg";
        base64String = `data:${mime};base64,${candidate}`;
      }
    }

    // 2. Trava Rigorosa de Tamanho (Máximo de 2MB = 2048 * 1024 bytes)
    // Em base64, o tamanho em bytes é aproximadamente (comprimento * 3) / 4
    const rawData = base64String.includes("base64,")
      ? base64String.split("base64,")[1]
      : base64String;
    const approximateBytes = Math.round((rawData.length * 3) / 4);
    const MAX_AVATAR_SIZE_BYTES = 2048 * 1024; // 2MB

    if (approximateBytes > MAX_AVATAR_SIZE_BYTES) {
      return NextResponse.json(
        {
          sucesso: false,
          error: "A imagem selecionada é muito pesada. Por favor, escolha uma foto menor (máximo 2MB).",
        },
        { status: 400 }
      );
    }

    // 3. Salva diretamente no campo @db.Text do PostgreSQL
    const pacienteAtualizado = await prisma.patient.update({
      where: { id },
      data: {
        avatarUrl: base64String,
        photoUrl: base64String,
      },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      mensagem: "Foto de perfil em Base64 salva com sucesso no banco de dados!",
      avatarUrl: pacienteAtualizado.avatarUrl,
      paciente: {
        id: pacienteAtualizado.id,
        nome: pacienteAtualizado.fullName,
      },
    });
  } catch (error: any) {
    console.error("[API_AVATAR_POST_ERROR]", error);
    return NextResponse.json(
      { sucesso: false, error: "Erro ao salvar foto de perfil.", details: error?.message },
      { status: 500 }
    );
  }
}
