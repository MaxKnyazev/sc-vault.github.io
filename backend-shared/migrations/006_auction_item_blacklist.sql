CREATE TABLE IF NOT EXISTS auction_item_blacklist (
  item_id VARCHAR(64) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (item_id),
  KEY idx_auction_item_blacklist_created_at (created_at),
  CONSTRAINT fk_auction_item_blacklist_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
