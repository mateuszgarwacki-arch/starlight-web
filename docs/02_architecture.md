# Starlight Production System — Technical Architecture

**Last updated:** 6 May 2026 (S41)

## 1. Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.7 (App Router) |
| UI | React 18 + Tailwind CSS + shadcn/ui patterns |
| Database | Supabase (PostgreSQL) — see `03_database_schema.md` for counts |
| Auth | Supabase Auth (JWT via httpOnly cookies) |
| Hosting | Vercel (hobby tier) |
| File storage | OneDrive / SharePoint via Microsoft Graph API (client-credentials flow) |
| AI | Anthropic Claude API — invoice extraction + cut-list extraction |
| Realtime | Supabase Realtime (Postgres change streams with RLS) |
| Toast | `sonner` |
| QR | `qrcode.react` (gen) + `html5-qrcode` (scan, dynamic import to avoid SSR) |
| 3D | Three.js (r128) with OrbitControls + RoomEnvironment |

## 2. Key locations

| Resource | URL / path |
|---|---|
| Production app | `workshop-five-gamma.vercel.app` |
| Git repo | `github.com/mateuszgarwacki-arch/starlight-web` |
| Supabase project ID | `qbdnoueqkmhznqzpkvos` |
| SharePoint storage | `starlightdesign.sharepoint.com` (Workshop folder) |
| Local dev path | `C:\Users\mateusz.garwacki\Downloads\starlight-web` |

## 3. Environment variables (Vercel)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser-safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — bypasses RLS. Used only in `/api/auth/freelancer-sync` and `/api/calendar/[freelancerId]` |
| `ANTHROPIC_API_KEY` | Server-only — Claude API for extraction routes |
| `MICROSOFT_TENANT_ID` | Azure AD tenant |
| `MICROSOFT_CLIENT_ID` | Azure AD app |
| `MICROSOFT_CLIENT_SECRET` | Server-only — Graph API |
| `MICROSOFT_DRIVE_ID` | SharePoint document library drive ID |

**Rule:** add env vars interactively via `vercel env add` — piped `echo` adds trailing newlines that silently corrupt drive IDs and secrets.

## 4. Authentication model

| Role | Login method | Scope |
|---|---|---|
| **admin** | Email + password (12+ chars) | Everything, plus user management, audit log, time-entry archive |
| **production_manager** | Email + password (12+ chars) | Full desktop + mobile, all tables, all API endpoints |
| **foreman** | Email + password (12+ chars) | Workshop execution, WOs, time entries, documents. No quotes, invoices, costs, or rate cards |
| **freelancer** | Phone number + 6-digit PIN | Mobile only (`/m/*`): own tasks, own time entries, own schedule |

**Role hierarchy:** `admin > production_manager > foreman > freelancer`.

**Role is set in two places on Supabase Auth user:**
- `app_metadata.role` — read by `get_my_role()` SQL helper. This is the authoritative source. Users cannot edit this client-side.
- `user_metadata.role` — mirrored for convenience. **Do not trust for security decisions.** SP-006 requires reads from `app_metadata` only; the `freelancer-sync` API was patched in S41 to drop a fallback to `user_metadata` that constituted a privilege-escalation foothold.

New users: set role in **both** `app_metadata` AND `user_metadata`. Admin role required in both.

