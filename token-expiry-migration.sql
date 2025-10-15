-- Migration: Add token_expires_at column to ghl_accounts table
-- This enables automatic token refresh before expiration

-- Add token_expires_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ghl_accounts' 
    AND column_name = 'token_expires_at'
  ) THEN
    ALTER TABLE ghl_accounts 
    ADD COLUMN token_expires_at TIMESTAMPTZ;
    
    RAISE NOTICE 'Column token_expires_at added to ghl_accounts table';
  ELSE
    RAISE NOTICE 'Column token_expires_at already exists in ghl_accounts table';
  END IF;
END $$;

-- Add location_id column if it doesn't exist (for easier lookups)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ghl_accounts' 
    AND column_name = 'location_id'
  ) THEN
    ALTER TABLE ghl_accounts 
    ADD COLUMN location_id TEXT;
    
    RAISE NOTICE 'Column location_id added to ghl_accounts table';
  ELSE
    RAISE NOTICE 'Column location_id already exists in ghl_accounts table';
  END IF;
END $$;

-- Add conversation_provider_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ghl_accounts' 
    AND column_name = 'conversation_provider_id'
  ) THEN
    ALTER TABLE ghl_accounts 
    ADD COLUMN conversation_provider_id TEXT;
    
    RAISE NOTICE 'Column conversation_provider_id added to ghl_accounts table';
  ELSE
    RAISE NOTICE 'Column conversation_provider_id already exists in ghl_accounts table';
  END IF;
END $$;

-- Create index for better performance on token_expires_at lookups
CREATE INDEX IF NOT EXISTS idx_ghl_accounts_token_expires_at 
ON ghl_accounts(token_expires_at);

CREATE INDEX IF NOT EXISTS idx_ghl_accounts_location_id 
ON ghl_accounts(location_id);

-- Display success message
DO $$ 
BEGIN
  RAISE NOTICE '✅ Token expiry migration completed successfully!';
  RAISE NOTICE '📋 Old accounts will automatically refresh tokens on next use';
END $$;

