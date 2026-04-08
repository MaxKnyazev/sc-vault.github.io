CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_tokens_hash (token_hash),
  KEY idx_auth_tokens_user_id (user_id),
  KEY idx_auth_tokens_expires_at (expires_at),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auction_stats (
  item_id VARCHAR(64) NOT NULL,
  window_name VARCHAR(16) NOT NULL,
  avg_per_unit DECIMAL(20,4) NULL,
  total_qty BIGINT UNSIGNED NOT NULL,
  total_revenue DECIMAL(20,2) NOT NULL,
  trade_count INT UNSIGNED NOT NULL,
  fetched_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (item_id, window_name),
  KEY idx_auction_stats_window_fetched (window_name, fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_buy_prices (
  user_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  buy_price VARCHAR(64) NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, item_id),
  KEY idx_user_buy_prices_item_id (item_id),
  CONSTRAINT fk_user_buy_prices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

