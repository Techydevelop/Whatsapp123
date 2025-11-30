# Email Notification Implementation - 3 Scenarios

## Overview
The system now sends email notifications for **3 specific scenarios**:

### ✅ Emails WILL be sent for:
1. **Mobile Logout** - User logs out from their phone/WhatsApp
2. **Dashboard Logout** - User manually disconnects from the dashboard
3. **System Disconnect (Dashboard Visible)** - System causes disconnection that shows on dashboard

### ❌ Emails will NOT be sent for:
- Temporary network blips that auto-recover
- Background reconnection attempts
- Silent system reconnections

## Implementation Details

### Scenario 1: Mobile Logout (User-Initiated from Phone)
**Location:** `backend/lib/baileys-wa.js` - Line 604  
**Trigger:** When user logs out from WhatsApp mobile app  
**Email Type:** `'mobile'`

```javascript
// Send email notification for mobile disconnect (user logout)
this.sendDisconnectEmail(sessionId, 'mobile').catch(err => {
  console.error(`❌ Failed to send disconnect email: ${err.message}`);
});
```

**Behavior:**
- ✅ Email sent immediately
- ✅ Database status updated to 'disconnected'
- ❌ No auto-reconnection (user must scan QR code again)

---

### Scenario 2: Dashboard Logout (User-Initiated from Dashboard)
**Location:** `backend/server.js` - Line 4542  
**Trigger:** When user manually clicks "Logout" button on dashboard  
**Email Type:** `'dashboard'`

```javascript
await emailService.sendDisconnectNotification(
  ghlAccount.user_id,
  locationId,
  'dashboard'
);
```

**Behavior:**
- ✅ Email sent immediately
- ✅ Session deleted from database
- ✅ Auth files cleared
- ❌ No auto-reconnection (user must scan QR code again)

---

### Scenario 3: System Disconnect (Dashboard Shows Disconnected Status)
**Location:** `backend/lib/baileys-wa.js` - Line 544  
**Trigger:** When system issue causes persistent disconnection visible on dashboard  
**Email Type:** `'system_dashboard'`

```javascript
if (isSystemDisconnect && shouldReconnect) {
  console.log(`📧 System-caused disconnect detected - dashboard will show disconnected status - sending email notification`);
  this.sendDisconnectEmail(sessionId, 'system_dashboard', {
    reason: disconnectMessage,
    code: disconnectStatusCode,
    timestamp: new Date().toISOString()
  }).catch(err => {
    console.error(`❌ Failed to send system disconnect email: ${err.message}`);
  });
}
```

**Behavior:**
- ✅ Email sent when disconnect is detected
- ✅ Database status updated to 'disconnected' (visible on dashboard)
- ✅ System attempts auto-reconnection in background
- ✅ User is notified that dashboard shows disconnected status
- ✅ Auto-reconnection may succeed (no further email needed)

---

## Code Duplication Check: ✅ NO DUPLICATION

All three scenarios use the **same email service** (`sendDisconnectNotification()`), but are called from different places:

1. **baileys-wa.js** - Handles mobile logout and system disconnect
2. **server.js** - Handles dashboard manual logout

This is **proper separation of concerns**, not duplication.

---

## Email Service Implementation

### Email Types Supported
**File:** `backend/lib/email.js`

```javascript
// 3 scenarios supported:
// 1. 'mobile' - User logs out from phone
// 2. 'dashboard' - User manually disconnects from dashboard
// 3. 'system_dashboard' - System causes disconnect visible on dashboard

if (reason === 'system_dashboard') {
  subject = 'WhatsApp Connection Lost - Action May Be Required';
  disconnectReason = 'lost due to a system issue';
  emailType = 'system_dashboard';
} else if (reason === 'mobile') {
  subject = 'WhatsApp Connection - Action Required';
  disconnectReason = 'disconnected from your mobile phone';
  emailType = 'mobile';
} else {
  subject = 'WhatsApp Connection - Action Required';
  disconnectReason = 'logged out from the dashboard';
  emailType = 'dashboard';
}
```

