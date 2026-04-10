CREATE TABLE IF NOT EXISTS auction_raw_trades (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id VARCHAR(64) NOT NULL,
  sold_at DATETIME NOT NULL,
  amount INT UNSIGNED NOT NULL,
  price DECIMAL(20,2) NOT NULL,
  source_offset INT UNSIGNED NOT NULL,
  source_row_index INT UNSIGNED NOT NULL,
  collected_at DATETIME NOT NULL,
  dedup_key CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auction_raw_trades_dedup (dedup_key),
  KEY idx_auction_raw_trades_item_sold_at (item_id, sold_at),
  KEY idx_auction_raw_trades_sold_at (sold_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

