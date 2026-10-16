import type { GameAccount, Match, User } from "@cyl/contracts";
import type { ExternalIdentity, ProviderGrant } from "@cyl/core";

export interface PendingLogin {
  codeVerifier: string;
  expiresAt: number;
}

export interface Credential {
  userId: string;
  /** Formato `scrypt$sal$chave`; nunca a senha. */
  passwordHash: string;
}

export interface Session {
  userId: string;
  expiresAt: number;
}

/**
 * Armazenamento em memoria para desenvolvimento. Nada e persistido: reiniciar
 * a API apaga tudo. Producao usara PostgreSQL atras desta mesma fronteira.
 * Toda leitura de dados de usuario recebe o userId da sessao (separacao por usuario).
 */
export class MemoryStore {
  private readonly users = new Map<string, User>();
  private readonly accounts = new Map<string, GameAccount>();
  /** Credenciais do provedor: somente servidor, nunca serializadas em respostas. */
  private readonly grants = new Map<string, { identity: ExternalIdentity; grant: ProviderGrant }>();
  private readonly sessions = new Map<string, Session>();
  /** Login por e-mail e senha, indexado pelo e-mail normalizado. */
  private readonly credentials = new Map<string, Credential>();
  private readonly pending = new Map<string, PendingLogin>();
  /** Partidas por conta vinculada, indexadas por externalId (sincronizacao idempotente). */
  private readonly matches = new Map<string, Map<string, Match>>();

  savePendingLogin(state: string, login: PendingLogin): void {
    this.pending.set(state, login);
  }

  /** Uso unico: o state e removido na primeira leitura, valido ou nao. */
  consumePendingLogin(state: string, now: number): PendingLogin | undefined {
    const login = this.pending.get(state);
    this.pending.delete(state);
    return login && login.expiresAt > now ? login : undefined;
  }

  findAccountByExternalId(provider: GameAccount["provider"], externalId: string): GameAccount | undefined {
    for (const account of this.accounts.values()) {
      if (account.provider === provider && account.externalId === externalId) return account;
    }
    return undefined;
  }

  findCredential(email: string): Credential | undefined {
    return this.credentials.get(email);
  }

  saveCredential(email: string, credential: Credential): void {
    this.credentials.set(email, credential);
  }

  saveUser(user: User): void {
    this.users.set(user.id, user);
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  saveAccount(account: GameAccount, identity: ExternalIdentity, grant: ProviderGrant): void {
    this.accounts.set(account.id, account);
    this.grants.set(account.id, { identity, grant });
  }

  listAccounts(userId: string): GameAccount[] {
    return [...this.accounts.values()].filter((a) => a.userId === userId);
  }

  getAccount(userId: string, accountId: string): GameAccount | undefined {
    const account = this.accounts.get(accountId);
    return account?.userId === userId ? account : undefined;
  }

  getGrant(accountId: string): { identity: ExternalIdentity; grant: ProviderGrant } | undefined {
    return this.grants.get(accountId);
  }

  /** Revogacao: remove conta, credenciais e todas as partidas sincronizadas por ela. */
  deleteAccount(accountId: string): void {
    this.accounts.delete(accountId);
    this.grants.delete(accountId);
    this.matches.delete(accountId);
  }

  createSession(sessionId: string, session: Session): void {
    this.sessions.set(sessionId, session);
  }

  getSession(sessionId: string, now: number): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  hasMatch(accountId: string, externalId: string): boolean {
    return this.matches.get(accountId)?.has(externalId) ?? false;
  }

  saveMatch(accountId: string, match: Match): void {
    const byExternal = this.matches.get(accountId) ?? new Map<string, Match>();
    byExternal.set(match.externalId, match);
    this.matches.set(accountId, byExternal);
  }

  listMatches(userId: string): Match[] {
    return this.listAccounts(userId).flatMap((a) => [...(this.matches.get(a.id)?.values() ?? [])]);
  }
}
