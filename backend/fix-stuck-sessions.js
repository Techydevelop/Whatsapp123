/**
 * Fix Stuck WhatsApp Sessions
 * Run this before starting server if QR not generating
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixStuckSessions() {
  console.log('🔧 Fixing stuck WhatsApp sessions...\n');

  try {
    // 1. Mark all stuck sessions as disconnected
    const { data: stuckSessions, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .in('status', ['initializing', 'qr']);

    if (fetchError) {
      console.error('❌ Error:', fetchError);
      return;
    }

    console.log(`📊 Found ${stuckSessions.length} stuck sessions\n`);

    for (const session of stuckSessions) {
      console.log(`🔄 Fixing session: ${session.id}`);
      
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'disconnected', qr: null })
        .eq('id', session.id);

      if (error) {
        console.error(`   ❌ Error: ${error.message}`);
      } else {
        console.log(`   ✅ Marked as disconnected`);
      }
    }

    // 2. Clear Baileys auth data
    console.log('\n🗑️  Clearing Baileys data...');
    const dataDir = path.join(__dirname, 'data');
    
    if (fs.existsSync(dataDir)) {
      const folders = fs.readdirSync(dataDir).filter(f => f.startsWith('baileys_'));
      console.log(`   Found ${folders.length} Baileys folders`);
      
      for (const folder of folders) {
        const folderPath = path.join(dataDir, folder);
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
          console.log(`   ✅ Deleted: ${folder}`);
        } catch (err) {
          console.error(`   ⚠️  Could not delete ${folder}: ${err.message}`);
        }
      }
    }

    console.log('\n✅ DONE! Now restart server:\n');
    console.log('   npm start\n');

  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fixStuckSessions();

