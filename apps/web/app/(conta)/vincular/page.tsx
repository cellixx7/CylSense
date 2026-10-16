import type { Metadata } from "next";
import { Steps } from "@/components/steps";
import { LinkRiot } from "./link-riot";

export const metadata: Metadata = { title: "Vincular conta Riot" };

/** Erros devolvidos pelo retorno do login Riot quando ha sessao (vinculo). */
const ERRORS: Record<string, string> = {
  already_linked: "Esta conta Riot ja esta vinculada a outro perfil do CYL Sense.",
  consent_denied: "Voce nao autorizou o acesso. Nenhum dado foi coletado.",
  invalid_state: "A tentativa expirou ou nao pode ser validada. Tente novamente.",
  invalid_request: "Resposta da Riot invalida. Tente novamente.",
  unauthorized: "A Riot recusou o vinculo. Tente novamente.",
  not_configured: "O vinculo com a Riot ainda nao esta disponivel.",
};

export default async function LinkPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const message = erro === undefined ? undefined : (ERRORS[erro] ?? "Nao foi possivel vincular a conta.");

  return (
    <div className="flex w-full max-w-lg flex-col gap-5">
      <Steps current={2} />
      <LinkRiot error={message} />
    </div>
  );
}
