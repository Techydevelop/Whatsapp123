-- Add is_active column to used_locations table if it doesn't exist
-- This migration is required for the anti-abuse location tracking system

DO $$ 
BEGIN
  -- Check if is_active column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'used_locations' 
    AND column_name = 'is_active'
  ) THEN
    -- Add is_active column
    ALTER TABLE used_locations 
    ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    
    -- Update all existing records to active
    UPDATE used_locations SET is_active = TRUE WHERE is_active IS NULL;
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_used_locations_is_active ON used_locations(is_active);
    
    RAISE NOTICE '✅ Column is_active added to used_locations table';
  ELSE
    RAISE NOTICE 'Column is_active already exists in used_locations table';
  END IF;
END $$;

-- Add other missing columns if needed
DO $$ 
BEGIN
  -- Add first_used_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'used_locations' 
    AND column_name = 'first_used_at'
  ) THEN
    ALTER TABLE used_locations 
    ADD COLUMN first_used_at TIMESTAMPTZ DEFAULT NOW();
    
    -- Set default value for existing records
    UPDATE used_locations SET first_used_at = created_at WHERE first_used_at IS NULL;
    
    RAISE NOTICE '✅ Column first_used_at added to used_locations table';
  END IF;
  
  -- Add last_active_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'used_locations' 
    AND column_name = 'last_active_at'
  ) THEN
    ALTER TABLE used_locations 
    ADD COLUMN last_active_at TIMESTAMPTZ DEFAULT NOW();
    
    -- Set default value for existing records
    UPDATE used_locations SET last_active_at = created_at WHERE last_active_at IS NULL;
    
    RAISE NOTICE '✅ Column last_active_at added to used_locations table';
  END IF;
  
  -- Add ghl_account_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'used_locations' 
    AND column_name = 'ghl_account_id'
  ) THEN
    ALTER TABLE used_locations 
    ADD COLUMN ghl_account_id UUID;
    
    RAISE NOTICE '✅ Column ghl_account_id added to used_locations table';
  END IF;
END $$;

-- Display success message
SELECT '✅ Migration completed! All required columns added to used_locations table.' as status;

