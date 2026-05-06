// ============================================================
// Starlight Database Types
// Generated from Supabase schema — 21 tables
// ============================================================

export interface Job {
  job_id: number;
  job_number: string | null;
  external_project_ref: string | null;
  job_name: string | null;
  client_name: string | null;
  event_date: string | null;
  event_location: string | null;
  budget_allowance: number | null;
  pm_note: string | null;
  post_event_delivery: string | null;
  created_by: number | null;
  created_at: string | null;
  job_status: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  completed_by?: number | null;
  close_note?: string | null;
}

export interface Quote {
  quote_id: number;
  job_id: number | null;
  quote_reference: string | null;
  quote_version: string | null;
  quote_description: string | null;
  // quote_value column dropped — total is derived from tbl_quote_lines.
  quote_date: string | null;
  status: string | null;
  notes: string | null;
  imported_at: string | null;
  imported_by: number | null;
  updated_at?: string | null;
}

export interface QuoteLine {
  quote_line_id: number;
  quote_id: number | null;
  job_id: number | null;
  line_number: string | null;
  import_sequence: number | null;
  line_text: string | null;
  line_value: number | null;
  quantity: number | null;
  unit_price: number | null;
  event_zone: string | null;
  line_sub_group: string | null;
  category: string | null;
  pm_note: string | null;
  imported_at: string | null;
  updated_at?: string | null;
  pm_est_cost: number | null;
  pm_est_labour_days: number | null;
  pm_est_material_cost: number | null;
  pm_est_rate_override: number | null;
  pm_est_notes: string | null;
}

export interface ScopeItem {
  scope_item_id: number;
  job_id: number | null;
  quote_line_id: number | null;
  modified_quote_line_id: number | null;
  item_name: string | null;
  category_id: number | null;
  description: string | null;
  event_zone: string | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  status: string | null;
  is_general: string | null;
  completion_photo_path: string | null;
  photo_waiver: string | null;
  photo_waiver_reason: string | null;
  cancellation_reason: string | null;
  created_by: number | null;
  created_at: string | null;
  modified_at: string | null;
  photo_path: string | null;
  updated_at?: string | null;
}

export interface ScopeOption {
  option_id: number;
  scope_item_id: number;
  option_label: string;
  description: string | null;
  pros: string | null;
  cons: string | null;
  est_labour_days: number | null;
  est_material_cost: number | null;
  est_total_cost: number | null;
  impact_on_quote: number | null;
  status: string;
  selected_by: string | null;
  selected_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WorkOrder {
  work_order_id: number;
  job_id: number | null;
  scope_item_id: number | null;
  activity_verb: number | null;
  description: string | null;
  estimated_duration_hrs: number | null;
  reference_wo_id: number | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  planned_lead_id: number | null;
  rate_override: number | null;
  status: string | null;
  on_hold_reason: string | null;
  void_reason: string | null;
  system_complete_timestamp: string | null;
  actual_complete_timestamp: string | null;
  completion_photo_path: string | null;
  updated_at?: string | null;
}

export interface JobItem {
  item_id: number;
  job_id: number | null;
  scope_item_id: number | null;
  description: string | null;
  item_type: string | null;
  stock_reference: string | null;
  quantity: number | null;
  unit: string | null;
  finish_required: string | null;
  kit_list_exported: string | null;
  kit_list_exported_at: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string | null;
  temp_selected: string | null;
}

export interface Freelancer {
  freelancer_id: number;
  freelancer_name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  speciality: string | null;
  day_rate: number | null;
  standard_day_hours: number | null;
  active: string | null;
  system_access: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface TimeEntry {
  entry_id: number;
  work_order_id: number | null;
  freelancer_id: number | null;
  system_start_timestamp: string | null;
  actual_start_timestamp: string | null;
  system_end_timestamp: string | null;
  actual_end_timestamp: string | null;
  actual_hours: number | null;
  applied_hourly_rate: number | null;
  entry_cost: number | null;
  flag_note: string | null;
  timestamp_edited_flag: string | null;
}

export interface WoBom {
  bom_id: number;
  work_order_id: number | null;
  scope_item_id: number | null;
  job_id: number | null;
  material_id: number | null;
  stock_item_id: number | null;
  material_category: number | null;
  item_description: string | null;
  stock_reference: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  actual_unit_cost: number | null;
  supplier: string | null;
  needs_ordering: string | null;
  ordered_at: string | null;
  ordered_by: number | null;
  notes: string | null;
  from_stock: string | null;
  updated_at?: string | null;
}

export interface MasterLookup {
  lookup_id: number;
  category: string | null;
  lookup_value: string | null;
  display_order: number | null;
  phase_number: number | null;
  phase_label: string | null;
  active: string | null;
  notes: string | null;
}

export interface Material {
  material_id: number;
  material_name: string | null;
  material_category: number | null;
  unit: string | null;
  standard_length: number | null;
  standard_sheet_size: string | null;
  standard_width: number | null;
  current_unit_cost: number | null;
  primary_supplier: string | null;
  notes: string | null;
  active: string | null;
  spec_val_1: number | null;
  spec_val_2: number | null;
  spec_val_3: number | null;
  spec_text_1: string | null;
  spec_text_2: string | null;
  paint_finish: string | null;
}

// ============================================================
// View types (pre-joined)
// ============================================================

export interface DashUpcomingJob {
  job_id: number;
  job_number: string | null;
  job_name: string | null;
  event_date: string | null;
  quote_imported: string;
  scope_prog: string;
  total_wos: number;
  wo_plan: number;
  wo_rdy: number;
  wo_act: number;
  wo_done: number;
}

export interface ScopeContext {
  scope_item_id: number;
  job_id: number;
  item_name: string | null;
  description: string | null;
  scope_status: string | null;
  complexity_construction: string | null;
  finish_relative: string | null;
  event_zone: string | null;
  job_name: string | null;
  job_number: string | null;
  event_date: string | null;
}

export interface JobCostSummary {
  job_id: number;
  job_number: string | null;
  job_name: string | null;
  event_date: string | null;
  budget_allowance: number | null;
  accepted_quote_value: number;
  job_est_labour_cost: number;
  job_actual_labour_cost: number;
  job_material_cost: number;
  job_total_actual_cost: number;
  job_margin: number;
}

export interface ManpowerDemand {
  department: string;
  total_hrs: number;
  hrs_not_started: number;
  hrs_ready: number;
  hrs_in_progress: number;
}

// ============================================================
// App-level types
// ============================================================

export type UserRole = "production_manager" | "foreman" | "freelancer";

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  freelancer_id?: number;
  display_name: string;
}

// Utility: check if a Supabase text boolean is truthy
// Handles both string "true" (ODBC legacy) and real booleans
export function isTruthy(val: string | boolean | null | undefined): boolean {
  if (typeof val === "boolean") return val;
  return val === "true" || val === "True" || val === "-1";
}
// Add these to the BOTTOM of your existing src/lib/types.ts file
// (don't replace the whole file — just append these)

export interface Contractor {
  contractor_id: number;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  speciality: string | null;
  notes: string | null;
  active: boolean | null;
  created_at: string | null;
}

export interface QuoteLineContractor {
  id: number;
  quote_line_id: number | null;
  contractor_id: number | null;
  contractor_quote_value: number | null;
  description: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface QuoteLineWithContractor extends QuoteLine {
  contractor_id: number | null;
  contractor_quote_value: number | null;
  contractor_description: string | null;
  contractor_name: string | null;
}
