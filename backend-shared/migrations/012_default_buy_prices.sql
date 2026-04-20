CREATE TABLE IF NOT EXISTS default_buy_prices (
  item_id VARCHAR(64) NOT NULL,
  buy_price VARCHAR(64) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (item_id),
  KEY idx_default_buy_prices_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
