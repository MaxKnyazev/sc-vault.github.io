ALTER TABLE user_craft_orders
  ADD COLUMN minimize_surplus TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1: floor crafts + buy remainder; 0: ceil crafts, surplus to pool';
