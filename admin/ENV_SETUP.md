# Environment Variables Setup

Create a `.env.local` file in the `admin` directory with the following variables:

## Required Variables

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# JWT Secret (use the same as your backend)
JWT_SECRET=your_jwt_secret_key_here
```

## Optional Variables (for Email Features)

```env
# Email Service (for bulk email sending)
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=Octendr <notifications@octendr.com>
```

## How to Get Values

1. **NEXT_PUBLIC_SUPABASE_URL**: 
   - Go to your Supabase project dashboard
   - Settings → API
   - Copy the "Project URL"

2. **SUPABASE_SERVICE_ROLE_KEY**:
   - Same page in Supabase dashboard
   - Copy the "service_role" key (⚠️ Keep this secret!)

3. **JWT_SECRET**:
   - Use the same JWT_SECRET as your backend server
   - Or generate a new one: `openssl rand -base64 32`

4. **RESEND_API_KEY** (Optional):
   - Sign up at https://resend.com
   - Get your API key from dashboard
   - Only needed if you want to send bulk emails

## Quick Setup

1. Copy the template:
   ```bash
   cp env.template .env.local
   ```

2. Edit `.env.local` and fill in your values

3. Make sure `.env.local` is in `.gitignore` (already included)

## Example `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=my-super-secret-jwt-key-12345
RESEND_API_KEY=re_1234567890abcdef
EMAIL_FROM=Octendr <notifications@octendr.com>
NODE_ENV=development
```

