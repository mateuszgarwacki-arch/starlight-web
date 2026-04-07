-- ============================================================
-- Material Category Config — Schema + Seed
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add standard_width column to tbl_materials (for floor covering, fabric)
ALTER TABLE tbl_materials ADD COLUMN IF NOT EXISTS standard_width INT;
COMMENT ON COLUMN tbl_materials.standard_width IS 'Standard roll/bolt width in mm. Used for floor covering, fabric.';

-- 2. Create category config table
CREATE TABLE IF NOT EXISTS tbl_material_category_config (
  config_id     SERIAL PRIMARY KEY,
  category_id   INT NOT NULL REFERENCES tbl_master_lookups(lookup_id),
  pricing_unit  VARCHAR(30) NOT NULL DEFAULT 'Each',
  buying_unit   VARCHAR(30) NOT NULL DEFAULT 'Each',
  fixed_dimension VARCHAR(30),        -- which tbl_materials field: standard_length, standard_sheet_size, standard_width
  bin_pack_mode VARCHAR(10) NOT NULL DEFAULT 'none',  -- 1d, 2d, area, none
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id)
);

COMMENT ON TABLE tbl_material_category_config IS 'Defines pricing/buying/packing behaviour per material category';

-- 3. Add Floor Covering to MATERIAL_CATEGORY lookups (if not exists)
INSERT INTO tbl_master_lookups (category, lookup_value, display_order, active)
SELECT 'MATERIAL_CATEGORY', 'Floor Covering', 100, true
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_master_lookups WHERE category = 'MATERIAL_CATEGORY' AND lookup_value = 'Floor Covering'
);

-- 4. Ensure units exist
INSERT INTO tbl_master_lookups (category, lookup_value, display_order, active)
SELECT 'UNIT', v.val, v.ord, true
FROM (VALUES ('M²', 110), ('Linear Metre', 115)) AS v(val, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM tbl_master_lookups WHERE category = 'UNIT' AND lookup_value = v.val
);

-- 5. Seed config for ALL existing categories
-- First, get IDs dynamically
DO $$
DECLARE
  cat_rec RECORD;
  cfg RECORD;
BEGIN
  FOR cat_rec IN
    SELECT lookup_id, lookup_value
    FROM tbl_master_lookups
    WHERE category = 'MATERIAL_CATEGORY' AND active = true
  LOOP
    -- Skip if already configured
    IF EXISTS (SELECT 1 FROM tbl_material_category_config WHERE category_id = cat_rec.lookup_id) THEN
      CONTINUE;
    END IF;

    -- Set defaults based on category name
    CASE cat_rec.lookup_value
      WHEN 'Timber' THEN
        INSERT INTO tbl_material_category_config (category_id, pricing_unit, buying_unit, fixed_dimension, bin_pack_mode, notes)
        VALUES (cat_rec.lookup_id, 'Metre', 'Length', 'standard_length', '1d', 'Priced per metre from supplier, ordered as standard lengths');
      WHEN 'Sheet' THEN
        INSERT INTO tbl_material_category_config (category_id, pricing_unit, buying_unit, fixed_dimension, bin_pack_mode, notes)
        VALUES (cat_rec.lookup_id, 'Sheet', 'Sheet', 'standard_sheet_size', '2d', 'Priced and ordered per full sheet');
      WHEN 'Floor Covering' THEN
        INSERT INTO tbl_material_category_config (category_id, pricing_unit, buying_unit, fixed_dimension, bin_pack_mode, notes)
        VALUES (cat_rec.lookup_id, 'M²', 'Linear Metre', 'standard_width', 'area', 'Priced per m², bought in linear metres of standard width');
      WHEN 'Fabric' THEN
        INSERT INTO tbl_material_category_config (category_id, pricing_unit, buying_unit, fixed_dimension, bin_pack_mode, notes)
        VALUES (cat_rec.lookup_id, 'Metre', 'Metre', 'standard_length', 'none', 'Priced and ordered per linear metre');
      ELSE
        INSERT INTO tbl_material_category_config (category_id, pricing_unit, buying_unit, fixed_dimension, bin_pack_mode, notes)
        VALUES (cat_rec.lookup_id, 'Each', 'Each', NULL, 'none', NULL);
    END CASE;
  END LOOP;
END $$;

-- 6. RLS — single policy per action, get_my_role() pattern
ALTER TABLE tbl_material_category_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mat_cat_config_select" ON tbl_material_category_config;
CREATE POLICY "mat_cat_config_select" ON tbl_material_category_config FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "mat_cat_config_insert" ON tbl_material_category_config;
CREATE POLICY "mat_cat_config_insert" ON tbl_material_category_config FOR INSERT TO authenticated
WITH CHECK (get_my_role() IN ('admin', 'production_manager', 'Production-Manager'));

DROP POLICY IF EXISTS "mat_cat_config_update" ON tbl_material_category_config;
CREATE POLICY "mat_cat_config_update" ON tbl_material_category_config FOR UPDATE TO authenticated
USING (get_my_role() IN ('admin', 'production_manager', 'Production-Manager'));

DROP POLICY IF EXISTS "mat_cat_config_delete" ON tbl_material_category_config;
CREATE POLICY "mat_cat_config_delete" ON tbl_material_category_config FOR DELETE TO authenticated
USING (get_my_role() IN ('admin', 'production_manager', 'Production-Manager'));

-- 7. Index
CREATE INDEX IF NOT EXISTS idx_mat_cat_config_category ON tbl_material_category_config(category_id);
