ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone_offset_hours SMALLINT NOT NULL DEFAULT 0 AFTER avatar_url,
  ADD COLUMN IF NOT EXISTS craft_branch_levels JSON NULL AFTER timezone_offset_hours;

UPDATE users
SET craft_branch_levels = JSON_OBJECT(
  'ammo', 1,
  'pyrotechnics', 1,
  'protectiveGear', 1,
  'engineering', 1,
  'cooking', 1,
  'moonshining', 1,
  'rawMaterials', 1,
  'medicine', 1
)
WHERE craft_branch_levels IS NULL;
