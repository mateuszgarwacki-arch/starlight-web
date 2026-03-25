import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Audit log helper — wraps updates with change tracking
// ============================================================

interface AuditContext {
  supabase: SupabaseClient;
  userId?: string;
  userName?: string;
  userRole?: string;
}

// Get current user context from Supabase session
export async function getAuditContext(supabase: SupabaseClient): Promise<AuditContext> {
  const { data: { user } } = await supabase.auth.getUser();
  return {
    supabase,
    userId: user?.id,
    userName: user?.user_metadata?.name || user?.email || "Unknown",
    userRole: user?.user_metadata?.role || "unknown",
  };
}

// Tables we audit and their PK column names
const AUDITED_TABLES: Record<string, string> = {
  tbl_quote_lines: "quote_line_id",
  tbl_scope_items: "scope_item_id",
  tbl_work_orders: "work_order_id",
  tbl_wo_bom: "bom_id",
  tbl_production_plan: "job_id",
  tbl_quotes: "quote_id",
  tbl_wo_time_entries: "entry_id",
  tbl_freelancers: "freelancer_id",
  tbl_scope_options: "option_id",
};

// Fields to skip auditing (noisy, system-managed)
const SKIP_FIELDS = new Set(["updated_at", "imported_at", "created_at"]);

// Result type for concurrency-aware updates
export interface AuditUpdateResult {
  data: any;
  error: any;
  conflict: boolean;
  /** When conflict=true, this holds the current DB record (what someone else saved) */
  currentRecord?: Record<string, any>;
}

/**
 * Audited update — records each field change before applying.
 *
 * Optimistic concurrency: when `expectedUpdatedAt` is provided, the update
 * includes `WHERE updated_at = expectedUpdatedAt`. If zero rows match
 * (someone else updated the record), returns { conflict: true, currentRecord }.
 */
export async function auditedUpdate(
  ctx: AuditContext,
  tableName: string,
  recordId: number,
  changes: Record<string, any>,
  jobId?: number | null,
  expectedUpdatedAt?: string | null,
): Promise<AuditUpdateResult> {
  const pkCol = AUDITED_TABLES[tableName];
  if (!pkCol) {
    // Not an audited table — just do a plain update
    const result = await ctx.supabase.from(tableName).update(changes).eq(pkCol || "id", recordId);
    return { data: result.data, error: result.error, conflict: false };
  }

  // 1. Fetch current record to capture old values
  const { data: current } = await ctx.supabase
    .from(tableName)
    .select("*")
    .eq(pkCol, recordId)
    .single();

  // 1b. Concurrency check — if expectedUpdatedAt was given and record has
  //     already been modified, return conflict WITHOUT writing
  if (expectedUpdatedAt && current) {
    const dbUpdatedAt = current.updated_at;
    if (dbUpdatedAt && dbUpdatedAt !== expectedUpdatedAt) {
      return { data: null, error: null, conflict: true, currentRecord: current };
    }
  }

  // 2. Build audit entries for each changed field
  const auditRows: any[] = [];
  if (current) {
    for (const [field, newVal] of Object.entries(changes)) {
      if (SKIP_FIELDS.has(field)) continue;
      const oldVal = current[field];
      // Only log if actually changed
      if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;
      auditRows.push({
        user_id: ctx.userId,
        user_name: ctx.userName,
        user_role: ctx.userRole,
        table_name: tableName,
        record_id: recordId,
        field_name: field,
        old_value: oldVal != null ? JSON.stringify(oldVal) : null,
        new_value: newVal != null ? JSON.stringify(newVal) : null,
        job_id: jobId ?? current.job_id ?? null,
        action_type: "update",
      });
    }
  }

  // 3. Write audit entries (fire and forget — don't block the update)
  if (auditRows.length > 0) {
    ctx.supabase.from("tbl_audit_log").insert(auditRows).then(() => {});
  }

  // 4. Perform the actual update — with concurrency guard if provided
  let query = ctx.supabase.from(tableName).update(changes).eq(pkCol, recordId);
  if (expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }
  const result = await query.select().maybeSingle();

  // 4b. If concurrency guard was active and zero rows updated — conflict
  if (expectedUpdatedAt && !result.data && !result.error) {
    // Re-fetch to get whoever else's changes
    const { data: fresh } = await ctx.supabase.from(tableName).select("*").eq(pkCol, recordId).single();
    return { data: null, error: null, conflict: true, currentRecord: fresh ?? undefined };
  }

  return { data: result.data, error: result.error, conflict: false };
}

