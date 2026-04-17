ALTER TABLE auction_raw_trades
  ADD COLUMN upgrade_level TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER quality_key,
  DROP KEY idx_auction_raw_trades_item_quality_sold_at,
  ADD KEY idx_auction_raw_item_quality_upgrade_sold_at (item_id, quality_key, upgrade_level, sold_at);

ALTER TABLE auction_hourly_stats
  ADD COLUMN upgrade_level TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER quality_key,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (item_id, quality_key, upgrade_level, hour_start),
  DROP KEY idx_auction_hourly_item_quality_hour,
  ADD KEY idx_auction_hourly_item_quality_upgrade_hour (item_id, quality_key, upgrade_level, hour_start);

ALTER TABLE auction_daily_stats
  ADD COLUMN upgrade_level TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER quality_key,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (item_id, quality_key, upgrade_level, day_date),
  DROP KEY idx_auction_daily_item_quality_day,
  ADD KEY idx_auction_daily_item_quality_upgrade_day (item_id, quality_key, upgrade_level, day_date);
