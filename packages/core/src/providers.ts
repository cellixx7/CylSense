import type { GameId, Match } from "@cyl/contracts";
import type { ProviderError, Result } from "./result";

/** Identidade retornada por um provedor apos consentimento do usuario. */
export interface ExternalIdentity {
  provider: "riot" | "mock";
  externalId: string;
  gameName: string;
  tagLine: string;
  grantedScopes: string[];
}

/**
 * Credencial do provedor guardada somente no servidor. Nunca serializar
 * para o cliente, logs ou desktop.
 */
export interface ProviderGrant {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface BeginLoginInput {
  /** Valor aleatorio de uso unico, validado no callback (anti-CSRF). */
  state: string;
  /** PKCE S256. */
  codeChallenge: string;
  redirectUri: string;
}

export interface CompleteLoginInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/** Autenticacao OAuth/OIDC com um provedor de identidade de jogo. */
export interface AuthProvider {
  readonly id: "riot" | "mock";
  /** false quando nao ha credenciais/aprovacao; nenhuma chamada externa e feita. */
  readonly enabled: boolean;
  beginLogin(input: BeginLoginInput): Promise<Result<{ authorizationUrl: string }, ProviderError>>;
  completeLogin(
    input: CompleteLoginInput,
  ): Promise<Result<{ identity: ExternalIdentity; grant: ProviderGrant }, ProviderError>>;
  revoke(grant: ProviderGrant): Promise<Result<void, ProviderError>>;
}

/** Riot Sign On. Endpoints e escopos so serao definidos com documentacao oficial e aprovacao. */
export interface RiotAuthProvider extends AuthProvider {
  readonly id: "riot";
}

export interface MatchListQuery {
  limit: number;
}

/** Fonte de partidas brutas de uma conta autorizada. */
export interface MatchProvider {
  readonly id: "riot" | "mock";
  readonly enabled: boolean;
  listMatchIds(account: ExternalIdentity, grant: ProviderGrant, query: MatchListQuery): Promise<Result<string[], ProviderError>>;
  /** Retorna o payload bruto; a validacao e responsabilidade do MatchNormalizer. */
  getRawMatch(account: ExternalIdentity, grant: ProviderGrant, matchId: string): Promise<Result<unknown, ProviderError>>;
}

export interface RiotMatchProvider extends MatchProvider {
  readonly id: "riot";
}

export interface NormalizeContext {
  /** Gerador de ids internos (injetado para testes deterministicos). */
  newId: () => string;
}

/** Converte dado externo bruto (nao confiavel) em Match canonico. */
export interface MatchNormalizer<Raw> {
  parse(input: unknown): Result<Raw, ProviderError>;
  normalize(raw: Raw, ctx: NormalizeContext): Result<Match, ProviderError>;
}

/** Ponto de extensao por jogo. Outro jogo = outro adaptador, sem tocar no dominio. */
export interface GameAdapter<Raw = unknown> {
  readonly game: GameId;
  readonly normalizer: MatchNormalizer<Raw>;
}

/** Atalho: parse + normalize em uma chamada. */
export function normalizeMatch<Raw>(
  adapter: GameAdapter<Raw>,
  input: unknown,
  ctx: NormalizeContext,
): Result<Match, ProviderError> {
  const parsed = adapter.normalizer.parse(input);
  return parsed.ok ? adapter.normalizer.normalize(parsed.value, ctx) : parsed;
}
