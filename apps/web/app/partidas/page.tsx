import type { Metadata } from "next";
import { MatchHistory } from "./match-history";

export const metadata: Metadata = { title: "Minhas partidas" };

export default function MatchesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Minhas partidas</h1>
      <MatchHistory />
    </div>
  );
}