/**
 * Audited insert — logs the creation of a new record
 */
export async function auditedInsert(
  ctx: AuditContext,
  tableName: string,
  data: Record<string, any>,
  jobId?: number | null,
) {
  const result = await ctx.supabase.from(tableName).insert(data).select().single();
  
  if (result.data && AUDITED_TABLES[tableName]) {
    const pkCol = AUDITED_TABLES[tableName];
    const recordId = result.data[pkCol];
    await ctx.supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId,
      user_name: ctx.userName,
      user_role: ctx.userRole,
      table_name: tableName,
      record_id: recordId,
      field_name: "_record",
      old_value: null,
      new_value: JSON.stringify(data),
      job_id: jobId ?? data.job_id ?? null,
      action_type: "insert",
    });
  }
  
  return result;
}

/**
 * Audited delete — logs the deletion of a record
 */
export async function auditedDelete(
  ctx: AuditContext,
  tableName: string,
  recordId: number,
  jobId?: number | null,
) {
  const pkCol = AUDITED_TABLES[tableName];
  
  // Capture full record before deletion
  let oldData = null;
  if (pkCol) {
    const { data } = await ctx.supabase.from(tableName).select("*").eq(pkCol, recordId).single();
    oldData = data;
  }
  
  const result = await ctx.supabase.from(tableName).delete().eq(pkCol || "id", recordId);
  
  if (oldData && pkCol) {
    await ctx.supabase.from("tbl_audit_log").insert({
      user_id: ctx.userId,
      user_name: ctx.userName,
      user_role: ctx.userRole,
      table_name: tableName,
      record_id: recordId,
      field_name: "_record",
      old_value: JSON.stringify(oldData),
      new_value: null,
      job_id: jobId ?? oldData.job_id ?? null,
      action_type: "delete",
    });
  }
  
  return result;
}

/**
 * Revert a single audit entry — restores old value and marks entry as reverted
 * Returns { success, error? }
 */
export async function revertAuditEntry(
  ctx: AuditContext,
  auditId: number,
): Promise<{ success: boolean; error?: string }> {
  // 1. Load the audit entry
  const { data: entry } = await ctx.supabase
    .from("tbl_audit_log")
    .select("*")
    .eq("audit_id", auditId)
    .single();

  if (!entry) return { success: false, error: "Audit entry not found" };
  if (entry.reverted_at) return { success: false, error: "Already reverted" };
  if (entry.action_type !== "update") return { success: false, error: "Can only revert field updates" };

  const pkCol = AUDITED_TABLES[entry.table_name];
  if (!pkCol) return { success: false, error: "Table not revertable" };

  // 2. Parse the old value
  const oldVal = entry.old_value != null ? JSON.parse(entry.old_value) : null;

  // 3. Apply the revert (this itself gets audited via the trigger)
  const { error: updateErr } = await ctx.supabase
    .from(entry.table_name)
    .update({ [entry.field_name]: oldVal })
    .eq(pkCol, entry.record_id);

  if (updateErr) return { success: false, error: updateErr.message };

  // 4. Mark the original entry as reverted
  await ctx.supabase
    .from("tbl_audit_log")
    .update({ reverted_at: new Date().toISOString(), reverted_by: ctx.userId })
    .eq("audit_id", auditId);

  // 5. Log the revert itself
  await ctx.supabase.from("tbl_audit_log").insert({
    user_id: ctx.userId,
    user_name: ctx.userName,
    user_role: ctx.userRole,
    table_name: entry.table_name,
    record_id: entry.record_id,
    field_name: entry.field_name,
    old_value: entry.new_value,
    new_value: entry.old_value,
    job_id: entry.job_id,
    action_type: "revert",
  });

  return { success: true };
}
