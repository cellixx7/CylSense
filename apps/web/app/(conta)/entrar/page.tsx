import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

/** Erros devolvidos pelo retorno do login Riot (fluxo sem sessao). */
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
    <div className="flex w-full max-w-md flex-col gap-5">
      <section aria-labelledby="login-title" className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-8">
        <div className="flex flex-col gap-1.5">
          <h1 id="login-title" className="text-2xl font-semibold tracking-tight">
            Entrar
          </h1>
          <p className="text-sm text-muted">Acesse seu perfil no CYL Sense.</p>
        </div>
        <LoginForm initialError={message} />
      </section>
      <p className="text-center text-sm text-muted">
        Ainda nao tem conta?{" "}
        <Link href="/criar-conta" className="font-medium text-accent">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
