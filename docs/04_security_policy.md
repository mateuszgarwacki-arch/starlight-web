# Starlight Production System — Information Security Policy

**Version:** 2.2
**Last updated:** 20 May 2026 (S46)
**Classification:** CONFIDENTIAL — Internal Use Only
**Document owner:** Mateusz Garwacki, Workshop Manager

Supersedes v2.1 (May 2026). Updated to reflect:
- **SP-006:** the SECURITY INVOKER requirement for views was aspirational in v2.1 — 15 views were still inheriting Supabase's SECURITY DEFINER default and bypassing RLS on financial data (`qry_invoice_*`, `qry_dash_quote_stats`, etc.). All migrated in S46. The rule is now CI-enforced via `scripts/db-checks.sql` (`.github/workflows/db-checks.yml`), which also asserts that every public table has RLS enabled and no SECURITY DEFINER function is callable by `PUBLIC`. Postgres footgun documented: `REVOKE EXECUTE FROM anon` is a no-op while `PUBLIC` retains EXECUTE — always REVOKE FROM PUBLIC first, then GRANT explicitly.
- **SP-013:** the existing "raw `.update()` on audited tables is a policy violation" rule now has a sharper operational rationale. PostgREST returns no error when RLS blocks an UPDATE or DELETE (0 rows affected, `error: null`) — unchecked raw writes therefore silently fail. The S46g and S46h hotfixes were both manifestations of this trap. The `auditedUpdate` helper must be hardened to surface zero-row-no-error and remaining raw `.update()` call sites migrated to it (backlog).
- **SP-NEW (no separate number):** the GRANT-then-RLS pattern for new tables is now mandatory in advance of the Supabase October 30, 2026 default-deny enforcement. Pattern documented in `docs/05_conventions.md` §20.1.
- General S46 housekeeping: search_path pinning required on all new functions, REVOKE-FROM-PUBLIC-then-GRANT pattern for SECURITY DEFINER functions documented.

Supersedes v2.0 (April 2026). v2.0 → v2.1 introduced:
- **SP-002:** freelancer auth is a 6-digit numeric PIN (not ≥ 8 char password) — the prior policy claim was aspirational and never matched reality. PIN length is the deliberate, accepted tradeoff for a mobile-first low-friction freelancer workforce.
- **SP-006 / SP-008:** `freelancer-sync` API patched in S41 to read role from `app_metadata` only, removing a `user_metadata.role` fallback that constituted a privilege-escalation foothold.
- General S41 housekeeping (pre-deploy checklist refreshed, Job Complete state acknowledged).

## 1. Purpose and scope

This document defines the security policies, standards, and procedures governing the Starlight Production System. It establishes mandatory requirements for authentication, authorisation, data protection, code deployment, and incident response. All personnel who develop, maintain, administer, or use the system are bound by these policies.

The system manages job costing, work orders, crew scheduling, materials procurement, and financial data for Starlight Design. It handles commercially sensitive information including client quotes, profit margins, supplier costs, and freelancer day rates. Protecting this data is a business-critical requirement.

> **POLICY SP-001 — Security policy review**
> This policy document must be reviewed and updated at least every 6 months, or immediately following any security incident, significant architecture change, or addition of a new data category. Reviews must be documented with date, reviewer name, and changes made.

## 2. Authentication

### 2.1 User roles

| Role | Access |
|---|---|
| **admin** | Everything. User management, time-entry archive, audit log, role changes. |
| **production_manager** | Full system: all desktop and mobile routes, all database tables, all API endpoints. |
| **foreman** | Execution access: workshop, work orders, time entries. No access to quotes, invoices, supplier costs, or rate cards. |
| **freelancer** | Mobile only (`/m/*`): own task list, own time entries, own schedule. Cannot see other freelancers' data, costs, or commercial information. |

### 2.2 Credential standards

