"use client";

import { RegisterRequest } from "@cyl/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError, submitClass } from "@/components/form";
import { createApiClient } from "@/lib/api";

const api = createApiClient();

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = RegisterRequest.safeParse({
      displayName: form.get("nome"),
      email: form.get("email"),
      password: form.get("senha"),
      acceptTerms: form.get("termos") === "on",
    });
    if (!input.success) {
      setError(firstProblem(input.error.issues[0]?.path[0]));
      return;
    }

    setPending(true);
    setError(undefined);
    const res = await api.register(input.data);
    if (res.ok) {
      router.push("/painel?novo=1");
      return;
    }
    setPending(false);
    setError(
      res.code === "conflict"
        ? "Ja existe uma conta com este e-mail. Entre ou use outro e-mail."
        : res.code === "invalid_request"
          ? "Confira os dados do cadastro e tente de novo."
          : "Nao foi possivel criar a conta agora. Tente novamente em instantes.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <FormError>{error}</FormError>}
      <Field id="nome" label="Nome de exibicao" autoComplete="nickname" placeholder="Como quer ser chamado" required minLength={2} maxLength={32} />
      <Field id="email" label="E-mail" type="email" autoComplete="email" placeholder="voce@exemplo.com" required />
      <Field
        id="senha"
        label="Senha"
        type="password"
        autoComplete="new-password"
        hint="Pelo menos 8 caracteres."
        required
        minLength={8}
        maxLength={128}
      />
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" name="termos" required className="mt-0.5 size-4.5 flex-none accent-accent" />
        <span>Li e aceito os Termos de uso e a Politica de privacidade.</span>
      </label>
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
    </form>
  );
}

function firstProblem(field: PropertyKey | undefined): string {
  switch (field) {
    case "displayName":
      return "O nome de exibicao precisa ter de 2 a 32 caracteres.";
    case "email":
      return "Informe um e-mail valido.";
    case "password":
      return "A senha precisa ter pelo menos 8 caracteres.";
    case "acceptTerms":
      return "Para criar a conta, aceite os termos de uso e a politica de privacidade.";
    default:
      return "Confira os dados do cadastro e tente de novo.";
  }
}
