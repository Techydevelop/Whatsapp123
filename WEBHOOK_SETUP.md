# GHL Webhook Setup Guide

## Overview
This guide explains how to set up webhooks for the WhatsApp GHL integration to receive real-time events from GoHighLevel.

## Required Environment Variables

Add these environment variables to your `.env` file:

```bash
# GHL OAuth Configuration
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://your-backend-url.com/oauth/callback
GHL_SCOPES=locations.readonly conversations.write users.readonly conversations.readonly conversations/message.readonly conversations/message.write conversations/reports.readonly conversations/livechat.write contacts.readonly

# GHL Webhook Configuration
GHL_WEBHOOK_SECRET=your_webhook_secret_key

# Provider Configuration
PROVIDER_ID=your_ghl_provider_id
```

## Webhook Endpoints

The following webhook endpoints are available:

### 1. App Install Webhook
- **URL**: `POST /ghl/webhook/install`
- **Purpose**: Tracks when your app is installed by users
- **Events**: `INSTALL`

### 2. Message Status Webhook
- **URL**: `POST /ghl/webhook/message-status`
- **Purpose**: Tracks message delivery status
- **Events**: `MESSAGE_STATUS`

### 3. Conversation Webhook
- **URL**: `POST /ghl/webhook/conversation`
- **Purpose**: Handles new conversations
- **Events**: `CONVERSATION`

### 4. Generic Webhook Handler
- **URL**: `POST /ghl/webhook`
- **Purpose**: Handles all webhook events
- **Events**: All types

## GHL Marketplace Configuration

### Step 1: Configure Webhook URL
1. Navigate to your app in the GHL Marketplace dashboard
2. Click on "Advanced Settings" in the left-hand panel
3. Go to the "Webhooks" section
4. Enter your webhook URL: `https://your-backend-url.com/ghl/webhook`
5. Use the toggle switches to subscribe to events:
   - ✅ App Install (required)
   - ✅ Message Status
   - ✅ Conversation

### Step 2: Set Webhook Secret
1. Generate a secure random string for `GHL_WEBHOOK_SECRET`
2. Add it to your environment variables
3. The webhook signature verification will use this secret

## Database Setup

Run the SQL commands in `webhook-schema-updates.sql` in your Supabase SQL editor to create the required tables:

```sql
-- Run these commands in Supabase SQL editor
-- (See webhook-schema-updates.sql for complete schema)
```

## Webhook Event Types

### App Install Event
```json
{
  "type": "INSTALL",
  "appId": "665c6bb13d4e5364bdec0e2f",
  "versionId": "665c6bb13d4e5364bdec0e2f",
  "installType": "Location",
  "locationId": "HjiMUOsCCHCjtxzEf8PR",
  "companyId": "GNb7aIv4rQFVb9iwNl5K",
  "userId": "Rg6BRRiHh7dS9gJy3W8a",
  "companyName": "Marketplace and Integrations Prod Agency",
  "isWhitelabelCompany": true,
  "whitelabelDetails": {
    "logoUrl": "https://...gif",
    "domain": "rajender.dentistsnear.me"
  },
  "timestamp": "2025-06-25T06:57:06.225Z",
  "webhookId": "1a533f85-1f1e-4886-891e-ee0cf4666e90"
}
```

### Message Status Event
```json
{
  "messageId": "msg_123",
  "status": "delivered",
  "locationId": "HjiMUOsCCHCjtxzEf8PR",
  "contactId": "contact_456",
  "phone": "+1234567890",
  "timestamp": "2025-06-25T06:57:06.225Z",
  "error": null
}
```

### Conversation Event
```json
{
  "type": "CONVERSATION",
  "conversationId": "conv_789",
  "locationId": "HjiMUOsCCHCjtxzEf8PR",
  "contactId": "contact_456",
  "phone": "+1234567890",
  "message": "Hello, how can I help you?",
  "timestamp": "2025-06-25T06:57:06.225Z",
  "direction": "inbound"
}
```

## Security

### Webhook Signature Verification
All webhook endpoints include signature verification using HMAC-SHA256:

1. GHL sends a signature in the `X-GHL-Signature` header
2. The signature is verified against the `GHL_WEBHOOK_SECRET`
3. Invalid signatures are rejected with 401 status

### Rate Limiting
Webhook endpoints are protected by rate limiting to prevent abuse.

## Testing Webhooks

### Using ngrok for Local Development
```bash
# Install ngrok
npm install -g ngrok

# Start your backend
npm start

# In another terminal, expose your local server
ngrok http 3000

# Use the ngrok URL in GHL webhook configuration
# Example: https://abc123.ngrok.io/ghl/webhook
```

### Webhook Testing Tools
- Use tools like Postman or curl to test webhook endpoints
- Ensure proper headers and signature verification

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check webhook URL is accessible
   - Verify webhook is enabled in GHL dashboard
   - Check server logs for errors

2. **Signature verification failing**
   - Verify `GHL_WEBHOOK_SECRET` is correct
   - Check signature header format
   - Ensure raw body is used for verification

3. **Database errors**
   - Run the schema updates in Supabase
   - Check RLS policies are correct
   - Verify user permissions

### Logs
Check your server logs for webhook events:
```bash
# Look for these log entries:
# "GHL App Install Webhook:"
# "GHL Message Status Webhook:"
# "GHL Conversation Webhook:"
```

## Next Steps

1. Deploy your backend with webhook endpoints
2. Configure webhooks in GHL Marketplace
3. Test webhook events
4. Monitor logs for successful webhook processing
5. Set up monitoring and alerting for webhook failures
