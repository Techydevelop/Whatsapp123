-- Enable RLS
-- Supabase manages JWT secret automatically; do not set app.jwt_secret here

-- Create subaccounts table
CREATE TABLE IF NOT EXISTS subaccounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ghl_location_id TEXT,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subaccount_id UUID REFERENCES subaccounts(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT,
  status TEXT DEFAULT 'initializing' CHECK (status IN ('initializing', 'qr', 'ready', 'disconnected')),
  qr TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subaccount_id UUID REFERENCES subaccounts(id) ON DELETE CASCADE NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  media_url TEXT,
  media_mime TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create GHL accounts table (agency/company level)
CREATE TABLE IF NOT EXISTS ghl_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('Company', 'Location')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create provider installations table (mapping per location)
CREATE TABLE IF NOT EXISTS provider_installations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subaccount_id UUID REFERENCES subaccounts(id) ON DELETE CASCADE NOT NULL,
  ghl_location_id TEXT NOT NULL,
  conversation_provider_id TEXT NOT NULL,
  ghl_access_token TEXT NOT NULL,
  ghl_refresh_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create location session map table (which WA session handles which location)
CREATE TABLE IF NOT EXISTS location_session_map (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subaccount_id UUID REFERENCES subaccounts(id) ON DELETE CASCADE NOT NULL,
  ghl_location_id TEXT NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_session_map ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (with IF NOT EXISTS)
DO $$ 
BEGIN
  -- Subaccounts policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subaccounts' AND policyname = 'Users can view their own subaccounts') THEN
    CREATE POLICY "Users can view their own subaccounts" ON subaccounts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subaccounts' AND policyname = 'Users can insert their own subaccounts') THEN
    CREATE POLICY "Users can insert their own subaccounts" ON subaccounts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subaccounts' AND policyname = 'Users can update their own subaccounts') THEN
    CREATE POLICY "Users can update their own subaccounts" ON subaccounts FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subaccounts' AND policyname = 'Users can delete their own subaccounts') THEN
    CREATE POLICY "Users can delete their own subaccounts" ON subaccounts FOR DELETE USING (auth.uid() = user_id);
  END IF;

  -- Sessions policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sessions' AND policyname = 'Users can view their own sessions') THEN
    CREATE POLICY "Users can view their own sessions" ON sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sessions' AND policyname = 'Users can insert their own sessions') THEN
    CREATE POLICY "Users can insert their own sessions" ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sessions' AND policyname = 'Users can update their own sessions') THEN
    CREATE POLICY "Users can update their own sessions" ON sessions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sessions' AND policyname = 'Users can delete their own sessions') THEN
    CREATE POLICY "Users can delete their own sessions" ON sessions FOR DELETE USING (auth.uid() = user_id);
  END IF;

  -- Messages policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Users can view their own messages') THEN
    CREATE POLICY "Users can view their own messages" ON messages FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Users can insert their own messages') THEN
    CREATE POLICY "Users can insert their own messages" ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  -- GHL accounts policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ghl_accounts' AND policyname = 'Users can view their own GHL accounts') THEN
    CREATE POLICY "Users can view their own GHL accounts" ON ghl_accounts FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ghl_accounts' AND policyname = 'Users can insert their own GHL accounts') THEN
    CREATE POLICY "Users can insert their own GHL accounts" ON ghl_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ghl_accounts' AND policyname = 'Users can update their own GHL accounts') THEN
    CREATE POLICY "Users can update their own GHL accounts" ON ghl_accounts FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  -- Provider installations policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_installations' AND policyname = 'Users can view their own provider installations') THEN
    CREATE POLICY "Users can view their own provider installations" ON provider_installations FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_installations' AND policyname = 'Users can insert their own provider installations') THEN
    CREATE POLICY "Users can insert their own provider installations" ON provider_installations FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_installations' AND policyname = 'Users can update their own provider installations') THEN
    CREATE POLICY "Users can update their own provider installations" ON provider_installations FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'provider_installations' AND policyname = 'Users can delete their own provider installations') THEN
    CREATE POLICY "Users can delete their own provider installations" ON provider_installations FOR DELETE USING (auth.uid() = user_id);
  END IF;

  -- Location session map policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_session_map' AND policyname = 'Users can view their own location session map') THEN
    CREATE POLICY "Users can view their own location session map" ON location_session_map FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_session_map' AND policyname = 'Users can insert their own location session map') THEN
    CREATE POLICY "Users can insert their own location session map" ON location_session_map FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_session_map' AND policyname = 'Users can update their own location session map') THEN
    CREATE POLICY "Users can update their own location session map" ON location_session_map FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_session_map' AND policyname = 'Users can delete their own location session map') THEN
    CREATE POLICY "Users can delete their own location session map" ON location_session_map FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Enable Realtime (with IF NOT EXISTS check)
DO $$ 
BEGIN
  -- Add messages table to realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  
  -- Add sessions table to realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'sessions'
  ) THEN
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
END $$;