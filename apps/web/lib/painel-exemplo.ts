/**
 * Dados SINTETICOS do painel do site. Servem para desenhar a experiencia ate a
 * integracao Riot ser aprovada; a UI sempre exibe o aviso de dado de exemplo.
 * Nenhum valor aqui representa um jogador real.
 */
export const origin = "synthetic" as const;

export const rank = { tier: "Ouro 2", rr: 64, peak: "Platina 1", rrPerWin: 18, next: "Ouro 3" };

export const kpis = [
  { label: "Partidas", value: "48", delta: "12 nesta semana", trend: "flat" },
  { label: "Vitorias", value: "54%", delta: "▲ 6 p.p.", trend: "up" },
  { label: "K/D", value: "1,12", delta: "▲ 0,08", trend: "up" },
  { label: "CYL Score", value: "712", delta: "▼ 4", trend: "down" },
] as const;

/** RR acumulado nas ultimas 20 partidas, em escala do grafico (0 = topo). */
export const rrHistory = [150, 138, 144, 128, 132, 118, 124, 112, 96, 102, 88, 76, 82, 70, 58, 62, 48, 40, 30, 22];

export const recentResults = ["V", "V", "D", "V", "V", "D", "V", "V", "D", "V"] as const;

export const tiers = [
  { name: "Ferro", color: "oklch(0.6 0.01 260)" },
  { name: "Bronze", color: "oklch(0.62 0.09 55)" },
  { name: "Prata", color: "oklch(0.82 0.02 250)", note: "temporada passada" },
  { name: "Ouro", color: "oklch(0.8 0.14 85)", note: "voce esta aqui", current: true },
  { name: "Platina", color: "oklch(0.72 0.1 200)", note: "pico" },
  { name: "Diamante", color: "oklch(0.72 0.15 320)" },
  { name: "Ascendente", color: "oklch(0.75 0.15 150)" },
  { name: "Imortal", color: "oklch(0.62 0.2 20)" },
  { name: "Radiante", color: "oklch(0.9 0.1 95)" },
] as const;

export const currentTierColor = "oklch(0.8 0.14 85)";

export const mainAgent = { name: "Jett", role: "Duelista", games: 22 };

export const agents = [
  { name: "Jett", role: "Duelista", games: 22, win: 59, kd: "1,24", acs: 241 },
  { name: "Omen", role: "Controlador", games: 12, win: 50, kd: "1,02", acs: 198 },
  { name: "Sova", role: "Iniciador", games: 9, win: 56, kd: "0,98", acs: 187 },
  { name: "Killjoy", role: "Sentinela", games: 5, win: 40, kd: "0,91", acs: 172 },
] as const;

export type RankingCriterion = "score" | "evolucao" | "headshot";

type Row = { name: string; rank: string; agent: string; value: string; delta: string; you?: boolean };

/** Ranking entre amigos: so entram perfis que vincularam a conta (regra de opt-in da Riot). */
export const friendsRanking: Record<RankingCriterion, Row[]> = {
  score: [
    { name: "[AMIGO 1]", rank: "Platina 1", agent: "Sova", value: "768", delta: "▲ 1" },
    { name: "[AMIGO 2]", rank: "Ouro 3", agent: "Omen", value: "735", delta: "▼ 1" },
    { name: "Voce", rank: "Ouro 2", agent: "Jett", value: "712", delta: "▲ 3", you: true },
    { name: "[AMIGO 3]", rank: "Ouro 1", agent: "Reyna", value: "690", delta: "▼ 2" },
    { name: "[AMIGO 4]", rank: "Prata 3", agent: "Sage", value: "641", delta: "▲ 1" },
  ],
  evolucao: [
    { name: "Voce", rank: "Ouro 2", agent: "Jett", value: "+96 RR", delta: "▲ 2", you: true },
    { name: "[AMIGO 2]", rank: "Ouro 3", agent: "Omen", value: "+71 RR", delta: "▲ 1" },
    { name: "[AMIGO 4]", rank: "Prata 3", agent: "Sage", value: "+40 RR", delta: "—" },
    { name: "[AMIGO 1]", rank: "Platina 1", agent: "Sova", value: "+12 RR", delta: "▼ 2" },
    { name: "[AMIGO 3]", rank: "Ouro 1", agent: "Reyna", value: "−18 RR", delta: "▼ 1" },
  ],
  headshot: [
    { name: "[AMIGO 1]", rank: "Platina 1", agent: "Sova", value: "27%", delta: "—" },
    { name: "Voce", rank: "Ouro 2", agent: "Jett", value: "24%", delta: "▲ 1", you: true },
    { name: "[AMIGO 3]", rank: "Ouro 1", agent: "Reyna", value: "22%", delta: "▼ 1" },
    { name: "[AMIGO 2]", rank: "Ouro 3", agent: "Omen", value: "19%", delta: "—" },
    { name: "[AMIGO 4]", rank: "Prata 3", agent: "Sage", value: "17%", delta: "—" },
  ],
};

export const maps = [
  { name: "Ascent", win: 62, games: 8 },
  { name: "Haven", win: 58, games: 7 },
  { name: "Split", win: 55, games: 9 },
  { name: "Bind", win: 44, games: 6 },
  { name: "Lotus", win: 40, games: 5 },
  { name: "Sunset", win: 50, games: 4 },
] as const;

export const highlights = [
  { icon: "1v3", title: "Clutch 1v3", body: "Haven, round 18 · com evidencia no video" },
  { icon: "5", title: "5 vitorias seguidas", body: "Melhor sequencia da temporada" },
  { icon: "HS", title: "Headshot em alta", body: "24% na semana, sua melhor marca" },
  { icon: "+96", title: "+96 RR na semana", body: "Maior evolucao do grupo" },
] as const;
