# Admin Panel

Separate admin panel for Octendr management. Connects directly to Supabase database.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file in the `admin` directory and add:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret
RESEND_API_KEY=your_resend_api_key (optional, for emails)
EMAIL_FROM=Octendr <notifications@octendr.com>
NODE_ENV=development
```

   You can copy `env.template` to `.env.local` and fill in the values.

3. Run development server:
```bash
npm run dev
```

Admin panel will run on http://localhost:3002

## Features

- **Customers**: View all customers, their plans, trial status, subaccounts
- **Emails**: Filter customers and send bulk emails
- **Subscriptions**: Analytics and graphs for user growth
- **Billings**: Monthly revenue statements and graphs
- **Users**: Role-based admin access management (superadmin only)

## Deployment

Deploy to Vercel:
1. Connect your GitHub repository
2. Set environment variables in Vercel dashboard
3. Deploy!

