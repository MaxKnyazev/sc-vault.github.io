ALTER TABLE recipe_result_overrides
  MODIFY COLUMN base_amount DECIMAL(10,3) NULL,
  MODIFY COLUMN bonus_amount DECIMAL(10,3) NULL;

