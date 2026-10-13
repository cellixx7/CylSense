import type { NextConfig } from "next";

// A API roda separada (services/api). O navegador fala somente com o web em
// /api/*, que e encaminhado para a API: mesma origem, sem CORS, e os cookies
// de sessao (httpOnly) ficam no dominio do web.
const apiOrigin = (process.env.CYL_API_ORIGIN ?? "http://127.0.0.1:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@cyl/contracts"],
  poweredByHeader: false,
  // Nao gerar apps/web/AGENTS.md automaticamente no `next dev`: as instrucoes
  // para agentes ficam no CLAUDE.md da raiz.
  agentRules: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
