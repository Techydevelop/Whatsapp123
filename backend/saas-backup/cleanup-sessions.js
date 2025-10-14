/**
 * Session Cleanup and Diagnostic Script
 * 
 * This script helps fix stuck WhatsApp sessions and QR generation issues.
 * Run this when sessions are stuck in "initializing" state.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupSessions() {
  try {
    console.log('🧹 Starting session cleanup...\n');

    // 1. Find all stuck sessions (initializing status)
    const { data: stuckSessions, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'initializing');

    if (fetchError) {
      console.error('❌ Error fetching sessions:', fetchError);
      return;
    }

    console.log(`📊 Found ${stuckSessions.length} stuck sessions in 'initializing' state\n`);

    if (stuckSessions.length === 0) {
      console.log('✅ No stuck sessions found!');
      return;
    }

    // 2. Update all stuck sessions to disconnected
    for (const session of stuckSessions) {
      console.log(`🔄 Cleaning session: ${session.id}`);
      console.log(`   Subaccount: ${session.subaccount_id}`);
      console.log(`   Created: ${session.created_at}`);

      const { error: updateError } = await supabase
        .from('sessions')
        .update({ status: 'disconnected' })
        .eq('id', session.id);

      if (updateError) {
        console.error(`   ❌ Failed to update: ${updateError.message}`);
      } else {
        console.log(`   ✅ Updated to 'disconnected'`);
      }

      // 3. Clean up Baileys auth data
      const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sessionName = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const authDir = path.join(__dirname, 'data', `baileys_${sessionName}`);

      if (fs.existsSync(authDir)) {
        try {
          fs.rmSync(authDir, { recursive: true, force: true });
          console.log(`   🗑️ Deleted auth data: ${authDir}`);
        } catch (err) {
          console.error(`   ⚠️ Could not delete auth data: ${err.message}`);
        }
      }

      console.log('');
    }

    console.log('✅ Cleanup completed!\n');
    console.log('📝 Next steps:');
    console.log('   1. Restart your server: npm start');
    console.log('   2. Try creating a new WhatsApp connection');
    console.log('   3. QR code should appear within 2-5 seconds\n');

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

async function showDiagnostics() {
  try {
    console.log('🔍 Running diagnostics...\n');

    // Count sessions by status
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('status');

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    const statusCount = {};
    sessions.forEach(s => {
      statusCount[s.status] = (statusCount[s.status] || 0) + 1;
    });

    console.log('📊 Session Status Summary:');
    Object.entries(statusCount).forEach(([status, count]) => {
      const icon = status === 'ready' ? '✅' : 
                   status === 'initializing' ? '🔄' : 
                   status === 'qr' ? '📱' : 
                   status === 'disconnected' ? '🔌' : '❓';
      console.log(`   ${icon} ${status}: ${count}`);
    });

    console.log('');

    // Check Baileys data directory
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      const folders = fs.readdirSync(dataDir).filter(f => 
        f.startsWith('baileys_')
      );
      console.log(`📁 Baileys auth folders: ${folders.length}`);
      if (folders.length > 10) {
        console.log('   ⚠️ Many auth folders found - consider cleanup');
      }
    }

    console.log('');

  } catch (error) {
    console.error('❌ Diagnostics failed:', error);
  }
}

// Run based on command line argument
const command = process.argv[2];

if (command === 'cleanup' || command === 'clean') {
  cleanupSessions();
} else if (command === 'diagnostics' || command === 'diag') {
  showDiagnostics();
} else {
  console.log('🛠️  WhatsApp Session Cleanup Tool\n');
  console.log('Usage:');
  console.log('  node cleanup-sessions.js diagnostics  - Show session status');
  console.log('  node cleanup-sessions.js cleanup      - Fix stuck sessions\n');
}

