"use client";

import type { AuthMode } from "@cyl/contracts";
import { useEffect, useState } from "react";
import { createApiClient } from "@/lib/api";

const api = createApiClient();

type State = { kind: "loading" } | { kind: "ready"; mode: AuthMode } | { kind: "offline" };

export function LoginPanel() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    void api.authStatus().then((r) => setState(r.ok ? { kind: "ready", mode: r.data.mode } : { kind: "offline" }));
  }, []);

  if (state.kind === "loading") return <p className="text-sm text-muted">Verificando disponibilidade...</p>;

  if (state.kind === "offline") {
    return <p className="text-sm text-muted">Servico indisponivel no momento. Tente novamente em instantes.</p>;
  }

  if (state.mode === "disabled") {
    return (
      <div className="space-y-2 text-sm text-muted">
        <p>O login com a Riot (Riot Sign On) ainda nao esta disponivel.</p>
        <p>
          Ele depende de aprovacao oficial da Riot Games. Ate la, o CYL Sense nao acessa nenhum dado da sua conta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-cyl border border-warning p-3">
        Modo demonstracao: o login e simulado e as partidas sao sinteticas. Nenhum dado real da Riot e usado.
      </p>
      <a href={api.loginUrl} className="inline-block rounded-cyl bg-accent px-4 py-2 font-medium text-bg">
        Entrar (demonstracao)
      </a>
    </div>
  );
}
