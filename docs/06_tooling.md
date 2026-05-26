# Starlight Production System — Claude tooling policy

**Last updated:** 26 May 2026 (S50b)
**Maintainer:** Mateusz Garwacki

This file tells Claude which MCP tool to reach for in which situation. It exists because the same operation can usually be done multiple ways, and the wrong choice silently costs minutes per session (process hangs, opaque streams, extra tool calls, output noise). Codifying the policy here means every session opens with the right defaults.

## Decision matrix

| Task | Tool | Why |
|---|---|---|
| Read a file | `Filesystem:read_file` | Clean primitive, no shell overhead, supports `head` / `tail` for partial reads. |
| Edit an existing file | `Filesystem:edit_file` | `oldText` / `newText` pairs, returns git-style diff. |
| Create / overwrite a file | `Filesystem:write_file` | Atomic write, no shell escaping. |
| List a directory | `Filesystem:list_directory` (or `windows-cli` `dir /b` if a single-line list is all that's needed) | Either works; Filesystem is structured, shell is faster for one-line lists. |
| Run a fast, stateless shell command | `windows-cli:execute_command` with `shell: cmd` and explicit `workingDir` | Single tool call, clean output, no PID tracking, no session cleanup. |
| Run interactive REPLs or persistent shell sessions | `Desktop Commander:start_process` + `interact_with_process` | DC keeps a shell alive between calls. Not actually used in this project today but available if needed. |
| Run a SQL read / DML | `Supabase:execute_sql` (project_id `qbdnoueqkmhznqzpkvos`) | Direct connection, untrusted-data sandboxed. |
| Run a SQL DDL / schema change | `Supabase:apply_migration` | Wraps in a transaction, records in the migrations table. |
| Trigger a production deploy | `Vercel:deploy_to_vercel` | API call, returns immediately, no streaming a 1-minute build through a shell. |
| Check deploy status | `Vercel:list_deployments` | Structured response, no `vercel ls` pagination friction. |

## Default shell convention

When using `windows-cli:execute_command`:
- `shell: cmd` — never `powershell`. PowerShell's execution policy blocks the Vercel CLI and a handful of other tools we run. cmd is the team default and matches everything in the project conventions.
- `workingDir` — always set explicitly to an absolute path (e.g. `C:\Users\mateusz.garwacki\Downloads\starlight-web`). Don't rely on whatever cwd Claude Desktop launched in.
- Avoid `&` / `&&` command chaining inside the `command` string — the MCP transport sometimes mangles them on cmd. Run separate commands in separate calls, or write a tiny `.bat` file and execute that.

## Never use shell tools for

These have all hung sessions or eaten >5 minutes in past sessions. Use the specialised MCP or skip the step entirely.

- **Production builds** — `npx vercel --prod`. Use `Vercel:deploy_to_vercel` instead. (S50a session: a `vercel --prod` ran for 17 minutes through DC before we cut it and confirmed the build had actually completed minutes earlier — the output just didn't stream back.)
- **Full-repo typechecks** — `npx tsc --noEmit -p .`. Let the Vercel build catch TS errors; a failed deploy costs ~2 minutes versus the 8+ minutes a local tsc can run for. (S50a: tsc was killed after 8 minutes with no output.)
- **Fresh `npm install`** — too long, too much streaming output. If a dependency genuinely needs installing, do it from your own terminal and tell Claude when it's done.
- **`npm run dev`** — long-running watcher, will never return. Run locally.

The pattern: **anything that takes >30s with streaming output is a bad fit for shell-over-MCP**. The MCP transport is request/response, not streaming. The longer the gap between start and completion, the more likely the tool call appears hung even when the underlying process is healthy.

## Deploy sequence (current)

Replaces the older `git add && commit && push && npx vercel --prod` one-liner. The split below avoids the long-running step ever touching shell-over-MCP.

1. Claude edits files via `Filesystem:edit_file` / `write_file`.
2. Claude writes `commit-msg.txt` via `Filesystem:write_file`.
3. Claude updates `docs/TRACKER.md` and `docs/03_database_schema.md` as appropriate.
4. Claude runs the commit + push via `windows-cli:execute_command` (cmd, workingDir = repo root):
   - `git add -A`
   - `git commit -F commit-msg.txt`
   - `git push origin main`
   Each as a separate call so output is clean per step.
5. Claude calls `Vercel:deploy_to_vercel` to trigger production.
6. Claude calls `Vercel:list_deployments` to confirm the build is Ready before reporting back.

Steps 4–6 are typically under 10 seconds each on Claude's side. The actual Vercel build still takes ~1 minute server-side, but we no longer block on watching it stream.

## Filesystem mount

The Filesystem MCP server mounts:

- `C:\Users\mateusz.garwacki\Downloads\starlight-web` (the repo)

If a second path is needed (e.g. `OneDrive - Starlight Design\Documents`), add it as an additional positional arg in `claude_desktop_config.json` under `mcpServers.filesystem.args`. The space in the OneDrive folder name requires the path to be passed as a single argument string, not split. If the path fails to mount silently, check that the folder actually exists at that exact path — typos and OneDrive sync state both cause silent mount failures.

## When this policy might be wrong

- **If we ever need persistent shell state** (an SSH session, an interactive Python REPL, a `psql` session against an external DB) — use Desktop Commander. The PID tracking and force-terminate hygiene are worth it for stateful work.
- **If `windows-cli` ever loses access to the repo dir** (sandbox change, security tightening) — fall back to DC `start_process` until the wider security config is sorted.
- **If a Vercel API outage breaks `deploy_to_vercel`** — `windows-cli` running `npx vercel --prod --yes` is the manual fallback. Accept the 1–2 minute hang risk for one deploy.