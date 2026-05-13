ALTER TABLE users
  ADD COLUMN auction_hybrid_settings JSON NULL
  COMMENT 'User prefs for hybrid craft cost: mode, minTrades, lastSalesCount, timeWindow';
