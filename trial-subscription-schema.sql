-- Add subscription columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial';
-- Status: 'trial', 'active', 'expired', 'cancelled'

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free';
-- Plan: 'free', 'starter', 'professional', 'business'

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP;

-- Limits
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_subaccounts INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_messages_per_month INTEGER DEFAULT 999999; -- Unlimited for trial

-- Stripe
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_trial_ends_at ON users(trial_ends_at);

-- Usage tracking table
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'message_sent', 'message_received', 'subaccount_added'
  location_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);

-- Payment history table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL, -- 'succeeded', 'failed', 'pending'
  plan VARCHAR(50) NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- Track used locations permanently (anti-abuse)
CREATE TABLE IF NOT EXISTS used_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  ghl_account_id UUID, -- Reference to ghl_accounts (can be null if deleted)
  is_active BOOLEAN DEFAULT TRUE,
  first_used_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP,
  deletion_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_used_locations_location_id ON used_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_used_locations_user_id ON used_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_used_locations_email ON used_locations(email);
CREATE INDEX IF NOT EXISTS idx_used_locations_is_active ON used_locations(is_active);

-- Add subscription events tracking
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'trial_started', 'trial_expired', 'upgrade', 'reminder_sent', 'location_blocked'
  plan_name VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at);

