CREATE TABLE IF NOT EXISTS auction_virtual_active_lot_mins (
  kind VARCHAR(16) NOT NULL,
  quality VARCHAR(32) NOT NULL,
  upgrade SMALLINT NOT NULL,
  min_price BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (kind, quality, upgrade),
  KEY idx_aval_item_id (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

