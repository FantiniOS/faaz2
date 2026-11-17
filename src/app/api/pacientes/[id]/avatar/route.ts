export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRepository } from "@/lib/db/data-source";
import { PatientEntity } from "@/lib/db/entities";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/pacientes/[id]/avatar
 * Retorna a foto de perfil (Base64 Data URI) do paciente
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const patientRepo = await getRepository(PatientEntity);
    const paciente = await patientRepo.findOne({
      where: { id },
      select: { id: true, fullName: true, avatarUrl: true, photoUrl: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { sucesso: false, error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const avatarUrl = paciente.avatarUrl || paciente.photoUrl || null;
    return NextResponse.json({ sucesso: true, avatarUrl });
  } catch (error: unknown) {
    console.error("[API_AVATAR_GET_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { sucesso: false, error: "Erro ao obter avatar.", details },
      { status: 500 },
    );
  }
}

/**
 * POST /api/pacientes/[id]/avatar
 * Salva a foto de perfil diretamente em formato Base64 (Data URI) no banco de dados (CLOB Oracle).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const patientRepo = await getRepository(PatientEntity);

    // 1. Verifica se o paciente existe
    const paciente = await patientRepo.findOne({
      where: { id },
      select: { id: true, fullName: true },
    });

    if (!paciente) {
      return NextResponse.json(
        { sucesso: false, error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    let base64String = "";
    const reqContentType = req.headers.get("content-type") || "";

    if (reqContentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = (formData.get("file") ||
        formData.get("avatar") ||
        formData.get("image")) as File | null;

      if (!file) {
        return NextResponse.json(
          { sucesso: false, error: "Nenhum arquivo de imagem enviado no FormData." },
          { status: 400 },
        );
      }

      const mimeType = file.type || "image/jpeg";
      const bytes = await file.arrayBuffer();
      const rawBase64 = Buffer.from(bytes).toString("base64");
      base64String = `data:${mimeType};base64,${rawBase64}`;
    } else {
      const body = await req.json();
      const candidate = body.imageBase64 || body.avatarBase64 || body.avatarUrl;

      if (!candidate || typeof candidate !== "string") {
        return NextResponse.json(
          {
            sucesso: false,
            error: "Envie a string imageBase64 no formato data:image/jpeg;base64,...",
          },
          { status: 400 },
        );
      }

      if (candidate.startsWith("data:")) {
        base64String = candidate;
      } else {
        const mime = body.mimeType || "image/jpeg";
        base64String = `data:${mime};base64,${candidate}`;
      }
    }

    const rawData = base64String.includes("base64,")
      ? base64String.split("base64,")[1]
      : base64String;
    const approximateBytes = Math.round((rawData.length * 3) / 4);
    const MAX_AVATAR_SIZE_BYTES = 2048 * 1024; // 2MB

    if (approximateBytes > MAX_AVATAR_SIZE_BYTES) {
      return NextResponse.json(
        {
          sucesso: false,
          error:
            "A imagem selecionada é muito pesada. Por favor, escolha uma foto menor (máximo 2MB).",
        },
        { status: 400 },
      );
    }

    await patientRepo.update(
      { id },
      {
        avatarUrl: base64String,
        photoUrl: base64String,
      },
    );

    return NextResponse.json({
      sucesso: true,
      mensagem: "Foto de perfil em Base64 salva com sucesso no banco de dados!",
      avatarUrl: base64String,
      paciente: {
        id: paciente.id,
        nome: paciente.fullName,
      },
    });
  } catch (error: unknown) {
    console.error("[API_AVATAR_POST_ERROR]", error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { sucesso: false, error: "Erro ao salvar foto de perfil.", details },
      { status: 500 },
    );
  }
}
