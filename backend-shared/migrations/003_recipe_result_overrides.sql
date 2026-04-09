CREATE TABLE IF NOT EXISTS recipe_result_overrides (
  recipe_id VARCHAR(512) NOT NULL,
  result_item_id VARCHAR(64) NOT NULL,
  base_amount INT UNSIGNED NULL,
  bonus_amount INT UNSIGNED NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (recipe_id),
  KEY idx_recipe_result_overrides_item (result_item_id),
  KEY idx_recipe_result_overrides_updated_by (updated_by_user_id),
  CONSTRAINT fk_recipe_result_overrides_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

