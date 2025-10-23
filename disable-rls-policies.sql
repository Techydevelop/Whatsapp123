-- Disable RLS policies for custom auth system
-- This allows frontend to directly access Supabase without authentication issues

-- Disable RLS on all tables
ALTER TABLE subaccounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE provider_installations DISABLE ROW LEVEL SECURITY;
ALTER TABLE location_session_map DISABLE ROW LEVEL SECURITY;

-- Drop existing policies (optional - they won't work anyway with RLS disabled)
DROP POLICY IF EXISTS "Users can view their own subaccounts" ON subaccounts;
DROP POLICY IF EXISTS "Users can insert their own subaccounts" ON subaccounts;
DROP POLICY IF EXISTS "Users can update their own subaccounts" ON subaccounts;
DROP POLICY IF EXISTS "Users can delete their own subaccounts" ON subaccounts;

DROP POLICY IF EXISTS "Users can view their own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON sessions;

DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
DROP POLICY IF EXISTS "Users can insert their own messages" ON messages;

DROP POLICY IF EXISTS "Users can view their own GHL accounts" ON ghl_accounts;
DROP POLICY IF EXISTS "Users can insert their own GHL accounts" ON ghl_accounts;
DROP POLICY IF EXISTS "Users can update their own GHL accounts" ON ghl_accounts;

DROP POLICY IF EXISTS "Users can view their own provider installations" ON provider_installations;

-- Add comment explaining the change
COMMENT ON TABLE subaccounts IS 'RLS disabled - using custom auth system';
COMMENT ON TABLE sessions IS 'RLS disabled - using custom auth system';
COMMENT ON TABLE messages IS 'RLS disabled - using custom auth system';
COMMENT ON TABLE ghl_accounts IS 'RLS disabled - using custom auth system';
COMMENT ON TABLE provider_installations IS 'RLS disabled - using custom auth system';
COMMENT ON TABLE location_session_map IS 'RLS disabled - using custom auth system';
