CREATE TABLE IF NOT EXISTS auction_user_tracked_item_rules (
  user_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  quality VARCHAR(32) NOT NULL,
  upgrade SMALLINT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, item_id, quality, upgrade),
  KEY idx_autir_item_id (item_id),
  CONSTRAINT fk_autir_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

