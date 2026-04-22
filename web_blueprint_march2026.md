# [ARCHIVED] Starlight Production System — Original Web Architecture Blueprint (March 2026)

> **⚠️ HISTORICAL DOCUMENT — DO NOT USE FOR CURRENT SYSTEM FACTS**
>
> This document was the **planning blueprint** for the web application, written before the build started. The build diverged from this plan in many important ways — notably:
>
> - Table count grew from 21 → 48
> - `middleware.ts` was renamed to `src/proxy.ts` (Next.js 16 convention, Session 33)
> - Freelancer PIN auth was replaced with phone+password
> - An `admin` role was added above `production_manager`
> - The scope page unified what this doc shows as separate `/jobs/[id]/scope/[scopeId]` and `/jobs/[id]/scope/[scopeId]/wo` routes
>
> It is preserved for archaeological reference — "what we originally intended to build" — not as a description of the current system.
>
> The Security Addendum (March 23, 2026) that previously superseded Section 3 of this document has been fully folded into `04_security_policy.md` and is no longer needed separately.
>
> **Superseded by:** `02_architecture.md`, `04_security_policy.md`
> **Archived on:** 22 April 2026

---

**STARLIGHT**

PRODUCTION SYSTEM

Web Application Architecture Plan

Version 1.0 \| March 2026

*Confidential Internal Document*

1\. Executive Summary

This document defines the architecture for replacing the existing
Microsoft Access front-end with a modern web application while retaining
Supabase (PostgreSQL) as the shared backend. The Access database remains
available during transition but all new feature development targets the
web application.

**What we are building:**

-   A single web application serving all four operational zones
    (Architect, Commander, Auditor, Workshop)

-   Role-based access: Production Manager sees Zones 1-3 on desktop,
    Freelancers see Zone 4 on mobile

-   Responsive design: desktop-first for planning, mobile-first for
    workshop

-   Real-time updates via Supabase subscriptions (no manual refresh)

-   Photo capture direct from mobile browser

-   QR code scanning for Work Order access on workshop floor

**What we are NOT building:**

-   A native mobile app (progressive web app covers this)

-   A new database (Supabase with all 21 tables and 21+ views already
    exists)

-   A custom API server (Supabase client library talks directly to the
    database)

2\. Technology Stack

2.1 Recommended Stack

  -------------- ------------------------- ----------------------------------
  **Layer**      **Technology**            **Why**

  Framework      Next.js 14+ (App Router)  Server-side rendering, file-based
                                           routing, API routes if needed,
                                           excellent Vercel deployment

  UI Library     React 18+                 Component model maps perfectly to
                                           your form/subform patterns

  Styling        Tailwind CSS              Utility-first, rapid prototyping,
                                           responsive built-in, matches your
                                           colour system exactly

  Component Kit  shadcn/ui                 Accessible, customisable,
                                           professional. Tables, dialogs,
                                           dropdowns, tabs out of the box

  Database       Supabase JS               Direct browser-to-database. Auth,
  Client         (@supabase/supabase-js)   realtime subscriptions, storage,
                                           row-level security

  State          React Query (TanStack     Caching, background refetch,
  Management     Query)                    optimistic updates. Perfect for
                                           ODBC-like live data feel

  Forms          React Hook Form + Zod     Validation, type safety,
                                           performance on complex forms like
                                           Scope Breakdown

  Hosting        Vercel or Self-hosted     Vercel for zero-config deployment,
                                           or Docker on your own server for
                                           WiFi-only access

  QR Codes       qrcode.react              Traveller print generates QR,
                 (generation) +            mobile camera scans it
                 html5-qrcode (scanning)   

  PDF/Print      React-PDF or browser      Traveller reports with QR codes
                 print CSS                 
  -------------- ------------------------- ----------------------------------

2.2 Why NOT These Alternatives

  ---------------------- ------------------------------------------------
  **Rejected Option**    **Reason**

  PHP (original Zone 4   No component model, no reactivity, poor
  plan)                  developer experience for complex forms. Was
                         proposed when only Zone 4 was web.

  Vue.js / Svelte        Both excellent, but React has the largest
                         ecosystem for the specific libraries needed
                         (Supabase SDK, shadcn/ui, TanStack Query). More
                         hire-able if you ever need outside help.

  Electron (desktop app) Adds native packaging complexity for zero
                         benefit. Browser does everything needed. Access
                         already covers desktop.

  Low-code (Retool,      Fast for CRUD but hit walls on custom UX like
  Appsmith)              the prompt engine, cascading phase ordering, and
                         traveller print layout. You would outgrow it
                         within months.
  ---------------------- ------------------------------------------------

