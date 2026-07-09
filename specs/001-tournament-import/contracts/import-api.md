# API Contract: Tournament Import

## HTTP endpoint

```
POST /api/admin/tournaments/import
Content-Type: application/json
```

Mounted inside the admin router (`server/src/routes/admin/index.ts`), so `requireAdmin` is inherited from the
single router-level trust boundary - the route file itself carries no auth logic.

Mirrors the existing export endpoint (`GET /api/admin/tournaments/:id/export`), which produces the request
body format.

### Request

- Body: a complete `TournamentExport` JSON document (see [data-model.md](../data-model.md)) - byte-for-byte
  what the export endpoint downloads.
- Route-scoped parser: `express.json({ limit: '1mb' })` on this route only; the global 16 KB parser is not
  involved and not changed.
- Rate limit: dedicated limiter, 5 requests/minute (modeled on the existing `exportLimiter`), responding with
  the standard rate-limit error envelope.

### Responses

| Status | Body | When |
|--------|------|------|
| `201` | `{ "tournament": Tournament }` - the newly created tournament (fresh server-minted id, status from the file) | Import fully succeeded |
| `400` | `{ "error": { "code": "VALIDATION", "message": <specific> } }` | Malformed JSON, schema violation (including wrong `schemaVersion`, unknown keys, charset violations, rev < 1), or graph violation (dangling/duplicate in-file references, `homeId === awayId`, jersey duplicates, group/bracket caps, invalid bracket slot keys). Nothing was written |
| `401` / `403` | standard error envelope | Not authenticated / not an admin (router-level) |
| `413` | parser error envelope | Body over 1 MB - rejected by Content-Length before parsing |
| `429` | `{ "error": { "code": "RATE_LIMITED", ... } }` | More than 5 imports in a minute |
| `500` | `{ "error": { "code": "STORE_WRITE_FAILED", "message": <includes new tournament id> } }` | A write failed AFTER writing began. The partially created tournament REMAINS and is identified by id in the message; nothing else was affected |

### Behavioural guarantees

- All validation (parse, zod, graph) completes BEFORE the first write; a 400 therefore guarantees zero
  database changes.
- Every id in the body is treated as an in-file label only; all persisted entities receive fresh server-minted
  ids (importing the same file twice yields two independent tournaments).
- No existing row is ever updated or deleted, on any path.
- Success and post-write failure both leave an audit entry (actor, timestamp, resulting tournament id, entity
  counts).
- No socket broadcast: the tournament list is REST-only by design; the client refreshes its list after the
  call returns.

## Internal contract additions (storage seam)

New methods on existing repository interfaces in `server/src/storage/contracts.ts`, implemented by the sqlite
driver; signatures mirror the singular verbs and the existing `matches.saveMany` batching discipline:

```ts
// GroupRepository
createMany(tournamentId: string, names: string[]): Promise<Group[]>;

// TeamRepository - rows carry the optional group placement + seeding key,
// so import needs no per-team second assign() call
createMany(
  tournamentId: string,
  rows: { name: string; shortName: string; groupId: string | null; groupAddedAt: string | null }[],
): Promise<Team[]>;

// PlayerRepository
createMany(
  rows: { teamId: string; name: string; number: number | null; position: string | null }[],
): Promise<Player[]>;
```

Constraints on all three: single table each, no cross-repository knowledge, stage-then-ONE-persist with
all-or-nothing rollback of staged entries (the `saveMany` pattern). Exact signatures may be tightened at
implementation time as long as these constraints hold.

## Client API contract

`client/src/api/admin.ts` gains:

```ts
importTournament(fileText: string): Promise<{ tournament: Tournament }>
```

The client reads the picked file as text and sends it as the request body unchanged (no client-side parsing
beyond a cheap JSON sanity check for a friendlier error message; the server remains the authority).