> **POLICY SP-002 — Credential standards (revised S41)**
>
> All human accounts authenticate via Supabase Auth. Credentials are stored only as bcrypt hashes within Supabase Auth — no plaintext credentials in any application table.
>
> **Staff accounts** (admin, production_manager, foreman): email + password, minimum 12 characters.
>
> **Freelancer accounts:** phone number + 6-digit numeric PIN. PIN is set by a PM via the Mobile Access dialog on `/crew` and shared with the freelancer over WhatsApp. Existing 4-digit PINs continue to function (they are already hashed in Supabase Auth) but every newly-set or reset PIN must be 6 digits.
>
> **Why 6-digit numeric PIN for freelancers** — accepted tradeoffs:
> - The freelancer workforce is mobile-first, often without business email, with high turnover and minimal patience for credential ceremony. A ≥ 8 char alphanumeric password gets written on a wall, defeating the policy.
> - Phone-number coupling is effective MFA via SIM possession.
> - Mobile login is the only freelancer surface; HTTPS-only transport.
> - PINs are visible in plaintext only at the set/share moment (Mobile Access dialog) and never stored outside Supabase Auth's bcrypt store.
> - PM-driven reset rather than self-serve.
>
> No plaintext PIN column is permitted on `tbl_freelancers` or any other application table. The legacy `tbl_freelancers.pin` column was dropped pre-S41 and any reference to it is historical and must be removed on sight.

> **POLICY SP-003 — Credential transmission**
> Credentials must never appear in URL query strings, HTTP GET parameters, referrer headers, or application logs. All authentication must occur over HTTPS. Calendar download tokens use HMAC-SHA256 signatures with time-limited expiry (maximum 72 hours). Tokens are generated server-side and verified server-side — no secret material is exposed to the client.

### 2.3 Session management

> **POLICY SP-004 — Session handling**
> Sessions are managed by Supabase Auth using JWT tokens stored in secure, httpOnly cookies set by the Supabase SSR library. Sessions expire according to Supabase project settings (default: 1 hour access token, 7 day refresh token).
> The proxy (`src/proxy.ts`, Node.js runtime) must validate the session on every request to a protected route. Expired sessions must redirect to the appropriate login page (`/login` for desktop, `/m/login` for mobile) — never serve stale data.

## 3. Authorisation

### 3.1 Defence in depth

The system enforces authorisation at three independent layers. If any single layer fails, the remaining layers prevent unauthorised access.

- **Proxy layer:** `src/proxy.ts` validates sessions and enforces role-based route access before any page renders.
- **API layer:** Every server-side API route independently validates the session and checks role permissions before executing any operation.
- **Database layer:** PostgreSQL Row Level Security (RLS) policies enforce data isolation at the query level. Even if proxy and API checks are bypassed, the database itself rejects unauthorised queries.

> **POLICY SP-005 — Defence in depth is mandatory**
> No single layer of security may be the sole control for any data access path. Every route that serves data must be protected by at least two independent authorisation checks. The removal or weakening of any layer requires documented approval and compensating controls.

### 3.2 Row Level Security

> **POLICY SP-006 — RLS requirements**
> Every table in the `public` schema must have RLS enabled. Every table must have explicit policies for SELECT, INSERT, UPDATE, and DELETE operations, following the consolidated pattern (1 policy per action, `TO authenticated`, using `get_my_role()` CASE expression). The default-deny behaviour of RLS (no policy = no access) must never be circumvented by permissive catch-all policies.
>
> Commercial tables (quotes, invoices, rate cards, business settings, suppliers, material prices) must restrict all operations to admin/PM roles.
>
> **Role reads must use `app_metadata.role` only.** `user_metadata` is user-editable per Supabase Auth's design and reading from it is a privilege-escalation foothold. The S41 patch to `freelancer-sync` removed exactly such a fallback. Any new code reading roles must follow this rule — `get_my_role()` SQL helper enforces it on the DB side.
>
> New tables must have RLS policies applied **before any data is inserted**. The `rls_auto_enable()` trigger covers enabling RLS on table creation; policies must still be written explicitly.

**Tier 1 (Restricted, admin/PM only):**
- `tbl_quotes`, `tbl_quote_lines`, `tbl_quote_line_contractors`
- `tbl_invoices`, `tbl_invoice_lines`, `tbl_invoice_allocations`
- `tbl_rate_card`, `tbl_business_settings`
- `tbl_suppliers`, `tbl_material_prices`, `tbl_material_aliases`

**Helpers used by all policies:**
- `get_my_role()` — reads `app_metadata.role` from the JWT. Reads the non-user-editable metadata; reading `user_metadata` instead would be a vulnerability.
- `get_my_freelancer_id()` — reads `freelancer_id` from the JWT.

