CREATE TABLE IF NOT EXISTS auction_tracked_items (
  item_id VARCHAR(64) NOT NULL,
  added_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (item_id),
  KEY idx_auction_tracked_items_created_at (created_at),
  CONSTRAINT fk_auction_tracked_items_user FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

