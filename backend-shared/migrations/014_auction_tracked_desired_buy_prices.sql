CREATE TABLE IF NOT EXISTS auction_tracked_desired_buy_prices (
  user_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  desired_buy_price VARCHAR(64) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, item_id),
  KEY idx_atdbp_item_id (item_id),
  CONSTRAINT fk_atdbp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
