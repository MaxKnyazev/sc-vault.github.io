-- Подписка на конкретный itemId с редкостью и (для артефактов) диапазоном заточки + желаемая цена за единицу.
-- Ядро: upgrade_min = upgrade_max = -1
CREATE TABLE IF NOT EXISTS auction_user_tracked_item_subscriptions (
  user_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  quality VARCHAR(32) NOT NULL,
  upgrade_min SMALLINT NOT NULL,
  upgrade_max SMALLINT NOT NULL,
  desired_buy_price VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, item_id, kind, quality, upgrade_min, upgrade_max),
  KEY idx_autis_item (item_id),
  CONSTRAINT fk_autis_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
