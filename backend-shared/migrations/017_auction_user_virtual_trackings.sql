CREATE TABLE IF NOT EXISTS auction_user_virtual_trackings (
  user_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,
  quality VARCHAR(32) NOT NULL,
  upgrade_min SMALLINT NOT NULL,
  upgrade_max SMALLINT NOT NULL,
  desired_buy_price VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, kind, quality, upgrade_min, upgrade_max),
  KEY idx_auvt_user (user_id),
  CONSTRAINT fk_auvt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

