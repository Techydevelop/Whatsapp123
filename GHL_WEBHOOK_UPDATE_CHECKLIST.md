# 🔧 GHL Webhook Update Checklist

## ❌ Problem
Messages are failing after domain change because GHL marketplace still has old URLs configured.

## ✅ Solution
Update all URLs in GHL Marketplace to new domain: `api.octendr.com`

---

## 📋 Steps to Fix

### Step 1: Go to GHL Marketplace Dashboard

1. Go to: https://marketplace.leadconnectorhq.com/
2. Login with your GHL account
3. Go to "Apps" → Find "WhatsApp SMS Provider"
4. Click "Settings" or "Edit App"

---

### Step 2: Update OAuth Settings

#### Redirect URI:
```
Old: https://whatsapp123-dhn1.onrender.com/oauth/callback
New: https://api.octendr.com/oauth/callback
```

**Steps:**
1. Find "OAuth Settings" section
2. Update "Redirect URI" field
3. Click "Save"

---

### Step 3: Update Webhook URLs

#### Main Webhook:
```
URL: https://api.octendr.com/webhooks/ghl/provider-outbound
Method: POST
```

#### Provider Webhook:
```
URL: https://api.octendr.com/ghl/provider/webhook
Method: POST
```

#### Inbound Webhook:
```
URL: https://api.octendr.com/whatsapp/webhook
Method: POST
```

**Steps:**
1. Go to "Advanced Settings" → "Webhooks"
2. Delete old webhooks with `whatsapp123-dhn1.onrender.com`
3. Add new webhooks with above URLs
4. Enable these events:
   - ✅ InboundMessage
   - ✅ OutboundMessage
   - ✅ MessageStatus
   - ✅ ContactCreate
   - ✅ ConversationUnreadUpdate

---

### Step 4: Update Scopes

Make sure these scopes are enabled:
```
locations.readonly
conversations.write
conversations.readonly
conversations/message.write
conversations/message.readonly
contacts.readonly
contacts.write
businesses.readonly
users.readonly
medias.write
```

---

### Step 5: Test the Integration

#### Test 1: Check OAuth
1. Go to your app in GHL
2. Click "Login with GHL" or "Connect"
3. Should redirect to `https://api.octendr.com/oauth/callback`
4. Verify it works

#### Test 2: Send Test Message
1. Go to GHL → Conversations
2. Send a message to any contact
3. Check backend logs to see if webhook is received
4. Message should send successfully

---

## 🔍 Verify Backend is Running

### Check if Backend is Accessible:
```bash
curl https://api.octendr.com/health
```

Should return: `{"status": "ok"}`

### Check Webhook Endpoints:
```bash
# Provider webhook
curl https://api.octendr.com/ghl/provider/webhook

# Main webhook
curl https://api.octendr.com/whatsapp/webhook
```

Should return 200 OK or 404 (but NOT connection error)

---

## 🔄 After Updating Webhooks

### 1. Reinstall the App
- Go to GHL Dashboard
- Go to Marketplace Apps
- Find your WhatsApp app
- Click "Reinstall" or "Reconnect"
- This will update all webhook registrations

### 2. Test Message Flow
```
Send WhatsApp message → GHL receives → Webhook fires → Your backend receives → Message sent to contact
```

---

## 🐛 Troubleshooting

### Issue: Webhook not receiving
**Solution:**
1. Check backend logs: `heroku logs --tail` or Render logs
2. Verify URL is correct: `https://api.octendr.com/webhooks/ghl/provider-outbound`
3. Check if webhook endpoint exists in code
4. Test with curl:
```bash
curl -X POST https://api.octendr.com/webhooks/ghl/provider-outbound \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Issue: Messages still failing
**Solution:**
1. Check backend deployment is live on Render
2. Verify environment variables are set correctly
3. Check GHL API credentials are valid
4. Look at browser console for errors

### Issue: OAuth redirect not working
**Solution:**
1. Update redirect URI in GHL marketplace
2. Wait 5 minutes for changes to propagate
3. Try OAuth flow again
4. Check browser console for errors

---

## 📝 Important URLs Summary

### Backend URLs:
```
Base URL: https://api.octendr.com
Health Check: https://api.octendr.com/health
Provider Config: https://api.octendr.com/ghl/provider/config
Provider Webhook: https://api.octendr.com/ghl/provider/webhook
WhatsApp Webhook: https://api.octendr.com/whatsapp/webhook
Main Webhook: https://api.octendr.com/webhooks/ghl/provider-outbound
```

### OAuth:
```
Callback URL: https://api.octendr.com/oauth/callback
Authorization URL: https://marketplace.gohighlevel.com/oauth/chooselocation
```

---

## ✅ Quick Checklist

- [ ] Update OAuth redirect URI in GHL marketplace
- [ ] Add new webhook URLs in GHL marketplace
- [ ] Delete old webhooks
- [ ] Enable required webhook events
- [ ] Update app scopes
- [ ] Reinstall app in GHL
- [ ] Test OAuth flow
- [ ] Test message sending
- [ ] Test message receiving
- [ ] Check backend logs for errors

---

## 🚀 After Fixing

Once webhooks are updated:
1. Messages will start working immediately
2. No need to restart backend
3. No need to reconnect user accounts
4. Just refresh the GHL conversation page

---

**Last Updated:** After domain change to api.octendr.com
**Backend Status:** Should be running on Render
**Frontend:** Will automatically use new API URL

