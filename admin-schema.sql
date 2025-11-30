-- Create separate admin_users table for admin panel
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin', -- 'admin', 'superadmin'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);

-- Create admin_actions table to track admin activities
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL, -- 'user_created', 'user_updated', 'plan_changed', 'subaccount_added', 'email_sent', 'subaccount_removed'
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user_id ON admin_actions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at);

-- Create first superadmin user in admin_users table
-- Email: abjandal@superadmin.com
-- Password: Abujandal19!

INSERT INTO admin_users (email, name, password, role, is_active, created_at)
VALUES (
  'abjandal@superadmin.com',
  'Super Admin',
  '$2a$10$GVSJLLkRUHhbZxU9rRo0TuTn14/jI7bWaQK2vBZ9QBlWDGA7r0Apa',
  'superadmin',
  true,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  role = 'superadmin',
  password = '$2a$10$GVSJLLkRUHhbZxU9rRo0TuTn14/jI7bWaQK2vBZ9QBlWDGA7r0Apa',
  is_active = true,
  updated_at = NOW();

