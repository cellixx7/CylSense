import type { Metadata } from "next";
import { LoginPanel } from "./login-panel";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  consent_denied: "Voce nao autorizou o acesso. Nenhum dado foi coletado.",
  invalid_state: "A tentativa de login expirou ou nao pode ser validada. Tente novamente.",
  invalid_request: "Resposta de login invalida. Tente novamente.",
  unauthorized: "O provedor recusou o login. Tente novamente.",
  not_configured: "O login com a Riot ainda nao esta disponivel.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const message = erro === undefined ? undefined : (ERRORS[erro] ?? "Nao foi possivel concluir o login.");

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Conectar conta Riot</h1>
      {message && (
        <p role="alert" className="rounded-cyl border border-danger p-3 text-sm">
          {message}
        </p>
      )}
      <LoginPanel />
    </div>
  );
}