All views are `SECURITY INVOKER` — RLS applies to queries through views. Cross-user freelancer reads that legitimately need to bypass RLS (e.g. showing "who else is on this WO") use `SECURITY DEFINER` RPC functions that return only non-sensitive fields. Example: `rpc_active_workers` returns who + where but never rates or costs.

### 3.3 Realtime subscriptions

> **POLICY SP-007 — Realtime security**
> Any table added to the Supabase Realtime publication must have `REPLICA IDENTITY FULL` set. Without this, PostgreSQL only sends the primary key columns in the WAL change events, and RLS policies that reference other columns cannot evaluate correctly — a freelancer could receive change events containing data they should not see.
> Verify on every new subscription: the four currently-published tables are `tbl_work_orders`, `tbl_wo_time_entries`, `tbl_freelancer_schedule`, `tbl_notifications`.

## 4. API security

> **POLICY SP-008 — API authentication requirement**
> Every API route must validate the caller's identity before performing any operation. API routes must never rely solely on the proxy for authentication — they must independently verify the session. The proxy can be bypassed through misconfiguration, and API routes may be called directly by tools or scripts outside the browser.
>
> **Role checks must read `user.app_metadata.role` only**, never falling back to `user_metadata.role`. The S41 patch to `freelancer-sync` removed exactly such a fallback after it was identified as a privilege-escalation foothold.

Standard pattern:

1. Extract the `Authorization` header from the request.
2. Create a Supabase client using the anon key with the provided header.
3. Call `supabase.auth.getUser()` to validate the session server-side.
4. Check `user.app_metadata.role` (only) against the required role for the endpoint.
5. Return 401 (no session) or 403 (wrong role) before any processing.

