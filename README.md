# ⚽ Live Scores — real-time tournament score tracker

**Languages:** [English](#english) · [Português (Europeu)](#português-europeu) · [Українська](#українська)

---

## English

A web app for tracking local football (soccer) tournament scores **in real time**,
with two roles: **admin** (enters results) and **viewer** (read-only). Responsive,
mobile-first UI. The interface is localized (EN / PT / UK) via a language switcher.

### Stack

| Layer | Technology |
|---|---|
| Client | Vite + React + TypeScript, Zustand, react-router, socket.io-client |
| Server | Node + Express + TypeScript, Socket.IO, bcryptjs + JWT, Zod |
| Shared | `shared/types.ts` — single source of types for client and server |
| Data | JSON files behind repository interfaces (easy to swap for SQLite) |

### Architecture decisions (from the 5-persona review board)

- **Real-time:** the server broadcasts compact `match:update` diffs carrying a
  monotonic `rev` — clients drop stale/out-of-order events. New/removed matches
  are pushed live via `match:created` / `match:removed`.
- **Auth:** JWT in an **httpOnly + SameSite** cookie (not localStorage), secret
  from env, HS256 pinned. The Socket.IO handshake is authenticated.
- **Authorization:** all mutations go through REST with `requireAdmin` on the
  server. Sockets are read/broadcast only. Hiding buttons on the client is UX,
  not a security control.
- **Validation:** Zod at the server boundary (scores are integers 0..99, unknown
  fields are stripped).
- **Concurrency:** optimistic `expectedRev` — parallel edits can't silently
  overwrite each other.
- **Performance:** normalized state keyed by `matchId` with `React.memo` rows —
  one goal re-renders one row, not the whole list.

### Run

```bash
# 1. Install dependencies (server + client)
npm run install:all
# (for the convenient `npm run dev`, also run `npm install` in the root for concurrently)

# 2. Start both processes
npm run dev
#   server: http://localhost:3001
#   client: http://localhost:5173  <-- open this
```

Or in two terminals: `npm run dev:server` and `npm run dev:client`.

### Seed accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Viewer | `viewer` | `viewer123` |

New viewers self-register via the **Register** tab on the login page.

### User registration

Self-registration for viewers, so any number of people can follow the tournament.

- **Role is always `user`** — the server hardcodes it; the request body is never
  read for a role (privilege-escalation protection).
- **Storage:** `server/data/users.json` — a `{ version, users }` envelope behind a
  `UserRepository` (mirrors `MatchRepository`). Passwords use bcrypt (cost 12).
- **Uniqueness:** case-insensitive, `Map<usernameLower, user>` — O(1); an atomic
  `create()` (hashing happens BEFORE the critical section, so parallel registers
  can't race).
- **IDs:** `crypto.randomUUID()` (never positional — an id collision means
  authenticating as someone else).
- **Validation (Zod):** username 3–32 `[a-z0-9_]`, password 8–72 bytes,
  `password ≠ username`, reserved-name denylist (`admin`, `root`, `viewer`…).
- **Resilience:** a corrupt `users.json` makes the server **fail closed** instead
  of overwriting accounts via reseed. `persist()` throws on failure → 5xx + rollback
  (no phantom accounts).
- **Endpoint hardening:** rate-limit (5/min) + same-origin guard (`Sec-Fetch-Site`)
  against login-CSRF. "Taken" → `409 USERNAME_TAKEN` (login stays generic).

Endpoint: `POST /api/auth/register` → auto-login through the same path as `/login`.

### Admin panels (`/admin`)

Admin-only (client guard + `requireAdmin` on the whole `/api/admin` router). The
"Admin panel" link appears in the header for admins.

**User management (`/admin/users`)**
- Paginated list with username search (built for 100+ users).
- Enable/disable (`active`), change role (viewer ↔ admin), delete.
- **Guardrails** (checked atomically on the server): you can't deactivate/demote/
  delete yourself or the **last active admin**.
- **Instant revocation:** middleware re-loads the fresh user from the store on
  every request — deactivate/delete/demote take effect immediately despite a valid
  JWT; a deactivated user's live sockets are force-disconnected, and login itself
  is blocked with `403 ACCOUNT_DISABLED`.

**Game management (`/admin/matches`)**
- **Team registry** (`TeamRepository`) is the source of truth; add a team, delete a
  team (blocked with **409** while any match references it — referential integrity).
- Create a match from two teams (`homeId`/`awayId`, home ≠ away), group and kickoff;
  delete a match.
- New/removed matches appear/disappear **live for all clients** via `match:created`
  / `match:removed`. Matches store `homeId/awayId`; the server resolves teams into
  the wire DTO (client display is unchanged).

**Admin-mutation security:** strict Zod allowlist on PATCH (against `role`
mass-assignment), charset validation of team names (against stored XSS), rate-limit,
and a minimal audit log of every mutation.

### See real-time in action

1. Open the site in two tabs: sign in as **admin** in one, register a new viewer
   (or sign in as `viewer`) in the other.
2. Open a match and click **+ goal** in the admin tab.
3. The score updates instantly in both tabs. The viewer has no controls, and a
   direct API call returns **403**.

### Intentionally deferred (follow-up)

Refresh tokens/rotation, SQLite, per-match rooms, HTTPS/HSTS/CSP hardening,
Docker/CI, deep tests. Registration: email verification, account lockout,
breached-password check (HIBP/zxcvbn), enumeration-proof responses. Admin: team
rename, match soft-delete, file/DB audit log, cursor pagination and secondary
indexes (a scan is fine up to ~10k). Hooks are left in the code (repository
interfaces, env config, versioned envelope).

---

## Português (Europeu)

Uma aplicação web para acompanhar os resultados de um torneio de futebol local **em
tempo real**, com dois perfis: **administrador** (introduz resultados) e
**espectador** (apenas leitura). Interface responsiva, mobile-first. A interface está
localizada (EN / PT / UK) através de um seletor de idioma.

### Tecnologias

| Camada | Tecnologia |
|---|---|
| Cliente | Vite + React + TypeScript, Zustand, react-router, socket.io-client |
| Servidor | Node + Express + TypeScript, Socket.IO, bcryptjs + JWT, Zod |
| Partilhado | `shared/types.ts` — fonte única de tipos para cliente e servidor |
| Dados | Ficheiros JSON atrás de interfaces de repositório (fácil trocar por SQLite) |

### Decisões de arquitetura (do conselho de revisão de 5 perfis)

- **Tempo real:** o servidor difunde `match:update` compactos com um `rev`
  monótono — os clientes descartam eventos obsoletos/fora de ordem. Jogos
  criados/removidos são enviados ao vivo via `match:created` / `match:removed`.
- **Autenticação:** JWT num cookie **httpOnly + SameSite** (não em localStorage),
  segredo em variável de ambiente, HS256 fixado. O handshake do Socket.IO é
  autenticado.
- **Autorização:** todas as mutações passam por REST com `requireAdmin` no
  servidor. Os sockets são apenas leitura/difusão. Esconder botões no cliente é UX,
  não segurança.
- **Validação:** Zod na fronteira do servidor (resultados são inteiros 0..99,
  campos desconhecidos são removidos).
- **Concorrência:** `expectedRev` otimista — edições paralelas não se sobrepõem em
  silêncio.
- **Desempenho:** estado normalizado por `matchId` com linhas `React.memo` — um
  golo re-renderiza uma linha, não a lista inteira.

### Executar

```bash
# 1. Instalar dependências (servidor + cliente)
npm run install:all
# (para o cómodo `npm run dev`, execute também `npm install` na raiz para o concurrently)

# 2. Iniciar ambos os processos
npm run dev
#   servidor: http://localhost:3001
#   cliente:  http://localhost:5173  <-- abrir aqui
```

Ou em dois terminais: `npm run dev:server` e `npm run dev:client`.

### Contas iniciais

| Perfil | Utilizador | Palavra-passe |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Espectador | `viewer` | `viewer123` |

Novos espectadores registam-se no separador **Registo** na página de início de sessão.

### Registo de utilizadores

Auto-registo para espectadores, para que qualquer número de pessoas possa seguir o torneio.

- **O perfil é sempre `user`** — o servidor define-o de forma fixa; o corpo do
  pedido nunca é lido para obter um perfil (proteção contra escalonamento de
  privilégios).
- **Armazenamento:** `server/data/users.json` — um envelope `{ version, users }`
  atrás de um `UserRepository` (espelha o `MatchRepository`). As palavras-passe usam
  bcrypt (custo 12).
- **Unicidade:** insensível a maiúsculas, `Map<usernameLower, user>` — O(1); um
  `create()` atómico (o hash acontece ANTES da secção crítica, para que registos
  paralelos não colidam).
- **IDs:** `crypto.randomUUID()` (nunca posicionais — uma colisão de id significa
  autenticar-se como outra pessoa).
- **Validação (Zod):** utilizador 3–32 `[a-z0-9_]`, palavra-passe 8–72 bytes,
  `palavra-passe ≠ utilizador`, lista de nomes reservados (`admin`, `root`, `viewer`…).
- **Resiliência:** um `users.json` corrompido faz o servidor **falhar de forma
  segura** em vez de sobrescrever contas. `persist()` lança erro em caso de falha →
  5xx + rollback (sem contas fantasma).
- **Proteção do endpoint:** rate-limit (5/min) + guarda de mesma origem
  (`Sec-Fetch-Site`) contra login-CSRF. "Ocupado" → `409 USERNAME_TAKEN` (o login
  permanece genérico).

Endpoint: `POST /api/auth/register` → início de sessão automático pelo mesmo caminho
que `/login`.

### Painéis de administração (`/admin`)

Apenas para administradores (guarda no cliente + `requireAdmin` em todo o router
`/api/admin`). O link "Painel de administração" aparece no cabeçalho.

**Gestão de utilizadores (`/admin/users`)**
- Lista paginada com pesquisa por utilizador (feita para mais de 100 utilizadores).
- Ativar/desativar (`active`), mudar perfil (espectador ↔ administrador), eliminar.
- **Salvaguardas** (verificadas atomicamente no servidor): não pode
  desativar/despromover/eliminar-se a si próprio nem o **último administrador ativo**.
- **Revogação imediata:** o middleware recarrega o utilizador atualizado em cada
  pedido — desativar/eliminar/despromover têm efeito imediato apesar de um JWT
  válido; os sockets ativos de um utilizador desativado são desligados à força, e o
  próprio login é bloqueado com `403 ACCOUNT_DISABLED`.

**Gestão de jogos (`/admin/matches`)**
- O **registo de equipas** (`TeamRepository`) é a fonte de verdade; adicionar uma
  equipa, eliminar uma equipa (bloqueado com **409** enquanto algum jogo a
  referenciar — integridade referencial).
- Criar um jogo a partir de duas equipas (`homeId`/`awayId`, casa ≠ visitante),
  grupo e hora; eliminar um jogo.
- Jogos novos/removidos aparecem/desaparecem **ao vivo para todos os clientes** via
  `match:created` / `match:removed`. Os jogos guardam `homeId/awayId`; o servidor
  resolve as equipas no DTO (a apresentação no cliente não muda).

**Segurança das mutações de administração:** allowlist estrita do Zod no PATCH
(contra mass-assignment de `role`), validação de caracteres dos nomes das equipas
(contra XSS armazenado), rate-limit e um registo de auditoria mínimo de cada mutação.

### Ver o tempo real em ação

1. Abra o site em dois separadores: inicie sessão como **admin** num, registe um
   novo espectador (ou inicie sessão como `viewer`) no outro.
2. Abra um jogo e clique em **+ golo** no separador de administrador.
3. O resultado atualiza instantaneamente em ambos os separadores. O espectador não
   tem controlos, e uma chamada direta à API devolve **403**.

### Adiado intencionalmente (seguimento)

Refresh tokens/rotação, SQLite, salas por jogo, endurecimento HTTPS/HSTS/CSP,
Docker/CI, testes profundos. Registo: verificação por email, bloqueio de conta,
verificação de palavra-passe comprometida (HIBP/zxcvbn), respostas à prova de
enumeração. Administração: renomear equipas, soft-delete de jogos, registo de
auditoria em ficheiro/BD, paginação por cursor e índices secundários (um scan chega
até ~10 mil). Os ganchos ficam no código (interfaces de repositório, configuração
por env, envelope versionado).

---

## Українська

Веб-застосунок для відстеження рахунків матчів локального турніру **в реальному
часі**, з двома ролями: **адмін** (вносить результати) і **глядач** (тільки
перегляд). Респонсивний інтерфейс (мобільний-first). Інтерфейс локалізовано
(EN / PT / UK) через перемикач мови.

### Стек

| Шар | Технології |
|---|---|
| Клієнт | Vite + React + TypeScript, Zustand, react-router, socket.io-client |
| Сервер | Node + Express + TypeScript, Socket.IO, bcryptjs + JWT, Zod |
| Спільне | `shared/types.ts` — єдине джерело типів для клієнта й сервера |
| Дані | JSON-файли за інтерфейсами репозиторіїв (легко замінити на SQLite) |

### Архітектурні рішення (з рев'ю ради з 5 персон)

- **Real-time:** сервер розсилає компактні діфи `match:update` з полем `rev`
  (монотонна версія) — клієнт відкидає застарілі/невпорядковані події. Нові/видалені
  матчі надсилаються наживо через `match:created` / `match:removed`.
- **Автентифікація:** JWT у **httpOnly + SameSite** cookie (не в localStorage),
  секрет із env, алгоритм HS256 запінено. Хендшейк Socket.IO автентифікується.
- **Авторизація:** усі мутації — тільки через REST з `requireAdmin` на сервері.
  Сокети — лише читання/розсилка. Приховані кнопки на клієнті — це UX, не захист.
- **Валідація:** Zod на межі сервера (рахунки — цілі 0..99, невідомі поля відкидаються).
- **Конкурентність:** оптимістичний `expectedRev` — паралельні правки не «затирають» одна одну.
- **Продуктивність:** нормалізований стан по `matchId`, `React.memo` на рядках —
  один гол ре-рендерить лише один рядок, а не весь список.

### Запуск

```bash
# 1. Встановити залежності (сервер + клієнт)
npm run install:all
# (для зручного `npm run dev` — також `npm install` у корені задля concurrently)

# 2. Запустити обидва процеси
npm run dev
#   сервер: http://localhost:3001
#   клієнт: http://localhost:5173  <-- відкрити тут
```

Або в двох терміналах: `npm run dev:server` і `npm run dev:client`.

### Тестові акаунти (seed)

| Роль | Логін | Пароль |
|---|---|---|
| Адмін | `admin` | `admin123` |
| Глядач | `viewer` | `viewer123` |

Нові глядачі створюють акаунти самі — вкладка **«Реєстрація»** на сторінці входу.

### Реєстрація користувачів

Самореєстрація для глядачів, щоб турнір міг дивитися будь-яка кількість людей.

- **Роль завжди `user`** — сервер жорстко проставляє її; тіло запиту ніколи не
  читається на роль (захист від привілейної ескалації).
- **Зберігання:** `server/data/users.json` — envelope `{ version, users }` за
  інтерфейсом `UserRepository` (дзеркалить `MatchRepository`). Паролі — bcrypt (cost 12).
- **Унікальність:** case-insensitive, `Map<usernameLower, user>` — O(1), атомарний
  `create()` (хеш рахується ДО критичної секції → без race при паралельних реєстраціях).
- **ID:** `crypto.randomUUID()` (не позиційні — колізія id = чужа сесія).
- **Валідація (Zod):** логін 3–32 `[a-z0-9_]`, пароль 8–72 байти, `пароль ≠ логін`,
  denylist зарезервованих імен (`admin`, `root`, `viewer`…).
- **Стійкість:** зіпсований `users.json` → сервер **падає** (fail-closed), а не
  затирає акаунти reseed'ом. `persist()` кидає помилку → 5xx + rollback (без «фантомів»).
- **Захист endpoint'а:** rate-limit (5/хв) + same-origin guard (`Sec-Fetch-Site`)
  проти login-CSRF. Помилка «зайнято» → `409 USERNAME_TAKEN` (логін лишається generic).

Endpoint: `POST /api/auth/register` → авто-логін тим самим шляхом, що й `/login`.

### Адмін-панелі (`/admin`)

Доступні лише для ролі `admin` (клієнт-гейт + `requireAdmin` на всьому `/api/admin`).
Посилання «Адмін-панель» з'являється в шапці.

**Керування користувачами (`/admin/users`)**
- Пагінований список із пошуком за логіном (розрахований на 100+ користувачів).
- Увімкнути/вимкнути (`active`), змінити роль (глядач ↔ адмін), видалити.
- **Гардрейли** (перевіряються атомарно на сервері): не можна деактивувати/демоутити/
  видалити себе або **останнього активного адміна**.
- **Миттєвий revocation:** middleware вантажить свіжого користувача зі сховища на
  кожен запит — деактивація/видалення/демоут діють одразу, попри валідний JWT; живі
  сокети деактивованого форсовано роз'єднуються, а сам вхід блокується з
  `403 ACCOUNT_DISABLED`.

**Керування іграми (`/admin/matches`)**
- **Реєстр команд** (`TeamRepository`) — джерело істини; додавання команди, видалення
  (заблоковане з **409**, якщо на команду посилається матч — referential integrity).
- Створення матчу з двох команд (`homeId`/`awayId`, home≠away), групи й часу; видалення.
- Нові/видалені матчі з'являються/зникають **у всіх клієнтів наживо** через
  `match:created` / `match:removed`. Матч зберігає `homeId/awayId`, сервер резолвить
  команди у wire-DTO (клієнт відображення не змінюється).

**Безпека адмін-мутацій:** strict Zod-allowlist на PATCH (проти mass-assignment
`role`), charset-валідація назв команд (проти stored-XSS), rate-limit і мінімальний
audit-лог кожної мутації.

### Як побачити real-time

1. Відкрий сайт у двох вкладках: в одній увійди як **admin**, в іншій — зареєструй
   нового глядача (або увійди як `viewer`).
2. Зайди в матч, натисни **+ гол** у вкладці адміна.
3. Рахунок оновиться миттєво в обох вкладках. У глядача кнопок керування немає,
   а прямий запит до API повертає **403**.

### Що свідомо відкладено (follow-up)

Refresh-токени/ротація, SQLite, per-match rooms, HTTPS/HSTS/CSP хардненг,
Docker/CI, глибокі тести. Для реєстрації: email-верифікація, account lockout,
breached-password check (HIBP/zxcvbn), enumeration-proof відповіді. Для адмінки:
рейм команд, soft-delete матчів, файловий/DB audit-лог, cursor-пагінація та
вторинні індекси (scan достатній до ~10k). Гачки в коді залишені (інтерфейси
репозиторіїв, env-конфіг, versioned envelope).
