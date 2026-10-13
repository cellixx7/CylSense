# ADR 0001 - Stack e escopo do P0

- Status: aceita
- Data: 2026-10-13

## Decisoes

- **Desktop Windows com Tauri 2**: binario leve, backend em Rust, WebView nativa.
- **React + TypeScript strict + Tailwind + shadcn/ui**: produtividade e componentes proprios (copiados, sem lock-in).
- **SQLite local**: dados do usuario ficam na maquina; offline por padrao.
- **Video por importacao manual de MP4**: o replay nativo do VALORANT nao e garantidamente um MP4 legivel.
- **IA hibrida e opt-in**: calculo e recomendacoes locais no P0; IA externa somente via gateway futuro.
- **Monolito modular** em vez de servicos distribuidos.
- **Riot**: sem credencial oficial no MVP; fixtures sinteticas.

## Consequencias

- O MVP precisa gerar diagnostico util e justificavel sem analise automatica de video e sem rede.
- Login Riot (RSO), backend em nuvem, pagamentos, gravacao automatica e multiplos jogos ficam adiados.