2.3 Deployment Options

Two viable paths depending on your WiFi-only security requirement:

  ------------- ----------------- --------------------- --------------------
  **Option**    **How**           **Pros**              **Cons**

  Vercel        Deploy to Vercel, Zero maintenance,     Requires internet
  (cloud)       access via URL    automatic HTTPS,      access (not
                from any device   global CDN, instant   WiFi-only). Supabase
                                  deploys               is already
                                                        cloud-hosted, so
                                                        this is consistent.

  Self-hosted   Docker container  WiFi-only access      You manage updates,
  (Docker)      on your internal  enforced at network   SSL certs, uptime.
                server, Nginx     level, full control   More ops work.
                reverse proxy                           
  ------------- ----------------- --------------------- --------------------

Recommendation: Start with Vercel for development speed. Lock down via
Supabase Row Level Security rather than network restriction. If
directors require WiFi-only, add Docker deployment later. The app code
is identical either way.

3\. Authentication & Authorisation

3.1 Auth Model

Supabase Auth handles all authentication. Three user roles map to the
four zones:

  -------------------- ----------- ---------------------- -----------------------------
  **Role**             **Zones**   **Login Method**       **Access**

  production_manager   1, 2, 3, 4  Email + password       Full system access. Quote
                                                          interpretation, scope
                                                          breakdown, WO creation, BOM
                                                          management, time entry
                                                          review, cost visibility,
                                                          manpower planning.

  foreman              2, 3, 4     Email + password       Workshop execution. Active
                                                          WOs across all jobs,
                                                          traveller print, exception
                                                          handling. No quote values, no
                                                          client commercial data.

  freelancer           4 only      PIN code (from         Task list, clock in/out,
                                   tbl_freelancers.pin)   completion photos, flag
                                                          notes. Phone browser. Under
                                                          30 seconds per interaction.
  -------------------- ----------- ---------------------- -----------------------------

3.2 Row Level Security (RLS)

Supabase RLS policies enforce access at the database level. Even if
someone bypasses the UI, the database rejects unauthorised queries.

-   Freelancers: SELECT on tbl_work_orders (status IN Ready,
    In-Progress), INSERT/UPDATE on tbl_wo_time_entries (own
    freelancer_id only), INSERT on tbl_job_attachments (completion
    photos)

-   Foremen: SELECT on all execution tables, UPDATE on
    tbl_work_orders.status, no access to tbl_quotes,
    tbl_quote_lines.line_value, or cost views

-   Production Managers: Full access to all tables and views

3.3 Freelancer PIN Flow

The tbl_freelancers table already has a pin column. The login flow:

-   Freelancer opens the app URL (or scans QR on traveller)

-   Enters their phone number and 4-6 digit PIN

-   Supabase custom auth function validates against tbl_freelancers

-   Returns a JWT with freelancer_id and role=freelancer

-   Session persists on device (no re-login every visit)

4\. Page Architecture

The application uses a sidebar navigation layout for desktop (Zones 1-3)
and a bottom tab bar for mobile (Zone 4). Every Access form maps to a
web page or page section.

