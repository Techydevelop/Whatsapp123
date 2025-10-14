/**
 * Quick Fix for QR Generation Issue
 * Run this to fix stuck "initializing" sessions
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixQRIssue() {
  console.log('🔧 Fixing QR Generation Issue...\n');

  try {
    // 1. Find stuck sessions
    const { data: stuckSessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'initializing');

    console.log(`📊 Found ${stuckSessions?.length || 0} stuck sessions\n`);

    if (stuckSessions && stuckSessions.length > 0) {
      // 2. Mark as disconnected
      for (const session of stuckSessions) {
        console.log(`🔄 Fixing session: ${session.id}`);
        
        const { error } = await supabase
          .from('sessions')
          .update({ status: 'disconnected' })
          .eq('id', session.id);

        if (!error) {
          console.log(`   ✅ Marked as disconnected`);
        }
      }
    }

    // 3. Clear all Baileys data
    console.log('\n🗑️ Clearing Baileys authentication data...');
    const dataDir = path.join(__dirname, 'data');
    
    if (fs.existsSync(dataDir)) {
      const folders = fs.readdirSync(dataDir).filter(f => f.startsWith('baileys_'));
      
      for (const folder of folders) {
        const folderPath = path.join(dataDir, folder);
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
          console.log(`   🗑️ Deleted: ${folder}`);
        } catch (err) {
          console.log(`   ⚠️ Could not delete: ${folder}`);
        }
      }
      
      console.log(`\n✅ Cleaned ${folders.length} Baileys folders`);
    } else {
      console.log('   ℹ️ No data folder found');
    }

    console.log('\n🎉 Fix Complete!\n');
    console.log('📝 Next Steps:');
    console.log('   1. Restart your server: npm start');
    console.log('   2. Create a new WhatsApp connection');
    console.log('   3. QR should appear in 2-5 seconds\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixQRIssue();

