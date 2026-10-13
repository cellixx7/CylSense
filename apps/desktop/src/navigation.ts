import { BarChart3, Film, GraduationCap, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";

export type RouteId = "overview" | "matches" | "video" | "coaching" | "settings";

export interface NavItem {
  id: RouteId;
  label: string;
  description: string;
  /** Tarefa do backlog que entrega o conteudo real desta area. */
  plannedIn: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "overview",
    label: "Visao geral",
    description: "Resumo da sessao, evolucao e diagnosticos.",
    plannedIn: "P0-06",
    icon: LayoutDashboard,
  },
  {
    id: "matches",
    label: "Partidas",
    description: "Historico de partidas importadas e detalhe de rounds.",
    plannedIn: "P0-04 / P0-06",
    icon: BarChart3,
  },
  {
    id: "video",
    label: "Video",
    description: "Revisao de MP4 com marcacoes e offset manual.",
    plannedIn: "P0-07",
    icon: Film,
  },
  {
    id: "coaching",
    label: "Coaching",
    description: "Recomendacoes de treino justificadas por evidencias.",
    plannedIn: "P0-08",
    icon: GraduationCap,
  },
  {
    id: "settings",
    label: "Configuracoes",
    description: "Preferencias, privacidade e modo de IA (opt-in).",
    plannedIn: "P0-09",
    icon: Settings,
  },
] as const;

export const DEFAULT_ROUTE: RouteId = "overview";