4.1 Route Map

  ----------------------------------- ------------------------ ---------- -------------------------
  **Route**                           **Access Equivalent**    **Zone**   **Purpose**

  /                                   frm_Main_Dashboard       1          Dashboard with
                                                                          procurement actions,
                                                                          flags, modified scope,
                                                                          job cards

  /jobs                               frm_Jobs +               1          Active jobs list with
                                      subfrm_Job_List                     status overview

  /jobs/[id]                        frm_Quote_Lines          1          Job detail: quotes, quote
                                                                          lines, amber
                                                                          highlighting, scope
                                                                          creation

  /jobs/[id]/scope/[scopeId]      frm_Scope_Breakdown      1          Scope item detail: prompt
                                                                          engine, job items grid,
                                                                          WO creation

  /jobs/[id]/scope/[scopeId]/wo   frm_Work_Orders          1          Work orders for scope
                                                                          item: phase-ordered, BOM
                                                                          management

  /workshop                           Zone 2 (not yet built in 2          All active WOs across all
                                      Access)                             jobs, phase-ordered,
                                                                          traveller print

  /workshop/[woId]                  Traveller detail view    2          Single WO detail with
                                                                          BOM, linked items, print
                                                                          button

  /review                             Zone 3 (not yet built in 3          Exception handling:
                                      Access)                             flags, time corrections,
                                                                          scope changes

  /review/time-entries                frm_Time_Entries         3          Time entry review,
                                                                          corrections, flag notes

  /review/costs                       qry_Job_Cost_Summary     3          Cost visibility: estimate
                                                                          vs actual, margin
                                                                          analysis

  /capacity                           frm_Manpower_Dashboard   1          Manpower demand, crew
                                                                          scheduling, gap analysis

  /materials                          frm_Materials            1          Materials catalogue
                                                                          management

  /crew                               frm_Crew_Booking         1          Freelancer roster and
                                                                          scheduling

  /m                                  Zone 4 mobile root       4          Freelancer task list (MY
                                                                          TASKS / ALL TASKS toggle)

  /m/wo/[woId]                      Zone 4 WO detail         4          Clock in, log hours, mark
                                                                          complete, take photo

  /m/photos                           Site Photo Mode          4          Workshop Complete items
                                                                          awaiting site photos
  ----------------------------------- ------------------------ ---------- -------------------------

4.2 Desktop Layout

Persistent sidebar navigation replaces Access's subfrm_Global_Nav
header hack. The sidebar contains:

-   Starlight logo / company name

-   Navigation links grouped by zone (Dashboard, Jobs, Workshop, Review,
    Capacity, Materials, Crew)

-   Active job count badge on Jobs link

-   Unread flags count badge on Review link

-   User name and role at the bottom

-   Collapse to icons on narrow screens

The main content area fills the remaining width. No more 30,000-twip
flush tricks.

4.3 Mobile Layout (Zone 4)

Bottom tab bar with three tabs: Tasks, Photos, Me. The Tasks tab is the
default view showing all assigned/available work orders as cards.
Tapping a card opens the work order detail with the clock-in/out flow.
The entire mobile interaction target is under 30 seconds per task
completion.

5\. Form-to-Component Mapping

Each Access form becomes a React page composed of reusable components.
The Access subform pattern (master/detail with LinkMasterFields) becomes
React props and state.

5.1 Shared Components

  -------------------- ---------------------------------------- -------------------------------
  **Component**        **Replaces**                             **Description**

  \<StatusBadge\>      Conditional formatting                   Colour-coded pill for any
                                                                status field. Maps your colour
                                                                system: Not-Started=white,
                                                                Ready=white, In-Progress=blue,
                                                                Complete=green, On-Hold=amber,
                                                                Voided=grey

  \<PhasePill\>        Phase number display                     Coloured pill per phase: Phase
                                                                1=#3498DB, Phase 2=#9B59B6,
                                                                etc.

  \<LookupCombo\>      Combo boxes bound to tbl_Master_Lookups  Reusable dropdown fetching from
                                                                master lookups by category.
                                                                Replaces every combo box in the
                                                                system.

  \<DaysRemaining\>    =DateDiff('d',Date(),[event_date])   Traffic light indicator: green
                                                                \>14, amber 8-14, red \<=7

  \<MaterialSearch\>   material_id combo on subfrm_WO_BOM       Searchable dropdown with
                                                                auto-fill of unit, cost,
                                                                description from catalogue

  \<StockSearch\>      stock_reference combo on                 Search against
                       subfrm_Job_Items                         tbl_dummy_stock_items (later:
                                                                real stock DB)

  \<DataTable\>        Continuous subforms                      Sortable, filterable table with
                                                                inline editing. Replaces
                                                                subfrm_Quote_Lines,
                                                                subfrm_WO_List,
                                                                subfrm_Job_Items, etc.

  \<AmberHighlight\>   Conditional row formatting on Quote      Row highlight when category IN
                       Lines                                    (Workshop Build,
                                                                Stock-and-Hire, Provisional)
                                                                AND interpretation_complete =
                                                                false

  \<CostCard\>         Dashboard stats                          Read-only card showing label,
                                                                value, and optional variance
                                                                indicator
  -------------------- ---------------------------------------- -------------------------------

