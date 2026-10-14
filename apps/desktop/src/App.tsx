import { CONTRACTS_VERSION } from "@cyl/contracts";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_ROUTE, NAV_ITEMS, type RouteId } from "@/navigation";
import { Placeholder } from "@/pages/Placeholder";
import { describeStorage, useStorageStatus } from "@/storage/useStorageStatus";

export default function App() {
  const [route, setRoute] = useState<RouteId>(DEFAULT_ROUTE);
  const storage = useStorageStatus();
  const current = NAV_ITEMS.find((item) => item.id === route) ?? NAV_ITEMS[0];

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="px-5 py-5">
          <p className="text-lg font-semibold tracking-tight">CYL Sense</p>
          <p className="text-xs text-muted-foreground">Understand your game.</p>
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === route;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoute(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <p className="px-5 py-4 text-xs text-muted-foreground">v0.1.0 · contratos {CONTRACTS_VERSION} · {describeStorage(storage)} · offline</p>
      </aside>
      <main className="flex-1 overflow-auto">{current && <Placeholder item={current} />}</main>
    </div>
  );
}
