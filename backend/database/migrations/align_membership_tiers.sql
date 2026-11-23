-- Align default membership tiers with the specification (UC-12):
-- Bronze 0 / 0%, Silver 2000 / 5%, Gold 5000 / 10%, Platinum 10000 / 15%.
-- Only rows that still hold the old schema.sql defaults are changed, so tiers an
-- administrator has already configured are left untouched.
UPDATE memberships SET min_points_required = 2000, discount_rate = 5.00
 WHERE rank_name = 'Silver' AND min_points_required = 1000 AND discount_rate = 3.00;
UPDATE memberships SET min_points_required = 5000, discount_rate = 10.00
 WHERE rank_name = 'Gold' AND min_points_required = 3000 AND discount_rate = 5.00;
UPDATE memberships SET min_points_required = 10000, discount_rate = 15.00
 WHERE rank_name = 'Platinum' AND min_points_required = 7000 AND discount_rate = 8.00;
