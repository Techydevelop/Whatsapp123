-- Custom Auth RLS Policies
-- These policies work with custom auth system (not Supabase auth)

-- First, enable RLS back
ALTER TABLE subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_session_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
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

DROP POLICY IF EXISTS "Allow all operations on subaccounts" ON subaccounts;
DROP POLICY IF EXISTS "Allow all operations on sessions" ON sessions;
DROP POLICY IF EXISTS "Allow all operations on messages" ON messages;
DROP POLICY IF EXISTS "Allow all operations on ghl_accounts" ON ghl_accounts;
DROP POLICY IF EXISTS "Allow all operations on provider_installations" ON provider_installations;
DROP POLICY IF EXISTS "Allow all operations on location_session_map" ON location_session_map;

-- Create custom auth policies
-- These policies allow access but frontend will filter by user_id for security

-- Subaccounts policies
CREATE POLICY "Custom auth - subaccounts access" ON subaccounts
  FOR ALL USING (true) WITH CHECK (true);

-- Sessions policies  
CREATE POLICY "Custom auth - sessions access" ON sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Messages policies
CREATE POLICY "Custom auth - messages access" ON messages
  FOR ALL USING (true) WITH CHECK (true);

-- GHL accounts policies
CREATE POLICY "Custom auth - ghl_accounts access" ON ghl_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Provider installations policies
CREATE POLICY "Custom auth - provider_installations access" ON provider_installations
  FOR ALL USING (true) WITH CHECK (true);

-- Location session map policies
CREATE POLICY "Custom auth - location_session_map access" ON location_session_map
  FOR ALL USING (true) WITH CHECK (true);

-- Users policies
CREATE POLICY "Custom auth - users access" ON users
  FOR ALL USING (true) WITH CHECK (true);

-- Add comments explaining the approach
COMMENT ON TABLE subaccounts IS 'RLS enabled with permissive policies - security handled by frontend filtering';
COMMENT ON TABLE sessions IS 'RLS enabled with permissive policies - security handled by frontend filtering';
COMMENT ON TABLE messages IS 'RLS enabled with permissive policies - security handled by frontend filtering';
COMMENT ON TABLE ghl_accounts IS 'RLS enabled with permissive policies - security handled by frontend filtering';
COMMENT ON TABLE provider_installations IS 'RLS enabled with permissive policies - security handled by frontend filtering';
COMMENT ON TABLE location_session_map IS 'RLS enabled with permissive policies - security handled by frontend filtering';
COMMENT ON TABLE users IS 'RLS enabled with permissive policies - security handled by frontend filtering';

-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('subaccounts', 'sessions', 'messages', 'ghl_accounts', 'provider_installations', 'location_session_map', 'users');
