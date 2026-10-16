import type { Metadata } from "next";
import { MatchHistory } from "./match-history";

export const metadata: Metadata = { title: "Minhas partidas" };

export default function MatchesPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Minhas partidas</h1>
      <MatchHistory />
    </main>
  );
}
