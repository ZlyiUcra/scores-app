# Quickstart Validation: Tournament Import

Runnable scenarios proving the feature end to end. Prerequisites: Node >= 22.5, dependencies installed
(`npm run install:all`), both dev servers running (`npm run dev` -> client on :5173, server on :3001), an
admin account.

## Scenario 1: Round trip (US1 - restore from backup)

1. In the admin area, open Tournaments and export an existing tournament with groups, teams, players, played
   matches and bracket results - save the JSON file.
2. Use the Import action on the same page and pick the saved file.
3. Expected: a new tournament appears in the list (same name, fresh identity), with identical groups,
   standings, squads, match results and bracket state. The original tournament is untouched.
4. Export the NEW tournament and compare content with the original file (ignore `exportedAt`, all ids, and
   `rev` values - everything else must match). SC-002.

## Scenario 2: Status behaviour (US2/US3 + default-tournament effect)

1. Import a file whose tournament has `"status": "finished"` while another tournament is active.
   Expected: it arrives as a read-only archive; the default landing tournament does NOT change.
2. Edit the file to `"status": "upcoming"` and import. Expected: arrives as upcoming, fully prepared.
3. Edit to `"status": "active"` and import. Expected: it becomes the default landing tournament (documented
   recovery behaviour) - verify by opening the app root in a fresh tab.

## Scenario 3: Rejection paths (FR-004..FR-006, FR-009)

Run against the API directly (cookie from an admin session; `$FILE` is a valid export):

```bash
# a) Not JSON -> 400, nothing created
curl -b cookies.txt -H "Content-Type: application/json" -d 'not json' \
  http://localhost:3001/api/admin/tournaments/import

# b) Wrong schema version -> 400 naming the version
jq '.schemaVersion = 2' $FILE | curl -b cookies.txt -H "Content-Type: application/json" -d @- \
  http://localhost:3001/api/admin/tournaments/import

# c) Dangling reference -> 400 (match pointing at a team id not present in the file)
jq '.matches[0].homeId = "00000000-0000-0000-0000-000000000000"' $FILE | curl -b cookies.txt \
  -H "Content-Type: application/json" -d @- http://localhost:3001/api/admin/tournaments/import

# d) Charset violation -> 400 (script tag in a team name)
jq '.teams[0].name = "<script>alert(1)</script>"' $FILE | curl -b cookies.txt \
  -H "Content-Type: application/json" -d @- http://localhost:3001/api/admin/tournaments/import

# e) rev floor -> 400
jq '.matches[0].rev = 0' $FILE | curl -b cookies.txt -H "Content-Type: application/json" -d @- \
  http://localhost:3001/api/admin/tournaments/import

# f) Oversized body (>1MB) -> 413
python -c "print('{\"pad\":\"' + 'x'*1100000 + '\"}')" | curl -b cookies.txt \
  -H "Content-Type: application/json" -d @- http://localhost:3001/api/admin/tournaments/import

# g) Rate limit -> 6th request within a minute returns 429
```

After every rejected call: the tournament list is unchanged (SC-003, SC-004).

## Scenario 4: Fresh identity (FR-007)

Import the same valid file twice. Expected: two independent tournaments (duplicate names are fine); editing a
score in one does not affect the other.

## Scenario 5: Non-functional checks

- `npm run typecheck` passes in both packages (constitution workflow gate).
- Viewer tab open on a live tournament shows no visible freeze while an import runs (SC-005).
- The audit viewer shows an entry for each import with actor and resulting tournament (FR-010).
- All three languages (EN/UA/PT) show translated labels for the new import action and its error messages.
