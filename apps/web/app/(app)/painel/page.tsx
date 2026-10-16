import type { Metadata } from "next";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ novo?: string; vinculada?: string }> }) {
  const { novo, vinculada } = await searchParams;
  return <Dashboard justRegistered={novo === "1"} justLinked={vinculada === "1"} />;
}
