-- ============================================================================
-- SIMPLE SaaS Database Cleanup Script (Guaranteed to Work!)
-- ============================================================================
-- This is a simplified version that uses CASCADE everywhere
-- Run this in Supabase SQL Editor
-- ============================================================================

BEGIN;

-- Drop everything with CASCADE (no dependency errors!)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS connection_logs CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;

-- Drop the trigger function (CASCADE handles all triggers)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Remove customer_id columns from existing tables
ALTER TABLE IF EXISTS sessions 
DROP COLUMN IF EXISTS customer_id CASCADE;

ALTER TABLE IF EXISTS ghl_accounts 
DROP COLUMN IF EXISTS customer_id CASCADE;

COMMIT;

-- ============================================================================
-- DONE! Simple and Clean!
-- ============================================================================

