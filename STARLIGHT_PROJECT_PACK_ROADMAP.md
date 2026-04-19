# Starlight Project Pack — Roadmap

**Status:** v1 shipped 18 April 2026 (Session 26). One-off xlsx for Grosvenor Hotel Wedding (job 13725) delivered to Fait Accompli PMs.

**Purpose of this doc:** capture what was built, why, and the parking lot of ideas for next iterations. Not a commitment — a memory aid for a future design session.

---

## 1. Goal

Give external PMs a **structured, editable, re-exportable snapshot** of our production data without forcing them into our system.

They already use spreadsheets. Their existing pack ("Project_Pack_WOTS_Mar_2026.xlsx") is a 14-sheet mess: `#REF!` errors from broken parent-file formulas, crew names typed 8 times across 5 sheets, no references connecting quote lines to scope to materials.

We have the data. They have the working pattern. The Project Pack bridges the two:

- **From our side:** deterministic, auditable export of the quote, scope, job items, materials
- **To their side:** editable spreadsheet in the format they already know, with our data pre-filled and cross-referenced
- **Across time:** re-exportable as the job evolves, without destroying their additions

**Non-goal for now:** live bidirectional sync. That's a different problem and they didn't ask for it. Snapshot + re-export is enough.

---

## 2. Current v1 structure (11 sheets)

### Auto-filled from Starlight system
Amber banner: *"Generated from Starlight Production System at [timestamp] — data columns overwritten on re-export. Use Notes column for notes."*

1. **Overview** — job header (number, client, date, location), sheet index with one-line description per tab, quick numbers (quote value, workshop est cost, workshop actual, line/scope/item counts)
2. **Quote Lines** — all quote lines (89 for Grosvenor), columns: Line# | Category | Zone | Description | Qty | Unit £ | Line £ | Est Cost | Actual £ | Margin £ | Margin % | Status | PM Note. Totals row at bottom. Zebra striping. Status from `qry_quoteline_margin.tracking_status` (Tracked / Not Tracked / No Scope / No Cost Data)
3. **Scope & Build** — grouped by Zone (section header) → Scope (sub-header with quote line ref, est cost, status, complexity, finish) → Job Items (table: Item ID | Source | Description | Qty | Unit | Finish | Stock Ref/Notes). One scope per workshop deliverable; items listed underneath
4. **Materials** — aggregated BOM, grouped by material category (Timber, Sheet, Fabric, Paint & Finish, Uncategorised). Each row: Description | Unit | Qty | Unit £ | Total £ | From Stock | Needs Ordering | Quote Line Refs | Used In Scopes. Category sub-totals + grand total

### Empty templates (their responsibility)
Blue banner: *"Blank template — fill in as needed."*

5. **Suppliers** — Company | Contact Name | Role | Email | Phone | Notes
6. **Crew Schedule** — Name | Skill | Dept | Contact | Thu Build | Fri Build | Sat Build | Sat Live | Sat Derig | Sun Build | Sun Live
7. **Production Schedule** — Date | Start | End | Area | Activity | Dept/Supplier | Contact | Crew Req | Notes
8. **Vehicles & Loads** — Date | Arrival | Access | Company | Vehicle Type | Registration | Driver | Location/W3W | Equipment/Kit | Notes
9. **Graphics** — Area | Description | Print Type | W | H | Bleed | Qty | Artwork Status | Supplier | Brief/Notes
10. **Hires** — # | Space/Zone | Area | Item Description | Qty | Supplier | Delivery Date | Notes
11. **Onsite Management** — Role | Name | Location | Phone | Notes

Empty templates match the column structure of Fait Accompli's existing pack so adoption is zero-friction.

---

## 3. Key design decisions (v1)

- **Quote lines as the spine.** Every exported row references `quote_line_id`. If they re-map anything (split a line, add notes), the ID survives. Materials and scope items show which quote line(s) they belong to
- **No cell protection.** They can edit anything. We trust them, and we avoid the mess of protected-sheet warnings on a collaborative document
- **No cell formulas.** Copy-paste safe. Avoids circular references when rows get split, moved, or merged. All totals computed in Python at generation time
- **Banner on every auto-sheet.** Tells the reader what's generated and what's editable. Prevents "I changed the unit price and it vanished next export" surprises
- **Versioned filename.** `Starlight_ProjectPack_{JobNumber}_{ClientShort}_{YYYY-MM-DD}.xlsx` — date stamp makes version obvious; clients collect multiple versions naturally
- **Python + openpyxl generator.** Lives as `scripts/build_project_pack.py`. Data pulled via Supabase queries staged as JSON files. One-command run. Portable; doesn't need the web app running
- **Dev-side for now.** We generate and email. Not a web button yet — we want to see how the format holds up before committing to a UI

