-- Заказы крафтов пользователя (синхронизация между устройствами)
CREATE TABLE IF NOT EXISTS user_craft_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  display_number INT UNSIGNED NOT NULL,
  title VARCHAR(512) NOT NULL,
  deadline_hours SMALLINT UNSIGNED NULL,
  deadline_set_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_craft_orders_user_display (user_id, display_number),
  KEY idx_user_craft_orders_user (user_id),
  CONSTRAINT fk_user_craft_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_craft_order_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  recipe_favorite_id VARCHAR(2048) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  done TINYINT(1) NOT NULL DEFAULT 0,
  done_at DATETIME NULL,
  sort_index INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_user_craft_order_lines_order (order_id),
  CONSTRAINT fk_user_craft_order_lines_order FOREIGN KEY (order_id) REFERENCES user_craft_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
