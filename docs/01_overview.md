# Starlight Production System — Overview

**Last updated:** 6 May 2026 (S41)

## What this is

A production management system for **Starlight Design**, a high-end events fabrication company making sets, furniture, bars, stages, and scenic elements for private high-net-worth clients. The system is a **Next.js web application backed by Supabase (PostgreSQL)**, live at `workshop-five-gamma.vercel.app`.

It replaced an MS Access front-end in March 2026. The Access system is gone; the Supabase database it shared with the Access build was the migration path.

## Who it serves

| Audience | Surface | What they do |
|---|---|---|
| **Directors** | Reports (future) | Need confidence in numbers before committing to expansion. |
| **Production Managers** | Desktop dashboard | Plan, quote, scope, schedule, review costs. |
| **Foremen** | Desktop workshop view | Execute, allocate, coordinate the floor. |
| **Freelancers** | Mobile (`/m/*`) | Clock in, log hours, mark complete, upload photos. Under 30 seconds per interaction. |

Starlight is almost entirely freelance workforce with varying turnover. Any system must be dead simple for floor-level input. The system exists to replace "back of napkin" operations with data-driven visibility without creating bureaucratic overhead that kills the speed this industry demands.

## The five questions the system answers

1. Are we making or losing money on this specific item?
2. How accurate was our estimate versus what it actually cost?
3. Where is our time and money actually going?
4. Can we take on this new project given current capacity?
5. Here are the numbers — we are ready to scale.

## Four design principles

These govern every decision. When a feature conflicts with a principle, the principle wins.

**1. If it is worth planning individually, it is worth tracking.**
Replaces any minimum size threshold. If a task is too small to plan individually, it does not need a Work Order — it is just part of doing the job.

**2. More friction, less done.**
The system supports experienced people, never constrains them. If a field, screen, or process slows people down without a clear data payoff, it does not belong.

**3. Soft signals only.**
The system surfaces information. It never hard-blocks experienced people from proceeding. Phase ordering, dependency warnings, capacity gaps — all signals, never locks. The explicit exceptions: Work Order completion requires a photo, and Scope Item completion requires a photo or waiver.

**4. Split a Work Order when the split changes the assignee, the rate, the risk, or the estimate.**
Otherwise keep it together. A stage build that goes CUT → ASSEMBLE → PRIME → SCENIC PAINT is three WOs if the scenic work needs a specialist, not four — the cut and assemble collapse if the same team does both at the same rate in the same session.

## The Four Zones

The system is one application but organises around four operational contexts:

| Zone | Role | Surface | Purpose |
|---|---|---|---|
| **1 — Architect** | PM | Desktop | Planning: jobs, quote lines, scope, work orders, capacity, materials |
| **2 — Commander** | Foreman | Desktop | Active workshop: all running WOs, no commercial data |
| **3 — Auditor** | PM | Desktop | Review & exceptions: flags, time corrections, cost reconciliation |
| **4 — Workshop** | Freelancer | Mobile | Execute: clock in/out, log hours, mark complete, photos |

## The Golden Path

The core workflow, in sequence:

```
Quote → Scope Items → Work Orders → Time Entries → Cost Visibility → Job Complete → Close Report
```

1. **Job created** (new job dialog or imported from accounts system)
2. **Quote lines entered** (manual inline form or external quote import)
3. **Lines interpreted** → PM creates Scope Items (buildable deliverables) from quote lines
4. **Scope broken down** → Job Items (components), then Work Orders (tasks with activity verb, complexity, BOM)
5. **Traveller printed** → WO status moves to Ready; QR code on the printed traveller links to the mobile interface
6. **Freelancers execute** → START / JOIN / LOG HOURS / MARK COMPLETE via phone browser
7. **Cost captured** → hours × rate = labour cost; BOM qty × unit cost = material cost
8. **Review & close** → PM reviews flags, corrects time entries, verifies costs, uploads site photos
9. **Job Complete** → PM marks job Complete, optionally captures a debrief note, lands on the close report. Active surfaces filter out Complete; close report stays live (costs can still post). Reopen if needed.

## Current status

| | |
|---|---|
| **Backend** | Supabase (PostgreSQL) — see `03_database_schema.md` for current counts |
| **Frontend** | Next.js 16.1.7 / React / Tailwind / shadcn/ui patterns |
| **Hosting** | Vercel (hobby tier) — `workshop-five-gamma.vercel.app` |
| **Repo** | `github.com/mateuszgarwacki-arch/starlight-web` |
| **Primary builder** | Mateusz Garwacki (Workshop Manager, system admin) |

## Non-negotiables (privacy + photography)

Starlight is a private company — no social media, no external promotion. All photography captured through the system is **internal craft documentation only, never promotional**. This must be clear in freelancer onboarding and enforced in any future sharing feature.

## Reference

- **`TRACKER.md`** — Session log and the running authoritative state of what's built, deferred, and broken.
- **`03_database_schema.md`** — Live schema.
- **`02_architecture.md`** — Technical detail on how it's built.
