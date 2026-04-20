// ============================================================
// Learnings — taxonomy, types, and helpers
// ============================================================

export type LearningCategory =
  | "estimate_miss"
  | "scope_change"
  | "execution_issue"
  | "material_supply_issue"
  | "client_behaviour"
  | "design_issue"
  | "process_issue"
  | "communication_gap"
  | "judgement_call"
  | "positive_learning"
  | "pm_note"
  | "materials_note";

export type LearningEntityType =
  | "job"
  | "quote_line"
  | "scope_item"
  | "work_order"
  | "bom"
  | "time_entry"
  | "material"
  | "stock_item"
  | "freelancer"
  | "supplier";

export interface CategoryDef {
  id: LearningCategory;
  label: string;
  description: string;
  subFieldLabel: string;
  subOptions: { value: string; label: string }[];
  colour: string;
  bias: "negative" | "neutral" | "positive";
}

export const LEARNING_CATEGORIES: CategoryDef[] = [
  {
    id: "estimate_miss",
    label: "Estimate miss",
    description: "We got the quote or scope numbers wrong (hours, materials, cost).",
    subFieldLabel: "Direction",
    subOptions: [
      { value: "under", label: "Under-estimated" },
      { value: "over", label: "Over-estimated" },
    ],
    colour: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    bias: "negative",
  },
  {
    id: "scope_change",
    label: "Scope change",
    description: "Brief or requirements shifted after the quote was signed.",
    subFieldLabel: "Source",
    subOptions: [
      { value: "client", label: "Client-driven" },
      { value: "internal", label: "Internal (us)" },
      { value: "external_constraint", label: "External constraint" },
    ],
    colour: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    bias: "neutral",
  },
  {
    id: "execution_issue",
    label: "Execution issue",
    description: "Something was built, loaded, assembled, finished, or delivered wrong.",
    subFieldLabel: "Stage",
    subOptions: [
      { value: "build", label: "Build" },
      { value: "assembly", label: "Assembly" },
      { value: "finish", label: "Finish" },
      { value: "load", label: "Load" },
      { value: "delivery", label: "Delivery" },
      { value: "install", label: "Install" },
    ],
    colour: "bg-red-500/20 text-red-300 border-red-500/40",
    bias: "negative",
  },
  {
    id: "material_supply_issue",
    label: "Material / supply",
    description: "Materials: price, availability, quality, wrong spec, lead time, supplier problem.",
    subFieldLabel: "Nature",
    subOptions: [
      { value: "price", label: "Price" },
      { value: "availability", label: "Availability" },
      { value: "quality", label: "Quality" },
      { value: "wrong_spec", label: "Wrong spec / delivery" },
      { value: "lead_time", label: "Lead time" },
    ],
    colour: "bg-orange-500/20 text-orange-300 border-orange-500/40",
    bias: "negative",
  },
  {
    id: "client_behaviour",
    label: "Client",
    description: "The client was the driver — late decisions, changes, payment, on-site difficulty.",
    subFieldLabel: "Type",
    subOptions: [
      { value: "late_decision", label: "Late decision" },
      { value: "scope_push", label: "Scope push (no VO)" },
      { value: "payment", label: "Payment" },
      { value: "on_site", label: "On-site" },
      { value: "communication", label: "Communication" },
    ],
    colour: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
    bias: "neutral",
  },
  {
    id: "design_issue",
    label: "Design / spec",
    description: "Drawings or specs unclear, missing info, unbuildable, or contradictory.",
    subFieldLabel: "Nature",
    subOptions: [
      { value: "unclear", label: "Unclear" },
      { value: "missing_info", label: "Missing info" },
      { value: "unbuildable", label: "Unbuildable" },
      { value: "contradictory", label: "Contradictory" },
    ],
    colour: "bg-violet-500/20 text-violet-300 border-violet-500/40",
    bias: "neutral",
  },
  {
    id: "process_issue",
    label: "Process",
    description: "Our systems, handoffs, templates, or rules failed us.",
    subFieldLabel: "Area",
    subOptions: [
      { value: "handoff", label: "Handoff" },
      { value: "template", label: "Template" },
      { value: "rule", label: "Rule / policy" },
      { value: "approval", label: "Approval flow" },
      { value: "tooling", label: "Tooling / system" },
    ],
    colour: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    bias: "negative",
  },
  {
    id: "communication_gap",
    label: "Communication gap",
    description: "Information didn't reach the right person, or assumptions weren't surfaced.",
    subFieldLabel: "Between",
    subOptions: [
      { value: "me_pm", label: "Me \u2194 PM" },
      { value: "me_freelancer", label: "Me \u2194 Freelancer" },
      { value: "pm_freelancer", label: "PM \u2194 Freelancer" },
      { value: "pm_client", label: "PM \u2194 Client" },
      { value: "internal_supplier", label: "Us \u2194 Supplier" },
    ],
    colour: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    bias: "negative",
  },
  {
    id: "judgement_call",
    label: "Judgement call",
    description: "A deliberate decision made with known tradeoffs that hindsight now questions.",
    subFieldLabel: "Area",
    subOptions: [
      { value: "pricing", label: "Pricing" },
      { value: "scheduling", label: "Scheduling" },
      { value: "crewing", label: "Crewing" },
      { value: "procurement", label: "Procurement" },
      { value: "scope", label: "Scope" },
    ],
    colour: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    bias: "neutral",
  },
  {
    id: "positive_learning",
    label: "Positive learning",
    description: "Something that worked well, a near-miss saved, or a pattern to systematise.",
    subFieldLabel: "Type",
    subOptions: [
      { value: "worked_well", label: "Worked well" },
      { value: "near_miss_saved", label: "Near-miss saved" },
      { value: "systematise_this", label: "Systematise this" },
    ],
    colour: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    bias: "positive",
  },
  {
    id: "pm_note",
    label: "PM note",
    description: "A quick tip or explanation for anyone working on this line — not an issue.",
    subFieldLabel: "Type",
    subOptions: [],
    colour: "bg-starlight-blue/20 text-starlight-blue border-starlight-blue/40",
    bias: "neutral",
  },
  {
    id: "materials_note",
    label: "Materials note",
    description: "Note affecting material procurement, handling, stock, or substitution for this line.",
    subFieldLabel: "Type",
    subOptions: [],
    colour: "bg-teal-500/20 text-teal-300 border-teal-500/40",
    bias: "neutral",
  },
];

