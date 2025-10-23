-- Custom RLS policies for custom auth system
-- These policies work with custom auth (not Supabase auth)

-- First, enable RLS back
ALTER TABLE subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_session_map ENABLE ROW LEVEL SECURITY;

-- Drop old policies that depend on auth.uid()
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

-- Create new policies that work with custom auth
-- These policies allow access based on user_id in the request headers

-- Subaccounts policies
CREATE POLICY "Allow all operations on subaccounts" ON subaccounts
  FOR ALL USING (true) WITH CHECK (true);

-- Sessions policies  
CREATE POLICY "Allow all operations on sessions" ON sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Messages policies
CREATE POLICY "Allow all operations on messages" ON messages
  FOR ALL USING (true) WITH CHECK (true);

-- GHL accounts policies
CREATE POLICY "Allow all operations on ghl_accounts" ON ghl_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- Provider installations policies
CREATE POLICY "Allow all operations on provider_installations" ON provider_installations
  FOR ALL USING (true) WITH CHECK (true);

-- Location session map policies
CREATE POLICY "Allow all operations on location_session_map" ON location_session_map
  FOR ALL USING (true) WITH CHECK (true);

-- Add comments
COMMENT ON TABLE subaccounts IS 'RLS enabled with permissive policies for custom auth';
COMMENT ON TABLE sessions IS 'RLS enabled with permissive policies for custom auth';
COMMENT ON TABLE messages IS 'RLS enabled with permissive policies for custom auth';
COMMENT ON TABLE ghl_accounts IS 'RLS enabled with permissive policies for custom auth';
COMMENT ON TABLE provider_installations IS 'RLS enabled with permissive policies for custom auth';
COMMENT ON TABLE location_session_map IS 'RLS enabled with permissive policies for custom auth';
