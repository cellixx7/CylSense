import type { Metadata } from "next";
import Link from "next/link";
import { Steps } from "@/components/steps";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <Steps current={1} />
      <section aria-labelledby="cad-title" className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-8">
        <div className="flex flex-col gap-1.5">
          <h1 id="cad-title" className="text-2xl font-semibold tracking-tight">
            Criar conta
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Seu perfil no CYL Sense e independente. A conta Riot pode ser vinculada depois, quando voce quiser.
          </p>
        </div>
        <RegisterForm />
      </section>
      <p className="text-center text-sm text-muted">
        Ja tem conta?{" "}
        <Link href="/entrar" className="font-medium text-accent">
          Entrar
        </Link>
      </p>
    </div>
  );
}
