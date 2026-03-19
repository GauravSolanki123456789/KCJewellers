-- ============================================
-- Migration 025: Customer Analytics (user_activity_logs)
-- Gaurav Softwares - KC Jewellers
-- ============================================
-- Run: npm run migrate
-- ============================================

CREATE TABLE IF NOT EXISTS user_activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    action_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_session_id ON user_activity_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action_type ON user_activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);

-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 025 completed: user_activity_logs table created';
END $$;
