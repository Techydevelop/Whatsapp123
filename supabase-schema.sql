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
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create GHL accounts table (agency/company level)
CREATE TABLE IF NOT EXISTS ghl_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  company_id TEXT NOT NULL,
  location_id TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create GHL location tokens table (location-specific)
CREATE TABLE IF NOT EXISTS ghl_location_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ghl_account_id UUID REFERENCES ghl_accounts(id) ON DELETE CASCADE NOT NULL,
  location_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, location_id)
);

-- Enable RLS on all tables
ALTER TABLE subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_location_tokens ENABLE ROW LEVEL SECURITY;

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

  -- GHL location tokens policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ghl_location_tokens' AND policyname = 'Users can view their own GHL location tokens') THEN
    CREATE POLICY "Users can view their own GHL location tokens" ON ghl_location_tokens FOR SELECT USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ghl_location_tokens' AND policyname = 'Users can insert their own GHL location tokens') THEN
    CREATE POLICY "Users can insert their own GHL location tokens" ON ghl_location_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ghl_location_tokens' AND policyname = 'Users can update their own GHL location tokens') THEN
    CREATE POLICY "Users can update their own GHL location tokens" ON ghl_location_tokens FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ghl_location_tokens' AND policyname = 'Users can delete their own GHL location tokens') THEN
    CREATE POLICY "Users can delete their own GHL location tokens" ON ghl_location_tokens FOR DELETE USING (auth.uid() = user_id);
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