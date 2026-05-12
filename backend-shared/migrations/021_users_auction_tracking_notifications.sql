-- Уведомления о сделках по отслеживанию аукциона (профиль пользователя).
ALTER TABLE users
  ADD COLUMN auction_tracking_notifications TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = показывать тосты/звук по отслеживанию'
  AFTER craft_branch_levels;
