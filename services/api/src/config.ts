import { fileURLToPath } from "node:url";
import { AuthMode } from "@cyl/contracts";
import { z } from "zod";

const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures/valorant", import.meta.url));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  CYL_AUTH_MODE: AuthMode.default("disabled"),
  CYL_WEB_ORIGIN: z.url().default("http://localhost:3000"),
  CYL_PUBLIC_API_URL: z.url().default("http://localhost:3000/api"),
  CYL_FIXTURES_DIR: z.string().min(1).default(DEFAULT_FIXTURES_DIR),
});

export interface ApiConfig {
  env: "development" | "test" | "production";
  port: number;
  host: string;
  authMode: AuthMode;
  webOrigin: string;
  publicApiUrl: string;
  fixturesDir: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** Valida o ambiente. Falha cedo (antes de abrir a porta) com mensagem sem valores sensiveis. */
export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new ConfigError(`variaveis de ambiente invalidas: ${fields}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && e.CYL_AUTH_MODE === "mock") {
    throw new ConfigError("CYL_AUTH_MODE=mock e proibido em producao: nao simular autenticacao real");
  }
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    authMode: e.CYL_AUTH_MODE,
    webOrigin: e.CYL_WEB_ORIGIN.replace(/\/$/, ""),
    publicApiUrl: e.CYL_PUBLIC_API_URL.replace(/\/$/, ""),
    fixturesDir: e.CYL_FIXTURES_DIR,
  };
}
