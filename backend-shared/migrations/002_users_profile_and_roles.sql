ALTER TABLE users
  ADD COLUMN nickname VARCHAR(64) NULL AFTER email,
  ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' AFTER password_hash,
  ADD COLUMN avatar_url VARCHAR(512) NULL AFTER role;

UPDATE users
SET nickname = CONCAT('user_', id)
WHERE nickname IS NULL OR nickname = '';

ALTER TABLE users
  MODIFY COLUMN nickname VARCHAR(64) NOT NULL,
  ADD UNIQUE KEY uq_users_nickname (nickname),
  ADD KEY idx_users_role (role);

