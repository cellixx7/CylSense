import { err, ok, providerError, type ProviderError, type Result } from "./result";

/** Subconjunto estrutural de um schema Zod: o core nao depende do Zod. */
export interface SafeParser<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}

/** Mensagem legivel e segura para log: caminho + motivo, sem ecoar valores. */
export function describeIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[], max = 3): string {
  const shown = issues
    .slice(0, max)
    .map((i) => `${i.path.map(String).join(".") || "(raiz)"}: ${i.message}`)
    .join("; ");
  return issues.length > max ? `${shown}; (+${issues.length - max})` : shown;
}

/** Valida uma entrada externa contra um contrato e devolve Result. */
export function parseWith<T>(schema: SafeParser<T>, input: unknown, label: string): Result<T, ProviderError> {
  const r = schema.safeParse(input);
  return r.success ? ok(r.data) : err(providerError("invalid_data", `${label}: ${describeIssues(r.error.issues)}`));
}
