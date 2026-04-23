-- ============================================================
-- GROSVENOR HOTEL WEDDING - Job 13725 V3
-- Run in Supabase SQL Editor
-- Creates: 1 job + 1 quote + all quote lines with qty/unit_price
-- ============================================================

-- 1. CREATE JOB
INSERT INTO tbl_production_plan (job_number, job_name, client_name, event_location, job_status)
VALUES ('13725', 'Wedding at Grosvenor Hotel V3', 'Fait Accompli', 'Grosvenor Hotel, London', 'Active')
ON CONFLICT DO NOTHING;

-- Get the job_id
DO $$
DECLARE
  v_job_id INT;
  v_quote_id INT;
BEGIN
  SELECT job_id INTO v_job_id FROM tbl_production_plan WHERE job_number = '13725' LIMIT 1;

  -- 2. CREATE QUOTE
  INSERT INTO tbl_quotes (job_id, quote_reference, quote_version, quote_description, quote_value, quote_date, status, imported_at)
  VALUES (v_job_id, '40656', 'v16', 'Wedding at Grosvenor Hotel V3', 377340.00, '2026-03-06', 'Accepted', NOW())
  RETURNING quote_id INTO v_quote_id;

  -- 3. INSERT ALL QUOTE LINES
  -- ========== BALLROOM FOYER ==========
  INSERT INTO tbl_quote_lines (quote_id, job_id, line_number, import_sequence, line_text, quantity, unit_price, line_value, event_zone, category) VALUES
  (v_quote_id, v_job_id, '1', 1, 'Carpet Runner within Ballroom foyer. Finished in velour quality carpet. Including installation and removal', 1, 3200.00, 3200.00, 'Ballroom Foyer', 'Provisional'),
  (v_quote_id, v_job_id, '2', 2, 'Pleated Green polyline wall to back the placement table area and hide. 7m. NOT including p-lights', 7, 250.00, 1750.00, 'Ballroom Foyer', 'Provisional'),
  (v_quote_id, v_job_id, '3', 3, 'P-light curtain to front of pleated green wall listed above', 1, 2815.00, 2815.00, 'Ballroom Foyer', 'Provisional'),
  (v_quote_id, v_job_id, '4', 4, 'Bespoke mirror faceted placement tables. Allowing for 6 x units', 6, 750.00, 4500.00, 'Ballroom Foyer', 'Provisional'),
  (v_quote_id, v_job_id, '5', 5, 'Mirror faceted drum plinth to support central olive tree feature. Tree provided by others', 1, 850.00, 850.00, 'Ballroom Foyer', 'Provisional'),

  -- ========== BALLROOM RECEPTION ==========
  (v_quote_id, v_job_id, '6', 6, 'Large oval dispense bar for drinks reception in Ballroom. Mirror faceted frontage, mirror tops with a dark green suede bumper. Allowing for 15 units', 15, 450.00, 6750.00, 'Ballroom Reception', 'Provisional'),
  (v_quote_id, v_job_id, '7', 7, 'Large central plinth within bar to hold a large Olive tree. Made to match with the bar', 1, 850.00, 850.00, 'Ballroom Reception', 'Provisional'),
  (v_quote_id, v_job_id, '8', 8, 'Small raised performance stage suitable for quartet with Mirror facetted fascia', 1, 1900.00, 1900.00, 'Ballroom Reception', 'Provisional'),
  (v_quote_id, v_job_id, '9', 9, 'Allowance for background music system for entrance area in Ballroom Lobby. Including control and playback', 1, 1275.00, 1275.00, 'Ballroom Reception', 'Subcontracted'),
  (v_quote_id, v_job_id, '10', 10, 'Small Left/Right PA to stage in Ballroom. House PA for delay/fill subject to site visit. Venue charges apply. Assume billed to client', 1, 1050.00, 1050.00, 'Ballroom Reception', 'Subcontracted'),
  (v_quote_id, v_job_id, '11', 11, 'Allowance for control and playback for Ballroom Reception. Including 2 x radio mics for any speeches/announcements', 1, 1600.00, 1600.00, 'Ballroom Reception', 'Subcontracted'),
  (v_quote_id, v_job_id, '12', 12, 'Allowance for mics, monitors and mixing for background music quartet. Subject to riders', 1, 1400.00, 1400.00, 'Ballroom Reception', 'Subcontracted'),
  (v_quote_id, v_job_id, '13', 13, 'Option for mics, in ear monitors and mixing for 6 violinists in Ballroom Lobby if required. Subject to riders', 1, 2750.00, 2750.00, 'Ballroom Reception', 'Subcontracted'),

  -- ========== LIGHTING BR ==========
  (v_quote_id, v_job_id, '14', 14, 'Lighting to bar in Ballroom Reception', 1, 400.00, 400.00, 'Lighting BR', 'Subcontracted'),
  (v_quote_id, v_job_id, '15', 15, 'Highlighting to placement tables', 1, 400.00, 400.00, 'Lighting BR', 'Subcontracted'),
  (v_quote_id, v_job_id, '16', 16, 'P-light drops to Olive trees x 2', 2, 915.00, 1830.00, 'Lighting BR', 'Subcontracted'),
  (v_quote_id, v_job_id, '17', 17, 'Uplighters within ballroom to highlight venue architecture. Allowing for 24 x units', 24, 45.00, 1080.00, 'Lighting BR', 'Subcontracted'),
  (v_quote_id, v_job_id, '18', 18, 'Highlight to cypress trees allowing for 10 trees', 20, 45.00, 900.00, 'Lighting BR', 'Subcontracted'),

  -- ========== LINKING CORRIDOR ==========
  (v_quote_id, v_job_id, '19', 19, 'Mirror Hallway to link corridor. 10m Long x 2m Wide. Mirror panels and low profile floor to conceal existing architecture', 1, 8500.00, 8500.00, 'Linking Corridor', 'Provisional'),
  (v_quote_id, v_job_id, '20', 20, 'LED video Light balls to animate mirror corridor. Increase in Bulb number in lieu of p-lights', 1, 2900.00, 2900.00, 'Linking Corridor', 'Subcontracted'),
  (v_quote_id, v_job_id, '21', 21, 'Mirror floor to tie the linking corridor to the entrance into Great room. Allowing for floor only', 1, 3800.00, 3800.00, 'Linking Corridor', 'Provisional'),
  (v_quote_id, v_job_id, '22', 22, 'Star cloth to line sides of mirror corridor. To replace the mirror and p-light walls', 2, 1100.00, 2200.00, 'Linking Corridor', 'Subcontracted'),

  -- ========== ASSEMBLY FOYER ==========
  (v_quote_id, v_job_id, '23', 23, 'Mirrored Floor to create entranceway into Great Room. Approx 6m Wide and 13m Long', 1, 6600.00, 6600.00, 'Assembly Foyer', 'Provisional'),
  (v_quote_id, v_job_id, '24', 24, 'Pleated Midnight Blue fabric to link Mirror Hallway to Great room stairs and hide unwanted areas', 17, 200.00, 3400.00, 'Assembly Foyer', 'Provisional'),
  (v_quote_id, v_job_id, '25', 25, 'Low plinths to hold violinists on the Assembly Foyer. Allowing for 6 x units', 6, 250.00, 1500.00, 'Assembly Foyer', 'Provisional'),

  -- ========== ENTRANCE MOMENT ==========
  (v_quote_id, v_job_id, '26', 26, 'Raised entrance stage built into existing staircase with bespoke infills. Black gloss floor and navy glitter fascia. Set at 1m High', 1, 3200.00, 3200.00, 'Entrance Moment', 'Provisional'),
  (v_quote_id, v_job_id, '27', 27, 'Large 5m diameter decorative curved treads to form grand entrance. Finished in navy glitter with space for LED trim to each step', 1, 4200.00, 4200.00, 'Entrance Moment', 'Provisional'),
  (v_quote_id, v_job_id, '28', 28, 'Pergola style structure and decorative handrail built over each side of the entrance staircase. To be dressed by florists to enhance entrance moment', 2, 2200.00, 4400.00, 'Entrance Moment', 'Provisional'),
  (v_quote_id, v_job_id, '29', 29, 'Warm and Cold, twinkling P-Light installation to entrance Pergolas', 2, 1770.00, 3540.00, 'Entrance Moment', 'Subcontracted'),
  (v_quote_id, v_job_id, '30', 30, 'Bespoke lining to back entranceway and conceal cave behind. Inclusive of rigging, support and lining', 1, 3800.00, 3800.00, 'Entrance Moment', 'Provisional'),
  (v_quote_id, v_job_id, '31', 31, 'Warm and Cold, Twinkling P-Light installation to entrance back Wall', 1, 3185.00, 3185.00, 'Entrance Moment', 'Subcontracted'),

  -- ========== GREAT ROOM ==========
  (v_quote_id, v_job_id, '32', 32, 'Central Stage suitable for DJ and small band', 11, 200.00, 2200.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '33', 33, 'Decorative stage fascia to tie dancefloor and stage together', 1, 1950.00, 1950.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '34', 34, 'Bespoke DJ booth for main stage. Navy glitter with mirror detail', 1, 850.00, 850.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '35', 35, 'Semi-circular bespoke dancefloor finished in dark navy laminate with mirror inserts. Based on 13m Diameter to accommodate guest numbers', 1, 12000.00, 12000.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '36', 36, 'Cocktail bars either side of the main stage. Navy glitter base with a mirrored underlit LED cocktail shelf. 12ft wide x 2', 4, 850.00, 3400.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '37', 37, 'Decorative back bars. Navy blue shelve unit with mirror backing and LED. 6 x units (3 per side)', 6, 450.00, 2700.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '38', 38, 'Large Bespoke 11m dispense bar set under the balcony. Navy glitter base with a mirrored underlit LED cocktail shelf', 6, 850.00, 5100.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '39', 39, 'Navy blue shelve unit with mirror backing and LED. The base finished in Navy Blue glitter. 6 x units', 6, 450.00, 2700.00, 'Great Room', 'Provisional'),

  (v_quote_id, v_job_id, '40', 40, 'Bespoke hand pleated lining in dark Navy to back the main cocktail bar under the balcony. Allow for 25m of running length', 25, 200.00, 5000.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '41', 41, 'P-light curtain to front of hand pleated wall under balcony', 1, 3395.00, 3395.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '42', 42, 'Star cloth to line the balcony concealing handrail and venue architecture. Including labour, installation transportation. Venue charges apply. Assume billed to client', 2, 6300.00, 12600.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '43', 43, 'Star cloth to underside of the far end balcony. Rigged off pipe and drape', 2, 1100.00, 2200.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '44', 44, 'Allowance for ground stacked Main Stage PA and fills utilising in-house delays. Venue charges apply. Assume billed to client', 1, 4500.00, 4500.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '45', 45, 'Delay speakers to cover under balcony areas', 1, 950.00, 950.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '46', 46, 'Allowance for mics for speeches, playback & control', 1, 1800.00, 1800.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '47', 47, 'Allowance for DJ equipment, mics, monitors and mixing desks for DJ with live musicians such as ALR Live. Subject to riders', 1, 3750.00, 3750.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '48', 48, 'Assumes DJ equipment included in live act costs. Subject to riders for additional DJs', 1, 1500.00, 1500.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '49', 49, 'Assume use of house PA for rink bar area if used. Venue charges apply. Assume billed to client', 1, 0.00, 0.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '50', 50, 'Bespoke circular Love Seats built to accommodate cypress trees. Dark navy velvet finish. Allowing for 4 x complete units. Cypress trees to be provided by others', 4, 4600.00, 18400.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '51', 51, 'Line and conceal the 4 large balcony columns opposite the stage. With hand pleated navy blue lining', 4, 500.00, 2000.00, 'Great Room', 'Provisional'),

  (v_quote_id, v_job_id, '52', 52, 'Mirror backed trellis panels to back stage and front pillars of the balcony columns as per plan. Reduced to 4 x Units. Stage Set to be made up of LED Panels', 4, 950.00, 3800.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '53', 53, 'Bespoke Head Table drop overs. Mirror inserts with Navy velour bumper. Supporting trestles and cloths by others', 4, 850.00, 3400.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '54', 54, 'Machine cut table tops for the long tables within dining (not the head table). Approx 20ft tables x 8 off @ £425. Tables and cloths provided by others', 8, 425.00, 3400.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '55', 55, 'Bespoke drum plinths to support twilight trees (by others) x 2 units. Glitter fabric finish with internal uplighters. Removed from Quote can be re introduced if trees reintroduced', 0, 1100.00, 0.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '56', 56, 'Allowance for sound system in Great Room assembly area', 1, 1950.00, 1950.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '57', 57, 'Allowance for Velour drapes and off the roll fabric to conceal service/unwanted areas within ballroom where required. Subject to final requirement', 1, 3000.00, 3000.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '58', 58, 'Mirror table runner down the centre for the long tables (not the top table). Allowance for 8 long tables', 8, 650.00, 5200.00, 'Great Room', 'Provisional'),
  (v_quote_id, v_job_id, '59', 59, 'High-res LED panels to create animated stage backdrop. 5 of 1m x 4mH totems', 5, 1550.00, 7750.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '60', 60, 'Generic content, servers and control equipment. Additional and bespoke video content to be charged on separately', 1, 1600.00, 1600.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '61', 61, 'Video crew for installation, event day and de-rig. Also includes transportation of all video equipment', 1, 6500.00, 6500.00, 'Great Room', 'Subcontracted'),
  (v_quote_id, v_job_id, '62', 62, 'Long Table Mirror runners for the now 8 long tables. Bronze mirror, to match top table, runner at 0.5m wide with shaped D ends to match the shape of the table. 8 x units', 8, 750.00, 6000.00, 'Great Room', 'Provisional'),

  -- ========== CEILING PANEL ==========
  (v_quote_id, v_job_id, '63', 63, 'Motorised rigging and trussing to fly bespoke ceiling panel. N.B Requires access ahead of current scheduled timings', 1, 6500.00, 6500.00, 'Ceiling Panel', 'Subcontracted'),
  (v_quote_id, v_job_id, '64', 64, 'Bespoke shaped ceiling panels pre fabricated off-site with cascading p-light drops. Mounted on-site to rigging frame costed above', 1, 21500.00, 21500.00, 'Ceiling Panel', 'Provisional'),

  -- ========== LIGHTING GR ==========
  (v_quote_id, v_job_id, '65', 65, 'Stage Lighting Floor Package', 1, 10000.00, 10000.00, 'Lighting GR', 'Subcontracted'),
  (v_quote_id, v_job_id, '66', 66, 'Allowance for LED trim to treads and Bars', 1, 3000.00, 3000.00, 'Lighting GR', 'Subcontracted'),
  (v_quote_id, v_job_id, '67', 67, 'Re-Focus of Venue Lighting in Great room to create a partial room wash and break up. Including Gobos, gels and access equipment', 1, 1500.00, 1500.00, 'Lighting GR', 'Subcontracted'),
  (v_quote_id, v_job_id, '68', 68, 'Upgrade: Additional Lighting to enhance existing venue package enabling a more complete room wash. Include additional lights, associated labour and transport costs. Only possible with prior access to venue before current allowance and with access to cherry picker', 1, 8800.00, 8800.00, 'Lighting GR', 'Subcontracted'),
  (v_quote_id, v_job_id, '69', 69, 'Uplighting throughout Great Room', 32, 45.00, 1440.00, 'Lighting GR', 'Subcontracted'),
  (v_quote_id, v_job_id, '70', 70, 'Lighting to bars in Great Room, left and right of stage', 2, 400.00, 800.00, 'Lighting GR', 'Subcontracted'),
  (v_quote_id, v_job_id, '71', 71, 'Lighting to trees and floral elements. Allowance Only', 1, 2000.00, 2000.00, 'Lighting GR', 'Subcontracted'),
  (v_quote_id, v_job_id, '72', 72, 'Supplementary lighting to bar and seating area, in great room under balcony', 1, 1600.00, 1600.00, 'Lighting GR', 'Subcontracted'),

  -- ========== CREWING & LOGISTICS ==========
  (v_quote_id, v_job_id, '73', 73, 'Transportation of equipment to and from Site for the Ballroom. Allowance only based on 2 x 18t In and Out', 4, 850.00, 3400.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '74', 74, 'Transportation of equipment to and from Site for the Great Room. Allowance only based on 5 x 18t In and Out', 10, 850.00, 8500.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '75', 75, 'Production Management team to manage shifts and crew across build and break down. Team of 2 for 4 shifts', 8, 750.00, 6000.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '76', 76, 'Sound crew to install and remove equipment', 14, 450.00, 6300.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '77', 77, 'Duty sound engineers', 4, 450.00, 1800.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '78', 78, 'Lighting crew to install and remove equipment', 28, 450.00, 12600.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '79', 79, 'Duty Lighting Crew', 4, 450.00, 1800.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '80', 80, 'Design & Decor Team for Build Thursday shift within Ballroom', 8, 450.00, 3600.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '81', 81, 'Design & Decor Team for build Saturday day in Great room and strike Sunday', 28, 450.00, 12600.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '82', 82, 'Fabric team for install within Great room and Ballroom on Saturday', 4, 600.00, 2400.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '83', 83, 'Overnight shift to strike all of Ballroom', 8, 450.00, 3600.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '84', 84, 'Local Crew to assist with load in and removal of all equipment into the Ball Room. Allowance for 8 men for 2 shifts x 8hr call', 128, 40.00, 5120.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '85', 85, 'Local Crew to assist with load in and removal of all equipment into the Great Room. Additional required for lift loading and unloading. Allowance for 14 men for 3 shifts x 8hr call', 336, 40.00, 13440.00, 'Crewing & Logistics', 'Install'),
  (v_quote_id, v_job_id, '86', 86, 'Allowance for Crew transportation. Based on 25 crew', 25, 60.00, 1500.00, 'Crewing & Logistics', 'Install'),

  -- ========== PRODUCTION ==========
  (v_quote_id, v_job_id, '87', 87, 'Design and Production fee. To include sample provisions, show and tell, venue liaison, H&S documentation, plans, detailing and provisional sketch models', 1, 20000.00, 20000.00, 'Production', 'Subcontracted'),
  (v_quote_id, v_job_id, '88', 88, 'Access to venue cherry picker', 1, 520.00, 520.00, 'Production', 'Install'),
  (v_quote_id, v_job_id, '89', 89, 'Disposal and refuse of items back at Starlight Warehouse', 1, 900.00, 900.00, 'Production', 'Install');

  -- Verify totals
  RAISE NOTICE 'Job created: id=%, quote_id=%', v_job_id, v_quote_id;
  RAISE NOTICE 'Lines inserted: %', (SELECT COUNT(*) FROM tbl_quote_lines WHERE quote_id = v_quote_id);
  RAISE NOTICE 'Total value: £%', (SELECT SUM(line_value) FROM tbl_quote_lines WHERE quote_id = v_quote_id);

END $$;