export const CATEGORY_MAP: Record<LearningCategory, CategoryDef> = Object.fromEntries(
  LEARNING_CATEGORIES.map((c) => [c.id, c])
) as Record<LearningCategory, CategoryDef>;

// ============================================================
// DB row types
// ============================================================

export interface LearningRow {
  learning_id: string;
  category: LearningCategory;
  sub_type: string | null;
  severity: number | null;
  cost_impact_gbp: number | null;
  hours_impact: number | null;
  actionable: boolean;
  headline: string;
  detail: string | null;
  job_id: number | null;
  quote_line_id: number | null;
  scope_item_id: number | null;
  work_order_id: number | null;
  bom_id: number | null;
  time_entry_id: number | null;
  material_id: number | null;
  stock_item_id: number | null;
  freelancer_id: number | null;
  supplier_id: number | null;
  embedding_status: "pending" | "ready" | "failed" | "disabled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

export interface LearningEnriched extends LearningRow {
  job_number: string | null;
  job_name: string | null;
  client_name: string | null;
  quote_line_text: string | null;
  quote_line_number: string | null;
  scope_item_name: string | null;
  wo_verb: string | null;
  wo_description: string | null;
  material_name: string | null;
  stock_code: string | null;
  stock_description: string | null;
  freelancer_name: string | null;
  supplier_name: string | null;
  context_label: string | null;
  created_by_display: string | null;
}

export interface LearningEntityContext {
  job_id?: number | null;
  quote_line_id?: number | null;
  scope_item_id?: number | null;
  work_order_id?: number | null;
  bom_id?: number | null;
  time_entry_id?: number | null;
  material_id?: number | null;
  stock_item_id?: number | null;
  freelancer_id?: number | null;
  supplier_id?: number | null;
  contextLabel: string;
  contextSublabel?: string;
}

export function contextToInsertFields(ctx: LearningEntityContext): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const fields: (keyof LearningEntityContext)[] = [
    "job_id",
    "quote_line_id",
    "scope_item_id",
    "work_order_id",
    "bom_id",
    "time_entry_id",
    "material_id",
    "stock_item_id",
    "freelancer_id",
    "supplier_id",
  ];
  for (const f of fields) {
    const v = ctx[f];
    if (v != null) out[f] = v as number;
  }
  return out;
}

export function severityDots(severity: number | null): string {
  if (severity == null) return "";
  const filled = "\u25CF".repeat(severity);
  const empty = "\u25CB".repeat(Math.max(0, 5 - severity));
  return filled + empty;
}

export function severityColour(severity: number | null): string {
  if (severity == null) return "text-faint";
  if (severity >= 4) return "text-rose-400";
  if (severity === 3) return "text-amber-400";
  return "text-blue-300";
}
