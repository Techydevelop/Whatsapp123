# WhatsApp SaaS Platform

A comprehensive WhatsApp Business API platform built with Node.js, React, and Supabase.

## Features

- 🔐 **Supabase Authentication** - Secure user management
- 📱 **Multi-Session WhatsApp** - Manage multiple WhatsApp accounts
- 💬 **Real-time Messaging** - Live chat with Supabase Realtime
- 🏢 **Subaccount Management** - Organize clients and businesses
- 🔗 **GoHighLevel Integration** - Webhook support for lead management
- 🚀 **Production Ready** - Deploy to Render + Vercel

## Tech Stack

- **Backend**: Node.js, Express, whatsapp-web.js
- **Database**: Supabase (PostgreSQL with RLS)
- **Frontend**: React, Vite, Tailwind CSS
- **Real-time**: Supabase Realtime
- **Deployment**: Render (backend), Vercel (frontend)

## Quick Start

### 1. Database Setup
1. Create a new Supabase project
2. Run the SQL schema from `supabase-schema.sql`
3. Enable RLS policies and Realtime

### 2. Backend Setup
```bash
cd backend
npm install
# Copy backend/env.example to backend/.env and update with your credentials
node server.js
```

### 3. Frontend Setup
```bash
cd frontend
npm install
# Copy frontend/.env.local.example to frontend/.env.local and update with your credentials
npm run dev
```

### 4. Environment Variables
- **Backend (.env)**: Supabase credentials, GHL OAuth credentials
- **Frontend (.env.local)**: API URL, Supabase credentials
- See `env.example` files for reference

## API Endpoints

### Authentication
- `GET /auth/me` - Get current user profile

### Sessions Management
- `POST /admin/create-session` - Create WhatsApp session
- `GET /admin/sessions?subaccountId=` - List sessions
- `GET /admin/sessions/:id` - Get session details
- `POST /admin/sessions/:id/disconnect` - Disconnect session

### Messaging
- `POST /messages/send` - Send WhatsApp message
- `GET /messages/session/:id` - Get session messages
- `GET /messages/subaccount/:id` - Get subaccount messages

### Webhooks
- `POST /webhooks/ghl` - GHL lead webhook
- `POST /webhooks/ghl-agent` - GHL agent reply webhook

## Database Schema

### Tables
- `subaccounts` - User subaccounts/businesses
- `sessions` - WhatsApp session management
- `messages` - Message storage with RLS

### Security
- Row Level Security (RLS) enabled
- Users can only access their own data
- JWT authentication required

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed production deployment instructions.

**Quick Deploy:**
- Backend: Render (uses `render.yaml`)
- Frontend: Vercel (import `frontend` folder)
- Database: Supabase
- OAuth: GoHighLevel Marketplace

## Environment Variables

### Backend (.env)
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GHL_API_KEY=your_ghl_api_key
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
```

### Frontend (.env)
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=https://your-backend.onrender.com
```

## Usage

1. **Sign up** for an account
2. **Create a subaccount** for your business
3. **Add a WhatsApp session** by providing a phone number
4. **Scan the QR code** to connect WhatsApp
5. **Start messaging** through the dashboard
6. **Set up webhooks** for GoHighLevel integration

## Security Features

- JWT-based authentication
- Row Level Security (RLS) policies
- Rate limiting on API endpoints
- CORS protection
- Input validation and sanitization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
