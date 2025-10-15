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
  user_id UUID NOT NULL,
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

-- 3. Create ghl_contacts table for tracking contacts
CREATE TABLE IF NOT EXISTS ghl_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT UNIQUE NOT NULL,
  location_id TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add status and error tracking columns to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 5. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ghl_installations_company_id ON ghl_installations(company_id);
CREATE INDEX IF NOT EXISTS idx_ghl_installations_location_id ON ghl_installations(location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_installations_user_id ON ghl_installations(user_id);

CREATE INDEX IF NOT EXISTS idx_ghl_conversations_location_id ON ghl_conversations(location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_conversations_contact_id ON ghl_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_conversations_phone ON ghl_conversations(phone);

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_location_id ON ghl_contacts(location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_contact_id ON ghl_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_phone ON ghl_contacts(phone);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_status_updated_at ON messages(status_updated_at);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE ghl_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_contacts ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for ghl_installations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_installations' 
    AND policyname = 'ghl_installations_select_own'
  ) THEN
    CREATE POLICY "ghl_installations_select_own" ON ghl_installations
      FOR SELECT USING (auth.uid() = user_id::uuid);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_installations' 
    AND policyname = 'ghl_installations_insert_own'
  ) THEN
    CREATE POLICY "ghl_installations_insert_own" ON ghl_installations
      FOR INSERT WITH CHECK (auth.uid() = user_id::uuid);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_installations' 
    AND policyname = 'ghl_installations_update_own'
  ) THEN
    CREATE POLICY "ghl_installations_update_own" ON ghl_installations
      FOR UPDATE USING (auth.uid() = user_id::uuid);
  END IF;
END $$;

-- 8. Create RLS policies for ghl_conversations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_conversations' 
    AND policyname = 'ghl_conversations_select_own'
  ) THEN
    CREATE POLICY "ghl_conversations_select_own" ON ghl_conversations
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM subaccounts s 
          WHERE s.ghl_location_id = ghl_conversations.location_id 
          AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_conversations' 
    AND policyname = 'ghl_conversations_insert_own'
  ) THEN
    CREATE POLICY "ghl_conversations_insert_own" ON ghl_conversations
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM subaccounts s 
          WHERE s.ghl_location_id = ghl_conversations.location_id 
          AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_conversations' 
    AND policyname = 'ghl_conversations_update_own'
  ) THEN
    CREATE POLICY "ghl_conversations_update_own" ON ghl_conversations
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM subaccounts s 
          WHERE s.ghl_location_id = ghl_conversations.location_id 
          AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 9. Create RLS policies for ghl_contacts
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_contacts' 
    AND policyname = 'ghl_contacts_select_own'
  ) THEN
    CREATE POLICY "ghl_contacts_select_own" ON ghl_contacts
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM subaccounts s 
          WHERE s.ghl_location_id = ghl_contacts.location_id 
          AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_contacts' 
    AND policyname = 'ghl_contacts_insert_own'
  ) THEN
    CREATE POLICY "ghl_contacts_insert_own" ON ghl_contacts
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM subaccounts s 
          WHERE s.ghl_location_id = ghl_contacts.location_id 
          AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'ghl_contacts' 
    AND policyname = 'ghl_contacts_update_own'
  ) THEN
    CREATE POLICY "ghl_contacts_update_own" ON ghl_contacts
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM subaccounts s 
          WHERE s.ghl_location_id = ghl_contacts.location_id 
          AND s.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 10. Create pending_messages table for manual message processing
CREATE TABLE IF NOT EXISTS pending_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  whatsapp_web_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- 11. Update existing messages table policies to include new columns
-- (These should already exist, but adding for completeness)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' 
    AND policyname = 'messages_select_own'
  ) THEN
    CREATE POLICY "messages_select_own" ON messages
      FOR SELECT USING (auth.uid() = user_id);
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
      FOR INSERT WITH CHECK (auth.uid() = user_id);
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
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
