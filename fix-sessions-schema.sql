-- Fix sessions table to make subaccount_id nullable
-- This allows us to use ghl_account.id directly without foreign key constraint

-- First, drop the foreign key constraint
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_subaccount_id_fkey;

-- Make subaccount_id nullable
ALTER TABLE sessions ALTER COLUMN subaccount_id DROP NOT NULL;

-- Add a comment to clarify the new usage
COMMENT ON COLUMN sessions.subaccount_id IS 'References ghl_accounts.id directly, not subaccounts table';
