import { Check } from "./icons";

/** Etapas do cadastro: 1 criar perfil, 2 vincular Riot (opcional). */
export function Steps({ current }: { current: 1 | 2 }) {
  const steps = ["Criar perfil", "Vincular Riot (opcional)"] as const;
  return (
    <ol aria-label="Etapas" className="flex items-center gap-3 text-[13px]">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="contents">
            {i > 0 && <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-border" />}
            <span aria-current={active ? "step" : undefined} className={`flex items-center gap-2 ${active ? "font-semibold" : "text-muted"}`}>
              <span
                className={`inline-flex size-5.5 items-center justify-center rounded-full text-xs ${
                  active ? "bg-accent text-on-accent" : done ? "bg-accent-soft text-on-accent-soft" : "border border-border"
                }`}
              >
                {done ? <Check size={12} strokeWidth={3} /> : n}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
