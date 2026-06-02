# Starlight Production System — Claude tooling policy

**Last updated:** 2 Jun 2026 (S59)
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
| Trigger a production deploy | `npx vercel --prod --yes` via `windows-cli` — see Deploy sequence below | `Vercel:deploy_to_vercel` exists but does NOT actually deploy; it returns help text telling the caller to run the CLI or push to git. The CLI is the real path. The shell call will return "Tool execution failed" on MCP timeout (~30s), but the underlying process keeps running and the build fires. |
| Check deploy status | `Vercel:list_deployments` (filter by `since` to grab just the new ones) + `Vercel:get_deployment` for a specific build | Structured response, no `vercel ls` pagination friction. Use to confirm the build SHA matches what was just pushed and to watch it through to READY. |

## Default shell convention

When using `windows-cli:execute_command`:
- `shell: cmd` — never `powershell`. PowerShell's execution policy blocks the Vercel CLI and a handful of other tools we run. cmd is the team default and matches everything in the project conventions.
- `workingDir` — always set explicitly to an absolute path (e.g. `C:\Users\mateusz.garwacki\Downloads\starlight-web`). Don't rely on whatever cwd Claude Desktop launched in.
- Avoid `&` / `&&` command chaining inside the `command` string — the MCP transport sometimes mangles them on cmd. Run separate commands in separate calls, or write a tiny `.bat` file and execute that.

## Never use shell tools for

These have all hung sessions or eaten >5 minutes in past sessions. Use the specialised MCP or skip the step entirely.

- **Production builds** — `npx vercel --prod` IS the only path; `Vercel:deploy_to_vercel` doesn't trigger a build, it returns help text. Accept that the shell call will time out and the deploy will still fire — monitor via `Vercel:list_deployments` + `Vercel:get_deployment`, not by waiting on the shell return. Don't `git status` or commit anything else until the deploy reaches READY because Vercel may cancel an in-flight build if another push lands.
- **Full-repo typechecks** — `npx tsc --noEmit -p .`. Let the Vercel build catch TS errors; a failed deploy costs ~2 minutes versus the 8+ minutes a local tsc can run for. (S50a: tsc was killed after 8 minutes with no output.)
- **Fresh `npm install`** — too long, too much streaming output. If a dependency genuinely needs installing, do it from your own terminal and tell Claude when it's done.
- **`npm run dev`** — long-running watcher, will never return. Run locally.

The pattern: **anything that takes >30s with streaming output is a bad fit for shell-over-MCP**. The MCP transport is request/response, not streaming. The longer the gap between start and completion, the more likely the tool call appears hung even when the underlying process is healthy.

## Deploy sequence (current)

The deploy is unavoidably a ~90s streaming-output operation. There is no API short-circuit for it via MCP today — the named `Vercel:deploy_to_vercel` tool only returns instructions, it doesn't actually trigger a build. So we live with the shell, just monitor via the Vercel MCP rather than block on the shell.

1. Claude edits files via `Filesystem:edit_file` / `write_file`.
2. Claude writes `commit-msg.txt` via `Filesystem:write_file`.
3. Claude updates `docs/TRACKER.md` and `docs/03_database_schema.md` as appropriate.
4. Claude commits + pushes via `windows-cli:execute_command` (cmd, workingDir = repo root):
   - `git add -A`
   - `git commit -F commit-msg.txt`
   - `git push origin main`
   Each as a separate call so output is clean per step. These all complete in <5s.
5. Claude runs `npx vercel --prod --yes` via `windows-cli`. **The MCP call will return "Tool execution failed" after ~30s, but the underlying CLI process keeps running and the deploy fires.** Ignore the failure noise — do not retry, do not panic.
6. Claude polls `Vercel:list_deployments(since=<step-5-start>)` to confirm the new deploy is queued for the right commit SHA. Verify `state` is `QUEUED` or `BUILDING`.
7. Claude polls `Vercel:get_deployment(deploymentId)` until `state === "READY"` (or `ERROR` / `CANCELED`). Typical build: 50–100s.
8. Once READY, the `workshop-five-gamma.vercel.app` alias is automatically updated by Vercel. Report back to the user with commit SHA, deploy ID, and build duration.

**On the GitHub-push auto-deploy:** the webhook does fire when we push and queues its own deploy, but in practice that deploy is often CANCELED before completion (Vercel queue behaviour we haven't fully diagnosed — may be related to multiple deploys queued close together). The explicit `npx vercel --prod` from step 5 is what reliably lands production. Don't rely on the auto-deploy.

**Capturing the CLI deploy cleanly (S59):** rather than eat the ~30s tool-timeout and then page through `list_deployments` (heavy output), run the deploy from a one-line `.bat` that redirects to a log with a sentinel — `call npx vercel --prod --yes > deploy.log 2>&1` then `echo ___DONE___ >> deploy.log` — launch it, then poll the log with `read_file` (tail). The log carries the `Production:` and `Aliased:` URLs plus the build tail, so you see READY and the live URL directly. `Vercel:get_deployment_build_logs` on the inspect ID is the quick way to tell a real build (events present) from an empty-log queue-cancel (`{"events":[]}`). Delete the scratch `.bat`/`.log` after. Hard-won corollary, now confirmed: **deploy is one push at a time.** S59 pushed code + docs + an empty trigger commit within ~10 min and Vercel cancelled all three before any built (empty build logs), leaving prod on a stale commit; the lone CLI deploy with nothing pushed alongside it is what landed.

**Doc-only commits:** if the commit changes nothing under `src/`, `public/`, or anywhere the runtime reads, skip the deploy entirely. The file lives in git history and that's enough. Saves a build cycle.

## Filesystem mount

The Filesystem MCP server mounts:

- `C:\Users\mateusz.garwacki\Downloads\starlight-web` (the repo)

If a second path is needed (e.g. `OneDrive - Starlight Design\Documents`), add it as an additional positional arg in `claude_desktop_config.json` under `mcpServers.filesystem.args`. The space in the OneDrive folder name requires the path to be passed as a single argument string, not split. If the path fails to mount silently, check that the folder actually exists at that exact path — typos and OneDrive sync state both cause silent mount failures.

## When this policy might be wrong

- **If we ever need persistent shell state** (an SSH session, an interactive Python REPL, a `psql` session against an external DB) — use Desktop Commander. The PID tracking and force-terminate hygiene are worth it for stateful work.
- **If `windows-cli` ever loses access to the repo dir** (sandbox change, security tightening) — fall back to DC `start_process` until the wider security config is sorted.
- **If a Vercel API outage breaks `Vercel:get_deployment` polling** — fall back to checking the Vercel dashboard in a browser, or `npx vercel ls` via shell. The deploy itself doesn't depend on the monitoring path.