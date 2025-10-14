-- ============================================================================
-- SaaS Database Tables Cleanup Script
-- ============================================================================
-- This script removes all SaaS-related tables and columns from the database
-- Run this in Supabase SQL Editor to clean up SaaS implementation
--
-- Date: October 15, 2025
-- Purpose: Rollback to original WhatsApp-GHL system (Supabase Auth only)
-- ============================================================================

-- SAFETY CHECK: Make sure you want to delete SaaS data!
-- Uncomment the line below if you're sure:
-- SET client_min_messages TO WARNING;

BEGIN;

-- ============================================================================
-- STEP 1: Drop Foreign Key Constraints First
-- ============================================================================

-- Drop customer_id foreign keys from existing tables
ALTER TABLE IF EXISTS sessions 
DROP CONSTRAINT IF EXISTS sessions_customer_id_fkey;

ALTER TABLE IF EXISTS ghl_accounts 
DROP CONSTRAINT IF EXISTS ghl_accounts_customer_id_fkey;

ALTER TABLE IF EXISTS connection_logs 
DROP CONSTRAINT IF EXISTS connection_logs_customer_id_fkey;

ALTER TABLE IF EXISTS connection_logs 
DROP CONSTRAINT IF EXISTS connection_logs_session_id_fkey;

ALTER TABLE IF EXISTS notifications 
DROP CONSTRAINT IF EXISTS notifications_customer_id_fkey;

ALTER TABLE IF EXISTS subscriptions 
DROP CONSTRAINT IF EXISTS subscriptions_customer_id_fkey;

ALTER TABLE IF EXISTS otp_verifications
DROP CONSTRAINT IF EXISTS otp_verifications_unique_email;

-- ============================================================================
-- STEP 2: Drop Indexes
-- ============================================================================

-- Drop indexes on SaaS tables
DROP INDEX IF EXISTS idx_customers_email;
DROP INDEX IF EXISTS idx_customers_phone;
DROP INDEX IF EXISTS idx_customers_status;
DROP INDEX IF EXISTS idx_customers_trial_ends_at;

DROP INDEX IF EXISTS idx_admin_users_email;

DROP INDEX IF EXISTS idx_subscriptions_customer_id;
DROP INDEX IF EXISTS idx_subscriptions_status;
DROP INDEX IF EXISTS idx_subscriptions_end_date;

DROP INDEX IF EXISTS idx_connection_logs_customer_id;
DROP INDEX IF EXISTS idx_connection_logs_session_id;
DROP INDEX IF EXISTS idx_connection_logs_event_type;
DROP INDEX IF EXISTS idx_connection_logs_created_at;

DROP INDEX IF EXISTS idx_notifications_customer_id;
DROP INDEX IF EXISTS idx_notifications_status;
DROP INDEX IF EXISTS idx_notifications_type;
DROP INDEX IF EXISTS idx_notifications_created_at;

DROP INDEX IF EXISTS idx_otp_verifications_email;
DROP INDEX IF EXISTS idx_otp_verifications_phone;
DROP INDEX IF EXISTS idx_otp_verifications_expires_at;

-- Drop indexes on customer_id columns in existing tables
DROP INDEX IF EXISTS idx_sessions_customer_id;
DROP INDEX IF EXISTS idx_ghl_accounts_customer_id;

-- ============================================================================
-- STEP 3: Drop Triggers (Must be done before dropping function!)
-- ============================================================================

-- Drop ALL automatic timestamp update triggers
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;

-- Drop the trigger function (CASCADE will drop any remaining dependent triggers)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================================
-- STEP 4: Drop SaaS Tables (in correct order to avoid dependency issues)
-- ============================================================================

-- Drop dependent tables first
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS connection_logs CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS otp_verifications CASCADE;

-- Drop main SaaS tables
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;

-- ============================================================================
-- STEP 5: Remove customer_id Columns from Existing Tables
-- ============================================================================

-- Remove customer_id from sessions table
ALTER TABLE IF EXISTS sessions 
DROP COLUMN IF EXISTS customer_id;

-- Remove customer_id from ghl_accounts table
ALTER TABLE IF EXISTS ghl_accounts 
DROP COLUMN IF EXISTS customer_id;

-- ============================================================================
-- STEP 6: Verification Queries (Optional - Uncomment to verify)
-- ============================================================================

-- Check if SaaS tables are gone
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('customers', 'admin_users', 'subscriptions', 'connection_logs', 'notifications', 'otp_verifications');
-- Expected: 0 rows

-- Check if customer_id columns are removed
-- SELECT column_name 
-- FROM information_schema.columns 
-- WHERE table_name = 'sessions' AND column_name = 'customer_id';
-- Expected: 0 rows

-- Check remaining tables (should only show original tables)
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- ORDER BY table_name;
-- Expected: sessions, ghl_accounts, messages, subaccounts, provider_installations

COMMIT;

-- ============================================================================
-- CLEANUP COMPLETE!
-- ============================================================================

-- What was removed:
-- ✅ customers table
-- ✅ admin_users table
-- ✅ subscriptions table
-- ✅ connection_logs table
-- ✅ notifications table
-- ✅ otp_verifications table
-- ✅ customer_id column from sessions
-- ✅ customer_id column from ghl_accounts
-- ✅ All related indexes
-- ✅ All related triggers
-- ✅ All foreign key constraints

-- What remains (Original WhatsApp-GHL system):
-- ✅ sessions table (user_id linked to Supabase Auth)
-- ✅ ghl_accounts table (user_id linked to Supabase Auth)
-- ✅ messages table
-- ✅ subaccounts table
-- ✅ provider_installations table
-- ✅ Supabase Auth (auth.users) - UNCHANGED

-- System is now back to original state!
-- ============================================================================

