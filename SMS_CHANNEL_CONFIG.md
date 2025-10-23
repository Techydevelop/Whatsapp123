# GHL Workflow Integration Guide

## Overview
This guide explains how to properly integrate with GHL workflows for team notifications when customers reply.

## ✅ Correct Approach: GHL Workflows

### 1. Workflow Webhook Endpoint
- **URL**: `https://whatsappghl-backend.vercel.app/api/ghl-workflow`
- **Purpose**: Handles GHL workflow events including customer replied notifications
- **Status**: ✅ Implemented

### 2. Team Notification Endpoint (Legacy)
- **URL**: `https://whatsappghl-backend.vercel.app/api/team-notification`
- **Purpose**: Direct team notifications (can be called by workflows)
- **Status**: ✅ Available

## 🔄 How It Works Now

### Customer Reply Flow:
```
Customer WhatsApp → /whatsapp/webhook → /ghl/provider/webhook → GHL CRM → GHL Workflow → /api/ghl-workflow → Team Notifications
```

### GHL Workflow Configuration:

1. **Create Workflow in GHL**:
   - Go to GHL Dashboard → Workflows
   - Create new workflow: "Customer Replied Notification"
   - Trigger: "Inbound Message Received"

2. **Add Webhook Action**:
   - Action Type: "Webhook"
   - URL: `https://whatsappghl-backend.vercel.app/api/ghl-workflow`
   - Method: POST

3. **Webhook Payload**:
```json
{
  "event_type": "customer_replied",
  "contact_id": "{{contact.id}}",
  "contact_name": "{{contact.firstName}} {{contact.lastName}}",
  "contact_phone": "{{contact.phone}}",
  "last_message": "{{conversation.lastMessage}}",
  "assigned_user": "{{conversation.assignedUser.phone}}",
  "location_id": "{{location.id}}",
  "conversation_id": "{{conversation.id}}",
  "workflow_id": "{{workflow.id}}",
  "team_members": ["+923001234567", "+923001234568"]
}
```

## 🎯 Workflow Events Supported

### 1. Customer Replied
- **Event**: `customer_replied`
- **Triggers**: When customer sends message
- **Action**: Sends notification to team members

### 2. New Lead
- **Event**: `new_lead`
- **Triggers**: When new contact is created
- **Action**: Custom logic (extensible)

### 3. Follow Up
- **Event**: `follow_up`
- **Triggers**: When follow-up is needed
- **Action**: Custom logic (extensible)

## 📱 Team Notification Format

```
🔔 *Customer Replied*

👤 Customer: John Doe
📞 Phone: +923001234567
💬 Message: Hello, I need help with my order
```

## ⚙️ Configuration Steps

### Step 1: GHL Workflow Setup
1. **Create Workflow**:
   - Name: "Customer Reply Notifications"
   - Trigger: "Inbound Message"
   - Condition: Message source = WhatsApp

2. **Add Webhook Action**:
   - URL: `https://whatsappghl-backend.vercel.app/api/ghl-workflow`
   - Method: POST
   - Payload: Use the JSON template above

3. **Configure Team Members**:
   - Add team member phone numbers in workflow
   - Or use `assigned_user` field for dynamic assignment

### Step 2: Test Workflow
1. **Send Test Message**: Send WhatsApp message to business number
2. **Check Logs**: Monitor webhook logs for workflow execution
3. **Verify Notifications**: Ensure team members receive notifications

## 🔧 Advanced Configuration

### Dynamic Team Assignment
```json
{
  "team_members": [
    "{{conversation.assignedUser.phone}}",
    "{{location.owner.phone}}",
    "+923001234567"
  ]
}
```

### Conditional Notifications
- Only notify during business hours
- Different teams for different message types
- Escalation based on response time

## 🚀 Benefits

1. **GHL Native**: Uses GHL's workflow system
2. **Dynamic Teams**: Team members from GHL data
3. **Flexible**: Multiple workflow events supported
4. **Scalable**: Easy to add new notification types
5. **Reliable**: GHL handles workflow execution

## 🐛 Troubleshooting

- **No Notifications**: Check workflow is active and webhook URL is correct
- **Wrong Team**: Verify team_members array in workflow payload
- **Webhook Errors**: Check webhook logs for detailed error messages
- **Client Issues**: Ensure WhatsApp clients are connected