> **POLICY SP-009 — API key protection**
> Server-side API keys (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MICROSOFT_CLIENT_SECRET`) must never be exposed to the client. They must be stored exclusively in Vercel environment variables. They must never appear in client-side code, browser network requests, or error messages returned to the client.
> The service role key must only be used in server-side API routes that legitimately need to bypass RLS (currently: `/api/auth/freelancer-sync`, `/api/calendar/[freelancerId]`). It must never be used in the browser Supabase client.

> **POLICY SP-010 — Input validation**
> All API endpoints must validate and sanitise input before processing. File uploads must verify MIME type and reject unexpected formats. JSON request bodies must be type-checked before use. Path parameters and query strings must be validated as the expected type (number, UUID, etc.). Error messages must never expose internal system details, stack traces, or SQL errors to the client.

## 5. Data protection

> **POLICY SP-011 — Data classification**
> System data is classified into three tiers.
> **Tier 1 (Restricted):** client quotes, profit margins, supplier costs, day rates, business settings, API keys. Access: admin/PM only.
> **Tier 2 (Internal):** work orders, time entries, BOM, schedules, job details, close notes. Access: admin/PM + foreman + freelancer (own data).
> **Tier 3 (Reference):** lookup values, material names, activity verbs. Access: all authenticated users.

> **POLICY SP-012 — Backups and export**
> Database backups are managed by Supabase (automatic daily backups with point-in-time recovery on Pro plan — upgrading to Pro is a prerequisite for multi-PM operation). Any manual data export (CSV, SQL dump) must be treated as the highest classification tier contained within the export. Exports containing Tier 1 data must not be stored on personal devices, shared drives, or sent via email without encryption.

> **POLICY SP-013 — Logging and monitoring**
> Authentication failures are logged by Supabase Auth. API errors are logged by Vercel. Application-level audit logging is implemented via `tbl_audit_log` and the `auditedUpdate / auditedInsert / auditedDelete` helpers in `src/lib/audit.ts`. All mutations on tables listed in `AUDITED_TABLES` must go through these helpers — raw `.update()` / `.insert()` / `.delete()` on audited tables is a policy violation.
> Logs must not contain credentials, tokens, or Tier 1 data values.

## 6. Development and deployment

> **POLICY SP-014 — Secure development checklist**
> Every new feature must be evaluated against this checklist before deployment:
> 1. Does it require authentication? → proxy + API auth both implemented.
> 2. Does it create new database tables? → RLS policies applied before data insertion; added to `AUDITED_TABLES` if mutations need tracking.
> 3. Does it expose data to the client? → verify RLS restricts by role.
> 4. Does it add a new API route? → independent auth check per SP-008. Role read from `app_metadata` only.
> 5. Does it handle file uploads? → validate MIME type per SP-010.
> 6. Does it add a Realtime subscription? → `REPLICA IDENTITY FULL` per SP-007.
> 7. Does it handle credentials? → no URL exposure per SP-003.
> 8. Does it use the service role key? → confined to server route; justification documented.
> 9. Does it add a denormalised mirror of data that already lives elsewhere? → don't, unless there's a maintaining trigger and an invariant watcher view (`qry_*_invariant_violations`). Otherwise it will drift. The S41 `tbl_quotes.quote_value` drop is the canonical case study.

> **POLICY SP-015 — Environment separation**
> Production environment variables must never be used in development. The Supabase service role key must never be committed to version control. `.env.local` must be listed in `.gitignore`. Vercel environment variables must be managed via the Vercel dashboard or interactive `vercel env add`, never via piped `echo` (which introduces trailing newlines that silently corrupt secrets).

> **POLICY SP-016 — Dependency management**
> npm dependencies must be reviewed before installation. Dependencies with known vulnerabilities (`npm audit`) must be updated or replaced before deployment. `package-lock.json` must be committed to ensure reproducible builds.
> Local npm has `omit=dev` globally — always use `--include=dev` flag for `npm install / ci` when dev dependencies are needed.

## 7. Incident response

On a suspected security incident (unauthorised access, data breach, credential compromise):

1. **Contain.** Revoke the compromised session or credential immediately. For a compromised freelancer PIN, reset it from the Crew page Mobile Access dialog. For a compromised staff account, change the password and rotate any exposed API keys.
2. **Assess.** What data was accessed? Check Supabase Auth logs for unusual login patterns. Check Vercel function logs for unexpected API calls. Check `tbl_audit_log`, `tbl_notifications`, and `tbl_wo_time_entries` for unauthorised operations.
3. **Notify.** Inform the system administrator and company directors within 24 hours if Tier 1 data may have been exposed.
4. **Remediate.** Fix the vulnerability. Deploy the fix. Verify it works.
5. **Document.** Record the incident in writing: what happened, what data was affected, what was done, what policy changes are needed.

> **POLICY SP-017 — Key rotation**
> On suspected credential compromise:
> - Supabase service role key → regenerate in Supabase dashboard and update in Vercel.
> - Anthropic API key → regenerate in Anthropic console and update in Vercel.
> - Microsoft client secret → regenerate in Azure portal and update in Vercel.
> - Freelancer or staff passwords/PINs → force reset via admin reset if a database export is suspected compromised.

## 8. Pre-deployment compliance checklist

Before any production deployment involving auth, RLS, or data exposure changes:

- [ ] Proxy not bypassed: visit a protected page in an incognito window — must redirect to login.
- [ ] API routes reject unauthenticated requests: call any `/api/` endpoint without an `Authorization` header — must return 401.
- [ ] Freelancer role isolation: log in as a freelancer and attempt to navigate to `/jobs` — must redirect to `/m`.
- [ ] RLS verification: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'tbl_%'` — all rows show `true`.
- [ ] Commercial data blocked: using a freelancer session, query `tbl_quotes` — must return zero rows.
- [ ] No credentials in URLs: check all calendar/ICS download links — must use signed tokens.
- [ ] No plaintext credentials in database: confirm `tbl_freelancers` does not contain a `pin` column or any PIN/password field.
- [ ] Environment variables secure: `.env.local` in `.gitignore`, no secrets in committed code.
- [ ] Role reads in any new code use `app_metadata.role` only (no `user_metadata.role` fallback).

## Appendix A — Policy register

| ID | Title | Section |
|---|---|---|
| SP-001 | Security policy review | 1 |
| SP-002 | Credential standards | 2.2 |
| SP-003 | Credential transmission | 2.2 |
| SP-004 | Session handling | 2.3 |
| SP-005 | Defence in depth is mandatory | 3.1 |
| SP-006 | RLS requirements | 3.2 |
| SP-007 | Realtime security | 3.3 |
| SP-008 | API authentication requirement | 4 |
| SP-009 | API key protection | 4 |
| SP-010 | Input validation | 4 |
| SP-011 | Data classification | 5 |
| SP-012 | Backups and export | 5 |
| SP-013 | Logging and monitoring | 5 |
| SP-014 | Secure development checklist | 6 |
| SP-015 | Environment separation | 6 |
| SP-016 | Dependency management | 6 |
| SP-017 | Key rotation | 7 |

## Appendix B — Document control

| Field | Value |
|---|---|
| Version | 2.2 |
| Date | 20 May 2026 |
| Author | Mateusz Garwacki |
| Approved by | [Pending approval] |
| Next review date | 20 November 2026 |
| Classification | CONFIDENTIAL — Internal Use Only |
| Supersedes | v2.1 (May 2026), v2.0 (April 2026), v1.0 (March 2026) |

## Appendix C — Changes from v2.1 → v2.2

- **SP-006 enforcement now CI-checked.** Pre-S46, the policy claim "All views are SECURITY INVOKER" was aspirational — 15 views in `public` were still inheriting the SECURITY DEFINER default, bypassing RLS on financial data. S46 migrated them all and added `scripts/db-checks.sql` + `.github/workflows/db-checks.yml` to enforce the rule on every push.
- **SP-006 — REVOKE-FROM-PUBLIC pattern documented.** Postgres footgun captured: revoking EXECUTE from `anon` is a no-op while `PUBLIC` retains EXECUTE. The S46 hardening of SECURITY DEFINER functions required revoking from PUBLIC first, then granting back to `authenticated` for app-callable RPCs.
- **SP-013 — silent UPDATE/DELETE trap documented.** PostgREST returns no error when RLS blocks an UPDATE or DELETE; the row count drops to 0 and `error` stays null. S46g (quick-timer log) and S46h (WO status flip, freelancer schedule INSERT/DELETE) were three manifestations. Hardening `auditedUpdate` to surface zero-row-no-error and migrating remaining raw `.update()` call sites is on the cleanup backlog.
- **New table boilerplate mandatory** — explicit GRANTs + ENABLE RLS + per-action policies. Pattern documented in `05_conventions.md` §20.1. Required ahead of Supabase's October 30, 2026 enforcement of default-deny for new tables in existing projects.
- **search_path pinning required** on all new functions (search_path injection mitigation). S46 pinned 9 previously-mutable functions.

## Appendix D — Changes from v2.0 → v2.1

- **SP-002 rewritten** to match operational reality. Freelancer auth is now formally a 6-digit numeric PIN (was: aspirationally ≥ 8 char password, never matched what was deployed). Tradeoffs and mitigations enumerated.
- **SP-006 / SP-008** strengthened: role reads must use `app_metadata.role` only; `user_metadata.role` is user-editable and was the source of a privilege-escalation foothold patched out of `freelancer-sync` in S41.
- **SP-011** Tier 2 explicitly includes `close_note` (added to `tbl_production_plan` in S41).
- **SP-014** new checklist item 9 — denormalisation requires maintaining trigger + watcher view, or it must not exist (S41 `tbl_quotes.quote_value` case).
- **§8 checklist** new bullet — role reads from `app_metadata` only.

## Appendix E — Changes from v1.0 → v2.0 (preserved for context)

- **SP-002:** removed PIN authentication for freelancers; all roles now use Supabase Auth passwords. `tbl_freelancers.pin` column dropped. (v2.0 framing — superseded by v2.1 acknowledgement that PIN auth is the actual mechanism, just stored only in Supabase Auth.)
- **SP-004:** `src/middleware.ts` renamed to `src/proxy.ts` (Next.js 16 convention, S33).
- **SP-005 / SP-008:** "middleware layer" renamed to "proxy layer" throughout.
- **SP-006:** consolidated RLS pattern documented (1 policy per action, `get_my_role()` CASE) — aligns with the refactor in S23.
- **SP-013:** application audit log implemented — `tbl_audit_log` + `AUDITED_TABLES` registry + `auditedUpdate/Insert/Delete` helpers.
- Added **admin** role (above PM). Policies updated to say "admin/PM" where previously "PM only".
