-- quote-import/import_quote.function.sql
--
-- STATUS: DEPLOYED to project qbdnoueqkmhznqzpkvos on 2026-05-29 (verified end-to-end).
-- This file is the source of record. The commit route calls it via
-- supabase.rpc('import_quote', { payload, p_uploaded_by }).
--
-- One function = one transaction: job, quote, all lines, and the OneDrive document row
-- commit together or not at all. Same insert shape used for job 13812, parameterised.
--
-- The model never sees the internal job_number; the app supplies it in payload.job.job_number
-- (user-entered). created_by/imported_by/uploaded_by come from the signed-in user's
-- freelancer_id (see the commit route's getCurrentFreelancerId).
--
-- NOTE on existing automation: inserting the job fires your app's triggers, which auto-create
-- a "Job Overhead" quote line (quote_id NULL, import_sequence 0), an overhead scope item, and
-- a work order. The imported quote lines are numbered 1..N, so there is no collision with the
-- overhead line at sequence 0.

create or replace function public.import_quote(payload jsonb, p_uploaded_by int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id     int;
  v_quote_id   int;
  v_job_number text := payload->'job'->>'job_number';
  v_lines      int;
  v_doc        jsonb := payload->'document';
begin
  if v_job_number is null or length(trim(v_job_number)) = 0 then
    raise exception 'job_number is required';
  end if;
  if exists (select 1 from tbl_production_plan where job_number = v_job_number) then
    raise exception 'job_number % already exists', v_job_number;
  end if;

  insert into tbl_production_plan
    (job_number, job_name, event_date, event_location, pm_note, job_status, created_by)
  values
    (v_job_number,
     payload->'job'->>'job_name',
     nullif(payload->'job'->>'event_date','')::timestamptz,
     nullif(payload->'job'->>'event_location',''),
     nullif(payload->'job'->>'pm_note',''),
     coalesce(nullif(payload->'job'->>'job_status',''), 'Active'),
     p_uploaded_by)
  returning job_id into v_job_id;

  insert into tbl_quotes
    (job_id, quote_reference, quote_version, quote_description, status, imported_by, imported_at)
  values
    (v_job_id,
     nullif(payload->'quote'->>'quote_reference',''),
     nullif(payload->'quote'->>'quote_version',''),
     nullif(payload->'quote'->>'quote_description',''),
     coalesce(nullif(payload->'quote'->>'status',''), 'Draft'),
     p_uploaded_by,
     now())
  returning quote_id into v_quote_id;

  insert into tbl_quote_lines
    (quote_id, job_id, line_number, import_sequence, line_text, line_value,
     event_zone, line_sub_group, category, pm_note)
  select
    v_quote_id, v_job_id,
    ln.ord::text,
    ln.ord::int,
    ln.elem->>'line_text',
    (ln.elem->>'line_value')::numeric,
    nullif(ln.elem->>'event_zone',''),
    nullif(ln.elem->>'line_sub_group',''),
    coalesce(nullif(ln.elem->>'category',''), 'Provisional'),
    nullif(ln.elem->>'pm_note','')
  from jsonb_array_elements(payload->'lines') with ordinality as ln(elem, ord);

  get diagnostics v_lines = row_count;

  -- Record the quote PDF as a job-level document (scope_item_id / work_order_id NULL),
  -- and keep the confirmed AI extraction as an audit trail in the purpose-built columns.
  if v_doc is not null and (v_doc->>'onedrive_path') is not null then
    insert into tbl_wo_documents
      (job_id, doc_type, file_name, onedrive_path, onedrive_item_id, file_size,
       mime_type, caption, uploaded_by, extraction_status, extracted_data)
    values
      (v_job_id,
       'reference',
       v_doc->>'file_name',
       v_doc->>'onedrive_path',
       nullif(v_doc->>'onedrive_item_id',''),
       nullif(v_doc->>'file_size','')::int,
       coalesce(nullif(v_doc->>'mime_type',''), 'application/pdf'),
       coalesce(nullif(v_doc->>'caption',''), 'Imported quote'),
       p_uploaded_by,
       coalesce(nullif(v_doc->>'extraction_status',''),
                case when v_doc ? 'extracted_data' then 'confirmed' else null end),
       v_doc->'extracted_data');
  end if;

  return jsonb_build_object('job_id', v_job_id, 'quote_id', v_quote_id, 'lines_inserted', v_lines);
end;
$$;

-- Locked down: only the service role (used by the server route) may execute.
revoke all on function public.import_quote(jsonb, int) from public, anon, authenticated;
grant execute on function public.import_quote(jsonb, int) to service_role;
