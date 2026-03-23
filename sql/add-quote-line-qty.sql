-- Add quantity and unit_price to tbl_quote_lines
-- line_value remains the total (qty × unit_price when both present)
-- Both nullable — lump-sum lines have only line_value, no breakdown

ALTER TABLE tbl_quote_lines ADD COLUMN IF NOT EXISTS quantity DECIMAL;
ALTER TABLE tbl_quote_lines ADD COLUMN IF NOT EXISTS unit_price DECIMAL;