5.2 Form 1: Jobs & Quote Lines (/jobs/[id])

  ------------------------- ----------------------- ----------------------------
  **Access Element**        **Web Component**       **Notes**

  subfrm_Job_List           \<JobSidebar\>          Left panel listing active
                                                    jobs, click to select

  Job header fields         \<JobHeader\>           Read-only after import: job
                                                    number, client, event date,
                                                    location

  subfrm_Quote_Lines        \<QuoteLineTable\>      DataTable with amber
                                                    highlighting, inline
                                                    category dropdown, PM note
                                                    field

  [+ Add Scope] button    \<CreateScopeDialog\>   Modal dialog, not a separate
                                                    form. Creates scope item and
                                                    navigates to scope detail
                                                    page.

  Quote version tabs        \<Tabs\> from shadcn    One tab per quote document.
                                                    Version comparison
                                                    indicators on tab labels.

  interpretation_complete   Inline toggle in table  Click toggles boolean, amber
  checkbox                  row                     clears instantly via
                                                    optimistic update
  ------------------------- ----------------------- ----------------------------

5.3 Form 2: Scope Breakdown (/jobs/[id]/scope/[scopeId])

  ---------------------- --------------------------- -----------------------------------
  **Access Element**     **Web Component**           **Notes**

  Scope Item header      \<ScopeHeader\>             Editable: name, category,
  fields                                             complexity, finish, status, event
                                                     zone

  subfrm_Prompts (prompt \<PromptPanel\>             Slide-in panel triggered by
  engine)                                            category selection. Checklist of
                                                     typical components with [+ Add]
                                                     buttons. Nothing auto-created.

  subfrm_Job_Items       \<JobItemsTable\>           DataTable with stock search, item
                                                     type dropdown, quantity, unit,
                                                     finish_required. Checkbox column
                                                     for WO creation.

  [Create WO from       \<CreateWODialog\>          Dialog with activity verb
  Selected]                                         selection. Creates WO + junction
                                                     records for checked items.

  Coverage indicator     has_wo column from          Green checkmark icon in table row
                         qry_jobitems_withcoverage   if job item linked to at least one
                                                     WO

  [Work Orders \>\>]   Tab or link                 Navigate to
  button                                             /jobs/[id]/scope/[scopeId]/wo

  Quote line context     \<QuoteContext\> card       Read-only card at top showing the
  (line_text,                                        originating quote line for
  line_value)                                        reference
  ---------------------- --------------------------- -----------------------------------

5.4 Form 3: Work Orders (/jobs/[id]/scope/[scopeId]/wo)

  ---------------------- -------------------- ----------------------------
  **Access Element**     **Web Component**    **Notes**

  Context bar (scope     \<WOHeader\>         Fixed at top. Scope item
  item, job, days                             name, job name, event date,
  remaining)                                  days remaining indicator.

  subfrm_WO_List         \<WOTable\>          Phase-ordered table. Status
                                              colour coding via
                                              StatusBadge. Click row to
                                              expand BOM inline (replaces
                                              subform cascading refresh).

  subfrm_WO_BOM          \<BOMSection\>       Inline beneath selected WO
                         (expandable)         row. Material search,
                                              quantity, unit, cost.
                                              Add/edit/delete. Replaces
                                              separate bottom-half
                                              subform.

  [Release as Ready]   Button in WO row     Updates status, requeries
  button                 actions              list. Optimistic UI update.

  Traveller print        \<PrintTraveller\>   Generates PDF with QR code,
                                              BOM, cut list, photos. Opens
                                              browser print dialog or
                                              downloads PDF.

  txtSelectedWO hidden   React useState       Selected WO ID in component
  field                                       state. No invisible text
                                              boxes needed.
  ---------------------- -------------------- ----------------------------

