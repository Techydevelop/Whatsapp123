-- WhatsApp GHL SaaS Platform - Database Schema
-- This file creates all new tables for customer management
-- Existing tables (sessions, ghl_accounts, messages) remain unchanged

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: customers - Primary customer account table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    plan VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'cancelled')),
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    subscription_ends_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: admin_users - Admin panel access control
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'support')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 3: subscriptions - Subscription history and billing records
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL CHECK (plan IN ('basic', 'pro', 'enterprise')),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (payment_method IN ('manual', 'stripe', 'paypal')),
    payment_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 4: connection_logs - Audit trail for WhatsApp connection events
CREATE TABLE connection_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('connected', 'disconnected', 'qr_generated', 'error', 'reconnected')),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 5: notifications - Queue for all outbound notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('connection_lost', 'trial_expiring_3days', 'trial_expiring_1day', 'trial_expired', 'subscription_expiring', 'subscription_expired', 'welcome', 'upgrade_success')),
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp', 'both')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 6: otp_verifications - Temporary storage for OTP verification
CREATE TABLE otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email_otp VARCHAR(6) NOT NULL,
    whatsapp_otp VARCHAR(6) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    whatsapp_verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_trial_ends_at ON customers(trial_ends_at);
CREATE INDEX idx_customers_subscription_ends_at ON customers(subscription_ends_at);

CREATE INDEX idx_admin_users_email ON admin_users(email);

CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

CREATE INDEX idx_connection_logs_customer_id ON connection_logs(customer_id);
CREATE INDEX idx_connection_logs_session_id ON connection_logs(session_id);
CREATE INDEX idx_connection_logs_event_type ON connection_logs(event_type);
CREATE INDEX idx_connection_logs_created_at ON connection_logs(created_at);

CREATE INDEX idx_notifications_customer_id ON notifications(customer_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE INDEX idx_otp_verifications_email ON otp_verifications(email);
CREATE INDEX idx_otp_verifications_phone ON otp_verifications(phone);
CREATE INDEX idx_otp_verifications_expires_at ON otp_verifications(expires_at);

-- Database Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add customer_id columns to existing tables (nullable, non-breaking)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
ALTER TABLE ghl_accounts ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Create indexes on new customer_id columns
CREATE INDEX IF NOT EXISTS idx_sessions_customer_id ON sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_ghl_accounts_customer_id ON ghl_accounts(customer_id);

-- Comments for documentation
COMMENT ON TABLE customers IS 'Primary customer account table for SaaS platform';
COMMENT ON TABLE admin_users IS 'Admin panel access control and authentication';
COMMENT ON TABLE subscriptions IS 'Subscription history and billing records';
COMMENT ON TABLE connection_logs IS 'Audit trail for WhatsApp connection events';
COMMENT ON TABLE notifications IS 'Queue for all outbound notifications';
COMMENT ON TABLE otp_verifications IS 'Temporary storage for OTP verification during registration';

-- Success message
SELECT 'Database schema created successfully! All 6 new tables, indexes, triggers, and foreign key constraints are ready.' as status;
