CREATE TABLE IF NOT EXISTS auction_user_tracked_items (
  user_id BIGINT UNSIGNED NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, item_id),
  KEY idx_auti_item_id (item_id),
  CONSTRAINT fk_auti_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Сохраняем прежнее поведение: у каждого user/admin копируются текущие глобальные отслеживания.
INSERT INTO auction_user_tracked_items (user_id, item_id, created_at)
SELECT u.id, t.item_id, COALESCE(t.created_at, UTC_TIMESTAMP())
FROM users u
CROSS JOIN auction_tracked_items t
WHERE u.role IN ('user', 'admin')
ON DUPLICATE KEY UPDATE created_at = VALUES(created_at);
