"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError, submitClass } from "@/components/form";
import { createApiClient } from "@/lib/api";

const api = createApiClient();

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    const res = await api.login({
      email: String(form.get("email") ?? ""),
      password: String(form.get("senha") ?? ""),
      remember: form.get("lembrar") === "on",
    });
    if (res.ok) {
      router.push("/painel");
      return;
    }
    setPending(false);
    setError(
      res.code === "unauthorized" || res.code === "invalid_request"
        ? "E-mail ou senha incorretos. Confira os dados e tente de novo."
        : "Nao foi possivel entrar agora. Tente novamente em instantes.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}
      <Field id="email" label="E-mail" type="email" autoComplete="email" placeholder="voce@exemplo.com" required />
      <Field
        id="senha"
        label="Senha"
        type="password"
        autoComplete="current-password"
        required
        aside={<span className="text-xs text-muted">Recuperacao de senha em breve</span>}
      />
      <label className="flex items-center gap-2.5 text-sm text-muted">
        <input type="checkbox" name="lembrar" className="size-4.5 accent-accent" />
        Manter conectado neste dispositivo
      </label>
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