5.5 Zone 4: Freelancer Mobile (/m)

  ---------------------- -------------------- ----------------------------
  **Spec Element**       **Web Component**    **Notes**

  Task list (MY TASKS /  \<TaskList\> with    Card-based list. Each card:
  ALL TASKS)             toggle               activity verb, description,
                                              scope item, estimated hours,
                                              current worker(s). Real-time
                                              updates via Supabase
                                              subscription.

  START button           \<StartButton\>      Creates time entry, sets WO
                                              to In-Progress. Single tap.

  JOIN button            \<JoinButton\>       Creates additional time
                                              entry on already In-Progress
                                              WO.

  LOG MY HOURS           \<LogHoursSheet\>    Bottom sheet: actual hours
                                              (pre-filled from
                                              timestamps), optional flag
                                              note, confirm. Under 15
                                              seconds.

  MARK COMPLETE          \<CompleteSheet\>    Enabled only when all time
                                              entries closed. Camera opens
                                              for completion photo. One
                                              tap.

  QR scanner             \<QRScanner\>        Camera-based QR reader.
                                              Scans traveller QR,
                                              navigates to /m/wo/[woId].
                                              Uses html5-qrcode library.

  Site Photo Mode        \<PhotoChecklist\>   List of Workshop Complete
                                              scope items with camera
                                              button per item.
  ---------------------- -------------------- ----------------------------

6\. Supabase Integration Patterns

6.1 Data Access

Every data operation goes through the Supabase JS client. No custom API
server. The client library handles authentication headers, real-time
subscriptions, and file uploads automatically.

**Read patterns:**

-   Simple table reads:
    supabase.from('tbl_work_orders').select('\*').eq('job_id',
    jobId)

-   View reads (pre-joined):
    supabase.from('qry_scope_context').select('\*')

-   Filtered lists:
    supabase.from('tbl_quote_lines').select('\*').eq('job_id',
    jobId).order('import_sequence')

**Write patterns:**

-   Insert: supabase.from('tbl_wo_time_entries').insert({
    work_order_id, freelancer_id, \... })

-   Update: supabase.from('tbl_work_orders').update({ status:
    'Ready' }).eq('work_order_id', woId)

-   Upsert: supabase.from('tbl_materials').upsert(materialData)

6.2 Real-time Subscriptions

Supabase Realtime pushes database changes to connected clients
instantly. Key use cases:

-   Dashboard: Subscribe to tbl_work_orders changes. When a freelancer
    marks a WO complete, the PM's dashboard updates live without
    refresh.

-   Workshop task list: Subscribe to tbl_wo_time_entries. When someone
    starts a task, other freelancers see 'John Smith working' appear
    instantly.

-   Procurement: Subscribe to tbl_wo_bom where needs_ordering = true.
    New material requirements appear live.

6.3 File Storage (Photos)

Supabase Storage replaces the internal server file path approach. Photos
upload directly from the mobile browser to a Supabase storage bucket.

-   Bucket: 'starlight-photos' with folders per job:
    /CH-2026/scope-items/, /CH-2026/work-orders/

-   Upload: supabase.storage.from('starlight-photos').upload(path,
    file)

-   The file_path column in tbl_job_attachments stores the Supabase
    storage path

-   Photos served via signed URLs (time-limited, internal only)

6.4 Existing Views (Query Engine)

All 21+ Supabase views are already built and working. The web app reads
from them exactly like tables. No query logic needed in the frontend.

  ---------------------------- ----------------- ----------------------------
  **View**                     **Used By**       **Purpose**

  qry_dash_upcoming_jobs       Dashboard         Job cards with scope
                                                 progress and WO status
                                                 counts

  qry_wo_phase_ordered         Form 3, Workshop  Work orders sorted by build
                               view              phase

  qry_scope_context            Form 3 header     Scope item with parent job
                                                 context

  qry_scope_breakdown          Form 2            Scope items with quote line
                                                 and job context

  qry_manpower_demand          Capacity page     Hours by department and
                                                 status

  qry_procurement_needed       Dashboard,        BOM items needing ordering
                               Procurement       

  qry_job_cost_summary         Cost review       Full job cost rollup with
                                                 margin

  qry_scopeitem_cost_summary   Cost review       Scope item level cost
                                                 breakdown

  qry_wo_cost_summary          WO detail         Individual WO cost: labour +
                                                 material

  qry_estimate_vs_actual       Learning engine   Estimated vs actual hours
                                                 per completed WO

  qry_jobitems_withcoverage    Form 2            Job items with WO linkage
                                                 indicator

  qry_today_roster             Dashboard         Who's on site today and
                                                 what they're doing
  ---------------------------- ----------------- ----------------------------

