# Starlight Production System — Documentation

**Last restructured:** 6 May 2026 (S41 — moved into the repo)
**Maintainer:** Mateusz Garwacki

These docs are the authoritative reference for the Starlight Production System. They live in the repo so they version-control alongside the code they describe. Project knowledge holds only a pointer to here.

## Read order for a cold start

1. **`01_overview.md`** — What the system is, who it serves, the four design principles, the four zones, the Golden Path. Start here.
2. **`02_architecture.md`** — Tech stack, auth model, three-layer security, route map, integrations.
3. **`03_database_schema.md`** — Current verified schema. Tables, views, RPCs, invariants, watcher views. Read when touching data.
4. **`04_security_policy.md`** — SP-001 to SP-017. Formal policy register. Read when touching auth, RLS, secrets, or deployment.
5. **`05_conventions.md`** — Deploy sequence, SQL rules, UX patterns, audit/notification patterns, Desktop Commander gotchas. Read before writing code.
6. **`06_tooling.md`** — Which MCP tool to use for which job. Default shell, file I/O, deploy sequence, what never to run through shell-over-MCP. Read at session start; the decision matrix saves real time.
7. **`TRACKER.md`** — Living session log. The running record of what's shipped, what's deferred, what's broken. Always check the Cleanup Backlog at the top.

## Update triggers

| File | Updated when |
|---|---|
| `01_overview.md` | Mission, principles, or zones change. Rare. |
| `02_architecture.md` | Stack, auth, or integration changes. |
| `03_database_schema.md` | Every session with schema changes. Ship in the same commit as the migration. |
| `04_security_policy.md` | Every 6 months (SP-001), or after any security change. |
| `05_conventions.md` | When a new pattern is promoted from TRACKER session notes. |
| `06_tooling.md` | When the tool/MCP setup changes (added/removed servers, new specialised MCPs, shell config tweaks). |
| `TRACKER.md` | Every session. |

## Working with these docs

**Session start.** Always read `TRACKER.md` first to see where things ended. Then read whichever of the other files are relevant to the work being done. Never assume the schema doc is right — verify against `information_schema` or `pg_proc` before generating SQL.

**Session end.** Update `TRACKER.md` with a session entry. Update `03_database_schema.md` if the schema changed. Both updates ship in the same commit as the code/migration changes they describe — don't push docs out of sync with the deploy.

**Disagreement between doc and reality.** Reality wins. Update the doc. If reality is wrong (the code is buggy), fix reality, not the doc.
