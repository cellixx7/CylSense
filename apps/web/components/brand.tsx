import Link from "next/link";
import { LogIn } from "./icons";

/** Marca: o anel do icone do app + nome. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="11" stroke="var(--cyl-accent)" strokeWidth="5" />
    </svg>
  );
}

export function HomeLink() {
  return (
    <Link href="/" aria-label="CYL Sense, inicio" className="inline-flex items-center gap-2.5">
      <Logo />
      <span className="text-lg font-semibold tracking-tight">CYL Sense</span>
    </Link>
  );
}

const SITE_NAV = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#seus-dados", label: "Seus dados" },
  { href: "/download", label: "Desktop" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <HomeLink />
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-1 text-sm">
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-cyl p-3 text-muted hover:text-text">
              {item.label}
            </Link>
          ))}
          <Link
            href="/entrar"
            className="ml-2 inline-flex h-10 items-center gap-2 rounded-cyl border border-border px-4 font-medium hover:bg-subtle"
          >
            <LogIn />
            Entrar
          </Link>
          <Link
            href="/criar-conta"
            className="inline-flex h-10 items-center rounded-cyl bg-accent px-4 font-semibold text-on-accent"
          >
            Criar conta
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function RiotDisclaimer() {
  return <>CYL Sense nao e afiliado a Riot Games. VALORANT e marca da Riot Games, Inc.</>;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <Logo size={16} />
          CYL Sense
        </span>
        <span>
          <RiotDisclaimer />
        </span>
      </div>
    </footer>
  );
}