7\. Build Phases

Each phase delivers a working increment. No phase depends on a later
phase. Access remains available throughout as fallback.

Phase 0: Foundation (1 session)

-   Next.js project setup with Tailwind, shadcn/ui, Supabase client

-   Authentication: login page, role-based routing, session management

-   Layout shell: sidebar navigation, responsive breakpoints, colour
    system

-   Supabase client wrapper with typed queries

Deliverable: Empty app shell you can log into with correct role-based
navigation.

Phase 1: Dashboard (1-2 sessions)

-   Job cards strip with traffic light indicators

-   Procurement actions panel (from qry_procurement_needed)

-   Freelancer flags panel

-   Modified scope panel

-   Quick stats bar (active jobs, open WOs, items to order, unread
    flags)

-   Today's roster (from qry_today_roster)

Deliverable: Directors can see live operational status. Immediate value.

Phase 2: Jobs & Quote Lines (2 sessions)

-   Jobs list page with active/completed filtering

-   Job detail page with quote tabs and quote lines table

-   Amber highlighting on uninterpreted workshop lines

-   Category dropdown per line, PM notes, interpretation toggle

-   Create Scope Item dialog from quote line

-   Quote import (from linked quote database or manual entry)

Deliverable: Form 1 equivalent. PM can manage quotes and create scope
items.

Phase 3: Scope Breakdown (2 sessions)

-   Scope item detail page with all header fields

-   Prompt engine panel (category selection drives component
    suggestions)

-   Job items table with stock search, inline editing

-   Checkbox selection and Create WO dialog

-   Coverage indicator per job item

-   Navigation to Work Orders

Deliverable: Form 2 equivalent. PM can break scope into items and create
WOs.

Phase 4: Work Orders & BOM (2 sessions)

-   Work orders page with phase ordering and status badges

-   Expandable rows with inline BOM management

-   Material catalogue search with auto-fill

-   Release as Ready button

-   Traveller PDF generation with QR code

Deliverable: Form 3 equivalent. Full planning workflow complete.

Phase 5: Freelancer Mobile (2 sessions)

-   PIN-based login

-   Task list with MY TASKS / ALL TASKS toggle

-   Start, Join, Log Hours, Mark Complete flows

-   Bottom sheet for hour logging (under 15 seconds)

-   Camera integration for completion photos

-   QR scanner for traveller codes

