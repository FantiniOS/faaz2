import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  // Driver Oracle (node-oracledb, modo Thin) e TypeORM carregam drivers via require dinâmico.
  // Mantê-los fora do bundle do servidor evita erros de resolução no Turbopack e na Vercel.
  serverExternalPackages: ["oracledb", "typeorm"],
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Aplica cabeçalhos CORS em todas as rotas da API para o PWA e integrações
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,OPTIONS,PATCH,DELETE,POST,PUT",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, paciente-id",
          },
        ],
      },
      {
        // Miniaturas WebP imutáveis (nome por SHA-256) servidas sem otimização do Next/Vercel
        source: "/food-thumbnails/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
