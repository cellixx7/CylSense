import { err, providerError, type RiotAuthProvider, type RiotMatchProvider } from "@cyl/core";

/**
 * Integracao Riot DESATIVADA.
 *
 * Endpoints, escopos e o fluxo exato do Riot Sign On so serao implementados
 * com documentacao oficial e aprovacao de producao da Riot (ver
 * docs/compliance/riot.md). Ate la, nenhuma chamada de rede e feita e todas
 * as operacoes respondem `not_configured`. Nao adicionar URLs da Riot aqui
 * sem essa aprovacao.
 */
const notConfigured = () =>
  Promise.resolve(err(providerError("not_configured", "integracao Riot nao configurada ou nao aprovada")));

export function createDisabledRiotAuthProvider(): RiotAuthProvider {
  return {
    id: "riot",
    enabled: false,
    beginLogin: notConfigured,
    completeLogin: notConfigured,
    revoke: notConfigured,
  };
}

export function createDisabledRiotMatchProvider(): RiotMatchProvider {
  return {
    id: "riot",
    enabled: false,
    listMatchIds: notConfigured,
    getRawMatch: notConfigured,
  };
}
