-- ============================================
-- Migration 013: Booking Weights (Dynamic Weight Selection)
-- ============================================
-- Add booking_weights to app_settings for admin-configurable weight options
-- ============================================

INSERT INTO app_settings (key, value, updated_at)
VALUES ('booking_weights', '{"gold":[1,5,10,50],"silver":[10,100,1000]}', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