---


## 4. Known limitations (v1)

- **Stock ref without product name.** Job items with stock refs (e.g. `"1744"`) don't show the catalogue name (`"8x4 Steel Deck"`). Means Fait Accompli can't read them without our catalogue. Low-effort fix: join against `tbl_stock_items.product_name` at generation
- **Alphabetical zone order on Scope & Build.** Currently: Assembly Foyer, Ballroom Foyer, Ballroom Reception, Ceiling Panel, Entrance Moment, Great Room, Linking Corridor. Real build flows event-first: Entrance → Foyer → Corridor → Great Room. No zone ordering metadata in the system yet
- **No photos.** Scopes have `photo_path` in the DB but the pack is text-only. PMs working visually at reception/install benefit from seeing what they're building
- **No cut sheets or drawings.** OneDrive folder structure exists (`Workshop/{jobNumber} - {jobName}/{docType}/`) but we don't link to it from the pack. A PM reading the pack has no path to the drawings
- **Empty templates don't know about venue.** Suppliers sheet is blank even though we probably know the venue contact. Same for Onsite Management — event day typically has 3-5 known roles even before detailed planning
- **No change-tracking between versions.** If the PM gets v2 next week, they have to diff two xlsx files manually. No "what changed since last export" signal
- **No supplier totals on Materials.** We show needs-ordering flags but don't aggregate "Here's what to order from Howarth Timber"
- **WO progress invisible.** Scope & Build shows estimated cost but not build status beyond scope-level (Provisional / Active / Workshop Completed). PMs want to know "is the pergola actually built yet?"
- **Crew Schedule is blank even when we have bookings.** When Grosvenor has confirmed crew in `tbl_freelancer_schedule`, pre-populate rows instead of empty template
- **Zone naming inconsistency.** Some zones have "Lighting BR" / "Lighting GR" which are dept-zones not location-zones. Materials aggregation doesn't handle this distinction

---

## 5. Parking lot — ideas to explore

Grouped by theme. All deferred until we see how v1 lands in real use with Fait Accompli.

### Productionisation
- **Promote to web button.** "Export Project Pack" on the job page. Server-side generation via API route. Streams xlsx to browser
- **Per-client templates.** Fait Accompli might want different columns than, say, a direct-booking client. Client-level template config in `tbl_clients` or a new `tbl_pack_templates`
- **Emailed delivery.** Generate + attach + send in one click. Cc Mateusz. Audit log the send
- **Version history.** When generated, store the xlsx in OneDrive at `Workshop/{jobNumber}/ProjectPack/v{N}_{date}.xlsx`. Lets us answer "what did we send last Tuesday?"

### Content enrichment
- **Stock catalogue join.** Every stock ref shows product name + image thumbnail (if available)
- **OneDrive links.** Each scope row links to its drawings folder. Each job item links to its cut sheet (if exists)
- **Progress column on Scope & Build.** "WO count: 3 / 5 complete" or actual photo of the built piece from `tbl_scope_items.completion_photo_path`
- **Inline photos on Overview.** Thumbnail grid of completed scopes. Visual confidence for PMs at a glance
- **Embedded plan/CAD page.** Image of the venue plan with zone overlays
- **Event-flow zone ordering.** Add `event_zone_order` int to zones, or a `tbl_event_zones(job_id, zone_name, order)` per-job override. PMs set the order during quote interpretation

### Smart templates (pre-population)
- **Pre-fill Crew Schedule from `tbl_freelancer_schedule`.** Booked crew + their skill + their phone. Days they're confirmed vs provisional shown differently
- **Pre-fill Suppliers from BOM's `supplier` column.** Materials come with suppliers; populate at least the ones we've already ordered from
- **Pre-fill Vehicles from `tbl_load_groups`.** We have the truck data now (Session 26). Flow it straight in
- **Pre-fill Onsite Management with known roles.** Mateusz (Workshop), PM name (from `tbl_production_plan.project_manager`), Foreman on duty

