import { valorantSyntheticAdapter } from "@cyl/game-adapter-valorant";
import { buildApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { createMockAuthProvider, createMockMatchProvider } from "./providers/mock";
import { createDisabledRiotAuthProvider, createDisabledRiotMatchProvider } from "./providers/riot";

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : "falha ao carregar configuracao");
  process.exit(1);
}

const mock = config.authMode === "mock";
const app = buildApp({
  config,
  auth: mock ? createMockAuthProvider() : createDisabledRiotAuthProvider(),
  matches: mock ? createMockMatchProvider(config.fixturesDir) : createDisabledRiotMatchProvider(),
  adapter: valorantSyntheticAdapter,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await app.listen({ port: config.port, host: config.host });
app.log.info({ authMode: config.authMode }, "CYL Sense API iniciada");
if (mock) app.log.warn("MODO MOCK: login e partidas SINTETICOS, somente para desenvolvimento/demonstracao");
