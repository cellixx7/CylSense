import type { NavItem } from "@/navigation";

export function Placeholder({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-2xl p-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="rounded-lg bg-accent p-2 text-accent-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          {item.label}
        </h1>
      </div>
      <p className="text-muted-foreground">{item.description}</p>
      <p className="mt-6 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Area ainda sem conteudo: sera implementada em <strong>{item.plannedIn}</strong>. Nenhum dado
        real ou ficticio e exibido aqui.
      </p>
    </section>
  );
}
