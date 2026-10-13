# Estrutura do website (apps/web)

Next.js (App Router). As paginas institucionais sao estaticas (SEO); as areas autenticadas sao componentes cliente que chamam `/api/*`, encaminhado pelo Next para a API.

| Rota | Tipo | Estado | Objetivo |
|---|---|---|---|
| `/` | Estatica | [impl] | Apresentar o produto e levar a conectar a conta ou conhecer o desktop |
| `/entrar` | Dinamica (le `?erro`) | [impl] | Iniciar o login; explicar quando o RSO esta indisponivel |
| `/partidas` | Estatica + cliente | [impl, dados sim] | Historico, sincronizacao, convite ao desktop |
| `/download` | Estatica | [impl] | Apresentar o desktop; o instalador entra quando houver versao estavel |
| `/partidas/[id]` | - | [futuro] | Indicadores e diagnosticos iniciais de uma partida |
| `/conta` | - | [futuro] | Vinculos, revogacao (`DELETE /v1/me/game-accounts/:id` ja existe), exclusao total |
| `/recursos`, `/demo` | - | [futuro] | Demonstracoes com dados sinteticos rotulados |
| `/docs`, `/suporte`, `/privacidade`, `/termos` | - | [futuro] | Documentacao, suporte e textos legais (pre-requisito para producao) |

## Organizacao do codigo

```
apps/web/
  app/                 # rotas (App Router)
    layout.tsx         # cabecalho, rodape (aviso de nao afiliacao)
    globals.css        # tokens provisorios + Tailwind 4
    entrar/            # page.tsx (servidor) + login-panel.tsx (cliente)
    partidas/          # page.tsx + match-history.tsx (cliente)
    download/
  lib/api.ts           # cliente da API: valida respostas com @cyl/contracts
  next.config.ts       # rewrite /api/* -> CYL_API_ORIGIN
```

Regras:

- O navegador nunca recebe tokens Riot; a sessao e um cookie httpOnly.
- Escritas enviam `x-cyl-request: 1` (anti-CSRF).
- Nada de chave de API em variaveis `NEXT_PUBLIC_*`.
