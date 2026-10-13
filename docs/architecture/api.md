# CYL Sense API (services/api)

Fastify 5 + Zod. Prefixo de versao `/v1`. Estado em memoria (`MemoryStore`): nada e persistido e reiniciar apaga tudo. PostgreSQL entra depois, atras da mesma fronteira.

## Executar

```bash
pnpm dev:api     # Riot desativada (padrao); porta 4000
pnpm dev:demo    # API em modo mock + web em http://localhost:3000
```

Nenhuma variavel e obrigatoria. Ver `services/api/.env.example`.

| Variavel | Padrao | Descricao |
|---|---|---|
| `NODE_ENV` | `development` | `production` proibe `CYL_AUTH_MODE=mock` (a API nao inicia) |
| `PORT` / `HOST` | `4000` / `127.0.0.1` | Escuta |
| `CYL_AUTH_MODE` | `disabled` | `disabled` ou `mock` |
| `CYL_WEB_ORIGIN` | `http://localhost:3000` | Destino dos redirects apos login |
| `CYL_PUBLIC_API_URL` | `http://localhost:3000/api` | Base do `redirect_uri` (a API vista pelo navegador, via proxy do web) |
| `CYL_FIXTURES_DIR` | `fixtures/valorant` | Fonte do `MatchProvider` mock |

O web le `CYL_API_ORIGIN` (padrao `http://127.0.0.1:4000`) para encaminhar `/api/*`.

## Rotas

| Metodo | Rota | Sessao | Descricao |
|---|---|---|---|
| GET | `/v1/health` | - | `HealthResponse` com `contractsVersion` |
| GET | `/v1/auth/riot/status` | - | `AuthStatusResponse` (`disabled` ou `mock`) |
| GET | `/v1/auth/riot/start` | - | Gera `state` e PKCE e redireciona ao provedor. `503 not_configured` se desativado |
| GET | `/v1/auth/riot/callback` | - | Valida `state` (cookie + store, uso unico, TTL), troca o codigo, cria a sessao e redireciona para `/partidas`; falhas vao para `/entrar?erro=<codigo>` |
| POST | `/v1/auth/logout` | sim | Encerra a sessao |
| GET | `/v1/me` | sim | `MeResponse` (usuario e contas; nunca tokens) |
| POST | `/v1/me/sync` | sim | Sincronizacao idempotente por `externalId` -> `SyncResponse` |
| GET | `/v1/me/matches` | sim | `MatchListResponse` com `containsSyntheticData` |
| DELETE | `/v1/me/game-accounts/:id` | sim | Revoga no provedor e apaga conta, credenciais e partidas |

Erros sempre no formato `ApiError` (`{ error: { code, message } }`). Mapeamento de `ProviderError`: `not_configured` 503, `unauthorized` 401, `rate_limited` 429 com `retry-after`, `network`/`invalid_data` 502.

## Seguranca

- **CSRF**: requisicoes que alteram estado exigem o cabecalho `x-cyl-request: 1`. Sem CORS habilitado, outra origem nao consegue envia-lo. O cookie de sessao e `SameSite=Lax`.
- **OAuth**: `state` de 256 bits, uso unico, TTL de 10 min, comparado em tempo constante e amarrado a cookie httpOnly; PKCE S256; `redirect_uri` fixo pela config; o texto de erro do provedor nunca e refletido.
- **Credenciais**: tokens do provedor ficam so no servidor (`MemoryStore.grants`) e nunca aparecem em respostas.
- **Logs**: a URL e registrada sem query string; `cookie`, `authorization` e `set-cookie` sao omitidos. Ha teste que garante isso.
- **Config**: validada com Zod na inicializacao; a mensagem de erro cita so os nomes das variaveis, nunca os valores.
- **Separacao por usuario**: toda leitura parte do `userId` da sessao; acessar a conta de outro usuario retorna 404.

## Limitacoes conhecidas

- Sessoes e dados em memoria: um unico processo, sem persistencia.
- Sem limite de taxa proprio (rate limiting de entrada) e sem fila de sincronizacao.
- Executa via `tsx`; nao ha bundle de deploy (hospedagem esta fora de escopo).
