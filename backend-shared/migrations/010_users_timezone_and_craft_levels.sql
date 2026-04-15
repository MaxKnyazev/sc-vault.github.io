ALTER TABLE users
  ADD COLUMN timezone_offset_hours SMALLINT NOT NULL DEFAULT 0 AFTER avatar_url,
  ADD COLUMN craft_branch_levels JSON NULL AFTER timezone_offset_hours;

UPDATE users
SET craft_branch_levels = JSON_OBJECT(
  'cooking', 1,
  'rawMaterials', 1,
  'medicine', 1,
  'weaponModules', 1,
  'armor', 1,
  'other', 1
)
WHERE craft_branch_levels IS NULL;