### Email Content Differences

#### For System Disconnect (`system_dashboard`):
- **Subject:** "WhatsApp Connection Lost - Action May Be Required"
- **Alert Box:** Shows orange warning about system disconnect
- **Message:** "Our system is automatically attempting to reconnect"
- **Includes:** Error details (reason, code, timestamp)

#### For Mobile Logout (`mobile`):
- **Subject:** "WhatsApp Connection - Action Required"
- **Message:** "Disconnected from your mobile phone"
- **Action:** User must scan QR code to reconnect

#### For Dashboard Logout (`dashboard`):
- **Subject:** "WhatsApp Connection - Action Required"
- **Message:** "Logged out from the dashboard"
- **Action:** User must scan QR code to reconnect

---

## System Flow Diagrams

### Scenario 1: Mobile Logout
```
User logs out from WhatsApp app
    ↓
System detects 'loggedOut' reason
    ↓
✅ Email sent (reason: 'mobile')
    ↓
Database status: 'disconnected'
    ↓
❌ No auto-reconnection
    ↓
User must scan QR code again
```

### Scenario 2: Dashboard Logout
```
User clicks "Logout" button on dashboard
    ↓
Server endpoint called: /ghl/location/:locationId/session/logout
    ↓
Client disconnected from WhatsApp
    ↓
✅ Email sent (reason: 'dashboard')
    ↓
Session deleted from database
    ↓
Auth files cleared
    ↓
User must scan QR code again
```

### Scenario 3: System Disconnect
```
Network issue / System timeout occurs
    ↓
System detects 'connectionLost' or similar
    ↓
Database status: 'disconnected' (visible on dashboard)
    ↓
✅ Email sent (reason: 'system_dashboard')
    ↓
System attempts auto-reconnection in background
    ↓
    ├─ Success ✅ → Status: 'connected' (no further action)
    │
    └─ Failed ❌ → User must manually reconnect (follow email instructions)
```

---

## Testing Scenarios

### Test 1: Mobile Logout ✓
1. Open WhatsApp on phone
2. Go to Linked Devices
3. Unlink/logout the device
4. **Expected:** Email received with subject "WhatsApp Connection - Action Required"

### Test 2: Dashboard Logout ✓
1. Go to dashboard
2. Click "Logout" button
3. **Expected:** Email received with subject "WhatsApp Connection - Action Required"

### Test 3: System Disconnect ✓
1. Simulate network timeout (disconnect WiFi temporarily)
2. Check dashboard - status should show "disconnected"
3. **Expected:** Email received with subject "WhatsApp Connection Lost - Action May Be Required"
4. Reconnect network
5. **Expected:** System should auto-reconnect in background

### Test 4: Temporary Network Blip ✓
1. Brief network interruption (<2 seconds)
2. System auto-reconnects immediately
3. **Expected:** NO email sent (too brief to show on dashboard)

---

## Benefits

1. ✅ **User Awareness** - Users know when their connection status changes on dashboard
2. ✅ **Clear Communication** - Different email subjects based on disconnect type
3. ✅ **System Transparency** - Users informed when system issues occur
4. ✅ **Auto-Recovery** - System attempts reconnection without user intervention
5. ✅ **No Code Duplication** - Single email service used by all scenarios
6. ✅ **Proper Separation** - Each scenario handled in appropriate location

---

## File Changes Summary

### 1. `backend/lib/baileys-wa.js`
- ✅ Added email for system disconnect (line 544)
- ✅ Kept email for mobile logout (line 604)

### 2. `backend/server.js`
- ✅ Kept email for dashboard logout (line 4542)

### 3. `backend/lib/email.js`
- ✅ Added `system_dashboard` email type
- ✅ Added orange alert box for system disconnects
- ✅ Updated email subject for system disconnects
- ✅ Added auto-reconnection message for system disconnects