-   Real-time subscriptions (see who's working what)

Deliverable: Zone 4 complete. Freelancers can self-log from phones.

Phase 6: Cost Visibility & Review (1-2 sessions)

-   Job cost summary page (from qry_job_cost_summary)

-   Scope item cost drill-down (from qry_scopeitem_cost_summary)

-   Estimate vs actual analysis (from qry_estimate_vs_actual)

-   Time entry review and correction interface

-   Flag note review queue

Deliverable: Zone 3 complete. PM can review costs, correct errors,
handle exceptions.

Phase 7: Capacity & Materials (1 session)

-   Manpower demand page (from qry_manpower_demand)

-   Crew booking / scheduling

-   Gap analysis visualisation

-   Materials catalogue management

-   Cross-job conflict detection

Deliverable: Full system parity with Access, plus features Access never
had.

Phase 8: Polish & Handover (1 session)

-   Loading states, error handling, offline resilience

-   Print stylesheets for travellers

-   Keyboard shortcuts for power users

-   Documentation for future developers

-   Access decommission plan

8\. What Changes vs Access

  ---------------------- ------------------------ --------------------------
  **Access Pattern**     **Web Pattern**          **Why Better**

  Subform with           React component with     Explicit data flow, no
  LinkMasterFields       props                    invisible text boxes, no
                                                  cascading requery bugs

  VBA event injection    React event handlers     Code lives next to the UI
                                                  it controls. No Code
                                                  Builder.

  Conditional formatting Tailwind utility classes One line of CSS per
  (row colours)                                   status, applied
                                                  consistently everywhere

  Combo box with hidden  Searchable dropdown      Type-ahead search, clear
  bound column           component                display, no LimitToList
                                                  issues

  DoCmd.OpenForm with    Next.js                  URL-based navigation.
  WhereCondition         router.push('/path')   Bookmarkable. Browser back
                                                  button works.

  Manual Refresh/Requery Real-time Supabase       Data updates
                         subscription             automatically. No button
                                                  clicks.

  Form Header section    Persistent sidebar       Standard web pattern. No
  hacks                  layout                   30,000-twip flush.

  VBA error handling     Try/catch + toast        User-friendly error
                         notifications            messages. No cryptic
                                                  Access error dialogs.

  Access reports for     PDF generation with QR   Browser print or download.
  travellers             codes                    No printer driver issues.

  ODBC boolean as        Native PostgreSQL        true/false, not
  TEXT(5)                boolean                  'true'/'false'
                                                  strings. No more
                                                  conversion bugs.
  ---------------------- ------------------------ --------------------------

9\. What Stays The Same

-   All 21 database tables: identical structure, identical data

-   All 21+ Supabase views: the query engine is untouched

-   The four-zone model: Architect, Commander, Auditor, Workshop

-   The Golden Path workflow: Quote \> Scope \> Work Order \> Time Entry
    \> Cost

-   The colour system: navy, red, blue, green, amber, white

-   The design principles: soft signals only, no hard blocks, more
    friction = less done

-   The cost visibility stack: WO Cost \> Scope Item Cost \> Job Cost \>
    Margin

-   Phase ordering via activity verb lookup

-   The prompt engine logic (category drives suggestions, nothing
    auto-created)

-   Kit List export (same output format, triggered from web instead of
    VBA)

10\. Risks & Mitigations

  ------------------ -------------- -------------------------------------
  **Risk**           **Impact**     **Mitigation**

  Freelancers resist Time entries   Keep it under 30 seconds. QR code
  new mobile         don't get     scanning eliminates searching. Test
  interface          captured, cost with 2-3 freelancers before full
                     engine has no  rollout. Access time entry form stays
                     fuel           available as backup.

  ODBC-linked Access PM loses       Access stays operational throughout.
  forms break during planning       Web app is additive, not replacement,
  transition         ability        until PM confirms parity. Both
                                    read/write the same Supabase
                                    database.

  Supabase latency   Forms feel     TanStack Query caches aggressively.
  vs local Access    sluggish       Optimistic updates make writes feel
                     compared to    instant. Supabase is hosted in London
                     local database region for UK latency \<50ms.

  WiFi drops in      Freelancers    Progressive Web App with service
  workshop           can't clock   worker caches the task list. Queue
                     in/out         writes locally, sync when
                                    reconnected. Or: accept that WiFi
                                    must be reliable infrastructure.

  Photo storage      Monthly        Compress photos on upload (mobile
  costs scale        storage bill   browser can resize). Set retention
                     grows          policy. Supabase free tier includes
                                    1GB storage, Pro includes 100GB.

  Scope creep in web Web app takes  Strict phase discipline. Each phase
  build              months instead is 1-2 sessions. No gold-plating.
                     of weeks       Ship Form 1 equivalent before
                                    starting Form 2.
  ------------------ -------------- -------------------------------------

11\. Decisions Needed Before Phase 0

  -------------- ---------------------------- -------------------- -------------------
  **Decision**   **Options**                  **Recommendation**   **Impact if
                                                                   Deferred**

  Hosting model  Vercel (cloud) vs Docker     Vercel for now,      Blocks deployment.
                 (self-hosted)                self-host later if   Must decide before
                                              required             Phase 0.

  Domain name    starlight.internal,          Choose something     Blocks deployment.
                 app.starlightdesign.co.uk,   memorable for        Can use Vercel
                 etc.                         freelancers to type  default URL
                                              on phones            temporarily.

  Freelancer     PM creates accounts vs       PM creates accounts  Blocks Phase 5. Not
  onboarding     self-registration            (add PIN to          needed until then.
                                              tbl_freelancers)     

  Photo          Keep forever vs auto-delete  Keep 12 months,      Blocks Phase 5. Not
  retention      after X months               archive to cold      needed until then.
  policy                                      storage              

  Quote import   Keep Access linked table vs  CSV upload for now,  Blocks Phase 2.
  source         manual entry vs CSV upload   API integration      Must decide before
                                              later                then.
  -------------- ---------------------------- -------------------- -------------------

*This document is the architecture blueprint. When we start coding,
every component, every route, every data flow traces back to a decision
documented here.*
