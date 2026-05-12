-- Отметки «ингредиент уже добыты» в заказе (по item_id после разложения до базовых).
CREATE TABLE IF NOT EXISTS user_craft_order_ingredient_done (
  order_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(256) NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  done_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (order_id, item_id),
  KEY idx_ocoid_order (order_id),
  CONSTRAINT fk_ocoid_order FOREIGN KEY (order_id) REFERENCES user_craft_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
