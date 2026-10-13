# Fluxos de interacao

Legenda: [impl] implementado, [sim] simulado, [futuro] planejado.

## 1. Jornada Web -> Desktop

Ver [user-journey.md](user-journey.md).

## 2. Autenticacao Riot

[impl] orquestracao (state, PKCE, sessao) - [sim] provedor mock - [futuro] RSO real, apos aprovacao da Riot.

```mermaid
sequenceDiagram
  actor U as Jogador
  participant W as Web
  participant A as API
  participant P as Provedor (RSO futuro / mock)
  U->>W: Conectar conta Riot
  W->>A: GET /api/v1/auth/riot/status
  alt mode = disabled
    A-->>W: disabled
    W-->>U: "Login Riot ainda nao disponivel"
  else mode = mock (dev)
    U->>A: GET /v1/auth/riot/start
    A->>A: state + PKCE (S256), pendente por 10 min
    A-->>U: 302 para o provedor + cookie httpOnly com state
    U->>P: Consentimento
    P-->>U: 302 callback?code&state
    U->>A: GET /v1/auth/riot/callback
    A->>A: state == cookie, uso unico, nao expirado
    A->>P: troca code + code_verifier (servidor)
    P-->>A: identidade + tokens (ficam na API)
    A-->>U: cookie de sessao + 302 /partidas
  end
```

## 3. Sincronizacao de partidas

[impl] idempotencia e erros - [sim] partidas das fixtures - [futuro] Riot API e sincronizacao do desktop.

```mermaid
flowchart TD
  S[POST /v1/me/sync] --> SS{Sessao valida?}
  SS -- nao --> E401[401 -> tela de login]
  SS -- sim --> EN{Provedor habilitado?}
  EN -- nao --> E503[503 not_configured]
  EN -- sim --> L[listMatchIds por conta vinculada]
  L -->|rate_limited| E429[429 + retry-after]
  L --> F{Ja existe externalId?}
  F -- sim --> U[unchanged++]
  F -- nao --> R[getRawMatch]
  R -->|rate_limited| E429
  R -->|outro erro| RJ[rejected++]
  R --> N[MatchNormalizer: parse + validacao do contrato]
  N -->|invalido| RJ
  N -->|ok| SV[salva -> imported++]
```

## 4. Primeiro acesso no desktop

[impl] abertura e navegacao - [futuro] todo o resto.

```mermaid
flowchart TD
  A[Abre o app] --> B{Tem conta CYL?}
  B -- "nao / pular" --> OFF[Modo local: importar arquivos e videos]
  B -- sim --> LG[Login no navegador do sistema, futuro A-02]
  LG --> SY[Sincronizar partidas permitidas]
  OFF --> P1{Configurar pasta do VALORANT?}
  SY --> P1
  P1 -- opcional --> PV[Seleciona a pasta; so leitura de arquivos acessiveis ao usuario]
  P1 -- pular --> RV
  PV --> RV{Pasta de gravacoes?}
  RV -- sim --> PG[Define a pasta]
  RV -- nao --> MAN[Importacao manual depois]
  PG --> D[Visao geral]
  MAN --> D
```

## 5. Importacao manual de video

[futuro P0-07]. O video nunca sai do computador.

```mermaid
flowchart TD
  I[Importar MP4] --> V{Arquivo valido?}
  V -- nao --> EV[Erro: formato nao suportado]
  V -- sim --> M[Escolher a partida]
  M --> O[Ajustar o offset: marcar o inicio do round 1 no video]
  O --> C[Conferir eventos alinhados na timeline]
  C -->|desalinhado| O
  C --> S[Salvar VideoReference: nome do arquivo + offset]
```

## 6. Analise estatistica

[futuro P0-05/P0-06].

```mermaid
flowchart LR
  M[Partidas selecionadas] --> C[Metricas deterministicas<br/>MatchMetrics + sampleSize]
  C --> A{Amostra suficiente?}
  A -- nao --> W[Exibe com aviso de amostra pequena]
  A -- sim --> P[Padroes e comparacoes]
  W --> P
  P --> E[Evidencias rastreaveis]
```

## 7. Coaching e acompanhamento de progresso

[futuro P0-08]. IA externa somente opt-in.

```mermaid
flowchart TD
  E[Evidencias] --> R[Regras locais]
  R --> F1[Finding: fato]
  R --> F2[Finding: hipotese + confianca + limitacoes]
  F1 --> REC[CoachingRecommendation: o que treinar]
  F2 --> REC
  REC --> U[Jogador revisa; video quando houver]
  U --> T[Treina e joga novas partidas]
  T --> CMP[Nova AnalysisSession compara com a anterior]
  CMP --> E
  F2 -. "opt-in explicito" .-> AI[IA externa: explicacao aprofundada, futuro]
```

## 8. Erros de autenticacao, rede e sincronizacao

[impl] na API e no web, exceto onde indicado.

```mermaid
flowchart TD
  X[Erro] --> T{Tipo}
  T -->|consent_denied| C1["/entrar: voce nao autorizou; nada foi coletado"]
  T -->|invalid_state / expirado| C2["/entrar: tentativa expirou, tente de novo"]
  T -->|unauthorized 401| C3[Sessao ausente: oferecer Conectar]
  T -->|not_configured 503| C4[Recurso indisponivel neste ambiente]
  T -->|rate_limited 429| C5[Limite atingido, tente depois retry-after; o ja salvo permanece]
  T -->|rede / API fora| C6[Servico indisponivel; desktop segue offline, futuro]
  T -->|resposta fora do contrato| C7[Erro generico; nao exibir dados nao validados]
  T -->|partida invalida| C8[Contada como rejeitada no resumo do sync]
```
