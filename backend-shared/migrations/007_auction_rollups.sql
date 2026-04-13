CREATE TABLE IF NOT EXISTS auction_hourly_stats (
  item_id VARCHAR(64) NOT NULL,
  hour_start DATETIME NOT NULL,
  total_qty BIGINT UNSIGNED NOT NULL,
  total_revenue DECIMAL(20,2) NOT NULL,
  trade_count INT UNSIGNED NOT NULL,
  avg_per_unit DECIMAL(20,6) NULL,
  source_min_sold_at DATETIME NULL,
  source_max_sold_at DATETIME NULL,
  fetched_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (item_id, hour_start),
  KEY idx_auction_hourly_hour_start (hour_start),
  KEY idx_auction_hourly_item_hour (item_id, hour_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auction_daily_stats (
  item_id VARCHAR(64) NOT NULL,
  day_date DATE NOT NULL,
  total_qty BIGINT UNSIGNED NOT NULL,
  total_revenue DECIMAL(20,2) NOT NULL,
  trade_count INT UNSIGNED NOT NULL,
  avg_per_unit DECIMAL(20,6) NULL,
  source_hours_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  fetched_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (item_id, day_date),
  KEY idx_auction_daily_day_date (day_date),
  KEY idx_auction_daily_item_day (item_id, day_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