**Freelancer auth specifics (S41):**
- 6-digit numeric PIN, set by a PM through the Mobile Access dialog on `/crew`.
- Stored only as a bcrypt hash in Supabase Auth; no plaintext PIN column on `tbl_freelancers` (the legacy column was dropped pre-S41 and any reference to it has been removed).
- Existing 4-digit PINs still work (they're already hashed in Supabase Auth); only newly-set PINs are required to be 6 digits.
- Login: `/m/login` accepts phone + PIN, internally converted to `phone@starlight.local` + PIN for Supabase Auth.

## 5. Three-layer security (defence in depth)

Every data path must be protected by at least two independent checks. See `04_security_policy.md` SP-005.

### Layer 1 — Proxy (session + route gating)

`src/proxy.ts` runs on every request (Next.js 16 convention; renamed from `middleware.ts` in S33). Runtime is Node.js, not Edge — not configurable on Next 16.

- Validates the Supabase session cookie
- Unauthenticated requests to protected routes → redirect to `/login` (desktop) or `/m/login` (mobile)
- Freelancer-role sessions are restricted to `/m/*` routes
- API routes are excluded from the proxy and handle their own auth

### Layer 2 — API route auth

Every `/api/*` route validates independently, regardless of what the proxy did. Standard pattern:

1. Extract the `Authorization` header from the request
2. Create a Supabase client with the anon key + the auth header
3. `supabase.auth.getUser()` to validate server-side
4. Check `user.app_metadata.role` against required role (NOT `user_metadata.role`)
5. Return 401 (no session) or 403 (wrong role) before any processing

### Layer 3 — Row Level Security (RLS)

All `tbl_%` tables have RLS enabled. Even if an attacker holds a valid JWT, the database itself restricts what can be read or written.

**Consolidated policy pattern** (standard since S23):
- 1 policy per (table, action) — one each for SELECT / INSERT / UPDATE / DELETE
- `TO authenticated`
- Uses `get_my_role()` CASE expression
- New tables inherit the `rls_auto_enable()` trigger

**Helpers:**
- `get_my_role()` — reads `app_metadata.role` from the JWT; defaults to `'freelancer'`
- `get_my_freelancer_id()` — reads `freelancer_id` from JWT; defaults to 0

All views are `SECURITY INVOKER` (they run under the caller's role, so RLS applies). Cross-user freelancer reads use SECURITY DEFINER RPCs (e.g. `rpc_active_workers`) where legitimately needed.

## 6. Route map (current)

### Desktop (Zones 1–3)

| Route | Purpose |
|---|---|
| `/` | Admin home / dashboard |
| `/jobs` | Active jobs list (filters Complete by default; toggle to show) |
| `/jobs/[id]` | Job detail: quote, lines, scope creation. Complete Job button (Active) or Close Report + Reopen (Complete) |
| `/jobs/[id]/scope/[scopeId]` | Unified scope page (WOs, BOM, drawings, docs) |
| `/pm/jobs/[id]` | PM 100m view (`rpc_pm_job_overview`) |
| `/workshop` | All active WOs across jobs (foreman view) — Complete jobs filtered by RPC |
| `/review` | Flag review, time corrections, cost reconciliation |
| `/review/inbox` | Task review with Route-task-modal (routes to active OR Complete WOs as of S41) |
| `/capacity` | Manpower demand, crew scheduling, gap analysis — Complete jobs filtered by RPC |
| `/crew` | Freelancer roster, booking, individual detail pages, Mobile Access (PIN) dialog |
| `/materials` | Materials catalogue management |
| `/settings` | Users, rate card, business defaults, audit log |
| `/traveller?scopeId=X&mode=single&woId=Y` | Printable traveller PDF with QR |
| `/reports/handover/[jobId]` | Print view + `/edit` authoring route |
| `/reports/job-financial/[jobId]` | Live financial report |
| `/reports/job-close/[jobId]` | Close report — full job summary, live data, available for any job |
| `/reports/load-list/[jobId]` | Load list |

### Mobile (Zone 4)

| Route | Purpose |
|---|---|
| `/m` | Task list with filters (My / On / Done / All). Filters Complete jobs as of S41 |
| `/m/wo/[woId]` | WO detail: start/join/log/complete, BOM, docs |
| `/m/me` | Me tab: my hours, log sheet, notes |
| `/m/task` | General/maintenance task logging (not job-linked) |
| `/m/login` | Phone + 6-digit PIN |
| `/m/schedule` | Personal schedule |
| `/m/photos` | Site photo upload |
| `/m/request` | Workshop request creation |
| `/m/maintenance` | Maintenance task list |

`/wo` legacy route redirects to scope page. Unified scope page absorbs what used to be `WorkOrdersPanel` + `ScopeBom`.

## 7. Realtime subscriptions

Four tables publish to Supabase Realtime:
- `tbl_work_orders`
- `tbl_wo_time_entries`
- `tbl_freelancer_schedule`
- `tbl_notifications`

**Requirement:** all must have `REPLICA IDENTITY FULL` set. Without this, RLS cannot filter change events correctly — PostgreSQL only sends PK columns in the WAL, and policies that reference other columns will fail to filter. See SP-007.

## 8. External integrations

### OneDrive / Microsoft Graph

- **Flow:** client credentials (not delegated). Requires `Sites.ReadWrite.All` application permission + admin consent.
- **Admin consent is separate** — adding the permission in Azure portal isn't enough. Must click "Grant admin consent" explicitly. Decode the JWT to verify: the `roles` array should list the permissions.
- **Use Drive ID, not Site ID:** file operations go to `drives/{driveId}`, not `sites/{siteId}/drive`.
- **Folder structure:** `Workshop/{jobNumber} - {jobName}/{docType}/` — sanitise names, no special chars.
- **Large uploads:** browser → `/api/onedrive/upload-session` → direct to OneDrive in chunks. Bypasses the Vercel 4.5 MB function body cap. Any SketchUp/DWG file over 3.5 MB uses this path automatically.
- **Buffer typing:** use `new Uint8Array(arrayBuffer)` for fetch body; `Buffer` type fails TypeScript.

### Claude API (Anthropic)

Two server-only routes:
- `/api/extract-invoice` — supplier invoice PDFs/images → structured line items
- `/api/extract-cutlist` — SketchUp cut-list exports → material summary + parts list

Both require authenticated PM/foreman session. Both send the materials catalogue + Starlight workshop naming conventions as prompt context (e.g. `2x1` = 2x1 PAR Softwood 44×19mm; `MDF18` = 18mm MDF). This dramatically improves matching accuracy.

Cut-list extraction outputs two layers:
- **Materials to Order** (actionable summary: sheets, lengths needed) → written to BOM
- **Individual Parts** (expandable reference list) → stored as part of the cut list, not in BOM

## 9. Key API routes

| Route | Access | Purpose |
|---|---|---|
| `/api/auth/manage-user` | Admin | Create/update PM/foreman/admin accounts |
| `/api/auth/freelancer-sync` | PM+ | Create/update Supabase Auth users for freelancers. Accepts `password` (preferred) or `pin` (deprecated, back-compat). Reads role from `app_metadata` only as of S41 |
| `/api/extract-invoice` | PM+ / foreman | Claude-powered invoice extraction |
| `/api/extract-cutlist` | PM+ / foreman | Claude-powered cut-list extraction |
| `/api/onedrive/upload-session` | Any authed | Chunked OneDrive upload |
| `/api/onedrive/download` | Any authed | Signed download URL |
| `/api/calendar/token` | Any authed | HMAC-SHA256 signed ICS token (72h expiry) |
| `/api/calendar/[freelancerId]` | Token-validated | ICS calendar feed |

## 10. External system connections (legacy, now dormant)

The Access-era design specified:
- Stock database: linked table from a separate Access stock DB
- Quote/accounts database: linked table from an Access accounts DB
- PM/accounts connection: Job Number as universal key

These are **not active** in the current web system. Quote lines are manually entered or imported via CSV. If/when the accounts system is migrated, the `job_number` field remains the intended join key.

## 11. What the system does NOT do

- Native mobile app — PWA (mobile browser) covers this
- Custom API server — Supabase client library talks directly to the database
- Offline workshop operation — WiFi required (see risks below)

## 12. Known architectural risks

| Risk | Mitigation |
|---|---|
| Freelancer WiFi drops in workshop | PWA service worker caches task list; writes queue locally. Ultimate mitigation: reliable workshop WiFi. |
| Supabase latency vs local Access | TanStack Query caches aggressively; optimistic updates make writes feel instant. London region keeps latency <50ms. |
| Photo storage cost creep | Compress on upload; retention policy to be defined before it becomes expensive. |
| Supabase free/hobby tier limits | **Upgrade to Pro before inviting multiple PMs** — enables daily backups + PITR. Flagged as critical in TRACKER cleanup backlog. |