### Collaboration mechanics
- **"Last edited by" trail inside the xlsx.** Harder without a live connection, but a generated "Revision History" sheet showing what Starlight changed since last export would help
- **Change-log sheet.** Auto-generated diff: "Quote line 32 qty changed from 11 to 12", "New scope added: Head Table runners". Appears only on re-export
- **Two-way: import their edits back.** Dangerous, high-value. PM adds a scope to the Scope & Build sheet; we import. Or PM updates crew phone numbers; we sync to `tbl_freelancers`. Requires careful validation
- **Cell comments on data cells.** openpyxl supports this. Use to explain "This is live-generated; your edits overwrite next export"

### Visual / readability
- **Margin highlighting.** Red if margin % < 20, amber < 40, green ≥ 40. Spot the bleeders instantly
- **Status-coloured rows.** No-Cost-Data lines in grey, No-Scope in amber, Tracked in white
- **Zone-coloured scope blocks.** Each zone gets a subtle colour across its rows on Scope & Build
- **Conditional formatting (native Excel).** Use openpyxl's conditional formatting so colours update as they edit quantities — only if we introduce simple formulas (which we currently avoid)
- **Print layout variants.** A3 landscape for the Production Schedule, A4 portrait for Quote Lines. PageBreaks configured

### Alternative formats
- **Per-zone mini-packs.** Generate one xlsx per zone for huge events — each PM takes their zone
- **PDF view.** Read-only PDF version for sharing with the client (Bride & Groom, venue manager). Same data, locked
- **Gantt-style Production Schedule.** Current version is a table; Gantt would be more useful for install day timing
- **Mobile web view.** Same data, different surface — a read-only web page the PMs can open on their phone during the event instead of hunting for the xlsx

### Data model extensions (would need schema work)
- **`tbl_pack_exports` audit table.** Who generated, when, with what revision of scope data, sent to whom
- **`tbl_job_external_team`** — client-side PMs' names, roles, contacts. Flows into Suppliers/Onsite Management pre-fill
- **Zone-level metadata** — event-flow order, photos, plans, access notes. Currently zones are a free-text column
- **Scope sub-tasks visibility.** If we expose WO-level detail (without overwhelming), PMs see "Pergola: frame ✓, paint in progress, rig scheduled Sat AM"

---


## 6. Open questions for the design session

Things we need Fait Accompli's feedback on before committing to v2 direction:

- **Which sheets do they actually use?** The pack has 11, but observation of their old pack suggests some are vestigial. No point polishing a sheet nobody opens
- **What column do they wish we had?** They've been running pack-style docs for years. There are fields they type every time that we could supply
- **Do they want editability back-flowing to us?** "If we update the crew phone, does Starlight know?" Answer shapes whether we build import or stay export-only
- **How do they handle versioning currently?** Email threads, shared drive, rename v2/v3? Informs whether we need a change-log sheet or if the filename date is enough
- **Do they print or work in Excel?** Massive layout implications. Our current design is screen-first
- **Does the client (Bride & Groom / venue) ever see this?** If yes, we probably want a trimmed external-facing variant without internal margins

Also open internally:
- **Is the quote-line-spine the right choice long-term, or should we spine on scope?** Scope has more depth and more relevance to what's physically built. Downside: some scopes cover 0 quote lines (bonus items, allowances)
- **How close do we want to get to being a live system for them?** Every step toward live removes a manual handoff but adds integration surface. v1's snapshot model has real virtue
- **Should the empty templates have formulas or stay formula-free?** Current v1 has none. But a "crew day counter" formula on the Crew Schedule would be easy and useful. Where do we draw the line?

---

## 7. Success criteria for v2 scoping

When we return to this, we'll know v2 is worth doing when:

- **Fait Accompli has used v1 on Grosvenor end-to-end** (install → event → strike)
- **We have 3-5 specific asks from them** that we couldn't have predicted
- **Another client asks for the same format** — signals the pattern generalises
- **The "one-off script" starts feeling annoying to run** — natural push toward button/UI
- **We've hit a case where re-export-overwrites-their-work caused pain** — validates the change-log / merge idea

Until those signals appear, v1 is deliberately light. Don't build v2 on speculation.

---

*Last updated: 18 April 2026 (end of Session 26).*
*Next review: after Fait Accompli has used v1 on Grosvenor, or when another client asks for the same format — whichever comes first.*
