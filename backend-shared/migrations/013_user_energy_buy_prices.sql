CREATE TABLE IF NOT EXISTS user_energy_buy_prices (
  user_id BIGINT UNSIGNED NOT NULL,
  buy_price VARCHAR(64) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_energy_buy_prices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Если на базе уже была колонка users.energy_buy_price (старый вариант), перенесите и удалите её вручную:
-- INSERT INTO user_energy_buy_prices (user_id, buy_price, updated_at)
--   SELECT id, energy_buy_price, UTC_TIMESTAMP() FROM users
--   ON DUPLICATE KEY UPDATE buy_price = VALUES(buy_price), updated_at = VALUES(updated_at);
-- ALTER TABLE users DROP COLUMN energy_buy_price;
