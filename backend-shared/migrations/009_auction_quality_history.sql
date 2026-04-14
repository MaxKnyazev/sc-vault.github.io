ALTER TABLE auction_raw_trades
  ADD COLUMN quality_key VARCHAR(24) NOT NULL DEFAULT 'normal' AFTER item_id,
  ADD KEY idx_auction_raw_trades_item_quality_sold_at (item_id, quality_key, sold_at);

ALTER TABLE auction_hourly_stats
  ADD COLUMN quality_key VARCHAR(24) NOT NULL DEFAULT 'normal' AFTER item_id,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (item_id, quality_key, hour_start),
  DROP KEY idx_auction_hourly_item_hour,
  ADD KEY idx_auction_hourly_item_quality_hour (item_id, quality_key, hour_start);

ALTER TABLE auction_daily_stats
  ADD COLUMN quality_key VARCHAR(24) NOT NULL DEFAULT 'normal' AFTER item_id,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (item_id, quality_key, day_date),
  DROP KEY idx_auction_daily_item_day,
  ADD KEY idx_auction_daily_item_quality_day (item_id, quality_key, day_date);
