-- Database schema updates for webhook implementation
-- Run these commands in your Supabase SQL editor

-- 1. Create ghl_installations table for tracking app installations
CREATE TABLE IF NOT EXISTS ghl_installations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id TEXT UNIQUE NOT NULL,
  app_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  install_type TEXT NOT NULL, -- 'Location' or 'Company'
  location_id TEXT,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  company_name TEXT,
  is_whitelabel BOOLEAN DEFAULT FALSE,
  whitelabel_details JSONB,
  installed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create ghl_conversations table for tracking conversations
CREATE TABLE IF NOT EXISTS ghl_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT UNIQUE NOT NULL,
  location_id TEXT NOT NULL,
  contact_id TEXT,
  phone TEXT,
  last_message TEXT,
  direction TEXT, -- 'inbound' or 'outbound'
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add status and error tracking columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 4. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ghl_installations_company_id ON ghl_installations(company_id);
CREATE INDEX IF NOT EXISTS idx_ghl_installations_location_id ON ghl_installations(location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_installations_user_id ON ghl_installations(user_id);

CREATE INDEX IF NOT EXISTS idx_ghl_conversations_location_id ON ghl_conversations(location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_conversations_contact_id ON ghl_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_conversations_phone ON ghl_conversations(phone);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_status_updated_at ON messages(status_updated_at);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE ghl_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_conversations ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for ghl_installations
CREATE POLICY IF NOT EXISTS "ghl_installations_select_own" ON ghl_installations
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "ghl_installations_insert_own" ON ghl_installations
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "ghl_installations_update_own" ON ghl_installations
  FOR UPDATE USING (auth.uid()::text = user_id);

-- 7. Create RLS policies for ghl_conversations
CREATE POLICY IF NOT EXISTS "ghl_conversations_select_own" ON ghl_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM subaccounts s 
      WHERE s.ghl_location_id = ghl_conversations.location_id 
      AND s.user_id = auth.uid()::text
    )
  );

CREATE POLICY IF NOT EXISTS "ghl_conversations_insert_own" ON ghl_conversations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM subaccounts s 
      WHERE s.ghl_location_id = ghl_conversations.location_id 
      AND s.user_id = auth.uid()::text
    )
  );

CREATE POLICY IF NOT EXISTS "ghl_conversations_update_own" ON ghl_conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM subaccounts s 
      WHERE s.ghl_location_id = ghl_conversations.location_id 
      AND s.user_id = auth.uid()::text
    )
  );

-- 8. Update existing messages table policies to include new columns
-- (These should already exist, but adding for completeness)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' 
    AND policyname = 'messages_select_own'
  ) THEN
    CREATE POLICY "messages_select_own" ON messages
      FOR SELECT USING (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' 
    AND policyname = 'messages_insert_own'
  ) THEN
    CREATE POLICY "messages_insert_own" ON messages
      FOR INSERT WITH CHECK (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' 
    AND policyname = 'messages_update_own'
  ) THEN
    CREATE POLICY "messages_update_own" ON messages
      FOR UPDATE USING (auth.uid()::text = user_id);
  END IF;
END $$;
