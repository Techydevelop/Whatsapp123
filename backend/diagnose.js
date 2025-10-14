// Diagnostic script to check Render environment
const fs = require('fs');
const path = require('path');
const https = require('https');

console.log('🔍 WhatsApp Integration Diagnostics\n');
console.log('='.repeat(50));

// 1. Check Node version
console.log('\n1️⃣ Node.js Version:');
console.log('   Version:', process.version);
console.log('   Platform:', process.platform);
console.log('   Arch:', process.arch);

// 2. Check environment
console.log('\n2️⃣ Environment:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   PORT:', process.env.PORT || 'not set');
console.log('   BACKEND_URL:', process.env.BACKEND_URL ? '✅ Set' : '❌ Not set');
console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Not set');
console.log('   GHL_CLIENT_ID:', process.env.GHL_CLIENT_ID ? '✅ Set' : '❌ Not set');

// 3. Check data directory
console.log('\n3️⃣ Data Directory:');
const dataDir = path.join(__dirname, 'data');
console.log('   Path:', dataDir);

try {
  if (fs.existsSync(dataDir)) {
    const stats = fs.statSync(dataDir);
    console.log('   Exists: ✅');
    console.log('   Writable:', fs.accessSync(dataDir, fs.constants.W_OK) === undefined ? '✅' : '❌');
    
    const files = fs.readdirSync(dataDir);
    console.log('   Contents:', files.length, 'items');
    
    // Check for baileys folders
    const baileysFolders = files.filter(f => f.startsWith('baileys_'));
    console.log('   Baileys sessions:', baileysFolders.length);
    
    if (baileysFolders.length > 0) {
      console.log('   Sessions:', baileysFolders.slice(0, 3).join(', '));
    }
  } else {
    console.log('   Exists: ❌ - Creating...');
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('   Created: ✅');
  }
} catch (error) {
  console.log('   Error:', error.message);
}

// 4. Check dependencies
console.log('\n4️⃣ Critical Dependencies:');
try {
  const baileys = require('baileys');
  console.log('   Baileys: ✅', baileys ? 'Loaded' : 'Failed');
} catch (e) {
  console.log('   Baileys: ❌', e.message);
}

try {
  const qrcode = require('qrcode');
  console.log('   QRCode: ✅', qrcode ? 'Loaded' : 'Failed');
} catch (e) {
  console.log('   QRCode: ❌', e.message);
}

try {
  const supabase = require('@supabase/supabase-js');
  console.log('   Supabase: ✅', supabase ? 'Loaded' : 'Failed');
} catch (e) {
  console.log('   Supabase: ❌', e.message);
}

// 5. Network connectivity
console.log('\n5️⃣ Network Connectivity:');

// Test WhatsApp Web
console.log('   Testing web.whatsapp.com...');
https.get('https://web.whatsapp.com', (res) => {
  console.log('   WhatsApp Web: ✅', res.statusCode);
}).on('error', (e) => {
  console.log('   WhatsApp Web: ❌', e.message);
});

// Test connection to WhatsApp socket servers
const { default: makeWASocket, DisconnectReason } = require('baileys');
console.log('   Testing Baileys socket connection...');

(async () => {
  try {
    const testDir = path.join(dataDir, 'test_connection');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const { useMultiFileAuthState } = require('baileys');
    const { state, saveCreds } = await useMultiFileAuthState(testDir);
    
    const sock = makeWASocket({
      auth: state,
      logger: { level: 'silent' },
      connectTimeoutMs: 10000, // 10 second timeout for test
    });
    
    let testComplete = false;
    
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr && !testComplete) {
        console.log('\n   ✅ QR Event Received! (Connection works)');
        console.log('   ✅ Baileys can connect to WhatsApp servers');
        testComplete = true;
        sock.end();
        
        // Cleanup test directory
        try {
          fs.rmSync(testDir, { recursive: true, force: true });
        } catch (e) {}
        
        printSummary();
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message;
        
        if (!testComplete) {
          console.log('\n   ❌ Connection Failed');
          console.log('   Reason:', reason || 'Unknown');
          console.log('   Status:', statusCode || 'Unknown');
          
          if (reason === 'Connection Failure' || reason?.includes('timeout')) {
            console.log('\n   🚨 NETWORK ISSUE DETECTED:');
            console.log('   - Render might be blocked by WhatsApp');
            console.log('   - Or network timeout issues');
            console.log('   - Try using a VPN or different hosting');
          }
          
          testComplete = true;
        }
        
        // Cleanup
        try {
          fs.rmSync(testDir, { recursive: true, force: true });
        } catch (e) {}
        
        printSummary();
      }
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
      if (!testComplete) {
        console.log('\n   ⏱️ Connection test timed out');
        console.log('   This usually means network connectivity issues');
        sock.end();
        
        try {
          fs.rmSync(testDir, { recursive: true, force: true });
        } catch (e) {}
        
        printSummary();
      }
    }, 15000);
    
  } catch (error) {
    console.log('   ❌ Test Error:', error.message);
    printSummary();
  }
})();

function printSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY & RECOMMENDATIONS:\n');
  
  const dataExists = fs.existsSync(path.join(__dirname, 'data'));
  
  if (!dataExists) {
    console.log('❌ DATA DIRECTORY ISSUE:');
    console.log('   - Create persistent disk in Render');
    console.log('   - Mount to: /opt/render/project/src/backend/data');
  }
  
  console.log('\n📝 Next Steps:');
  console.log('1. Check Render logs for "QR Event Received"');
  console.log('2. If connection fails, WhatsApp might be blocking Render IPs');
  console.log('3. Consider using a proxy or different hosting');
  console.log('4. Ensure persistent disk is properly mounted');
  
  console.log('\n' + '='.repeat(50));
  process.exit(0);
}

