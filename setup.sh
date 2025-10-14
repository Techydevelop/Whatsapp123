#!/bin/bash

echo "🚀 WhatsApp-GHL Integration Setup Script"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version) detected${NC}"
echo ""

# Backend Setup
echo "📦 Setting up Backend..."
echo "------------------------"

if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}⚠️  Backend .env file not found. Creating from template...${NC}"
    cp backend/env.example backend/.env
    echo -e "${GREEN}✅ Created backend/.env${NC}"
    echo -e "${YELLOW}⚠️  Please edit backend/.env with your actual values${NC}"
else
    echo -e "${GREEN}✅ Backend .env file exists${NC}"
fi

# Create data directory
if [ ! -d "backend/data" ]; then
    mkdir -p backend/data
    echo -e "${GREEN}✅ Created backend/data directory${NC}"
else
    echo -e "${GREEN}✅ Backend data directory exists${NC}"
fi

# Install backend dependencies
cd backend
if [ ! -d "node_modules" ]; then
    echo "📥 Installing backend dependencies..."
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Backend dependencies installed${NC}"
    else
        echo -e "${RED}❌ Failed to install backend dependencies${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Backend dependencies already installed${NC}"
fi
cd ..

echo ""

# Frontend Setup
echo "🎨 Setting up Frontend..."
echo "-------------------------"

if [ ! -f "frontend/.env.local" ]; then
    echo -e "${YELLOW}⚠️  Frontend .env.local file not found. Creating template...${NC}"
    cat > frontend/.env.local << 'EOF'
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Backend API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# App Configuration
NEXT_PUBLIC_APP_NAME=WhatsApp GHL Integration
EOF
    echo -e "${GREEN}✅ Created frontend/.env.local${NC}"
    echo -e "${YELLOW}⚠️  Please edit frontend/.env.local with your actual values${NC}"
else
    echo -e "${GREEN}✅ Frontend .env.local file exists${NC}"
fi

# Install frontend dependencies
cd frontend
if [ ! -d "node_modules" ]; then
    echo "📥 Installing frontend dependencies..."
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Frontend dependencies installed${NC}"
    else
        echo -e "${RED}❌ Failed to install frontend dependencies${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Frontend dependencies already installed${NC}"
fi
cd ..

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "📝 Next Steps:"
echo "1. Edit backend/.env with your Supabase and GHL credentials"
echo "2. Edit frontend/.env.local with your Supabase credentials"
echo "3. Create Supabase tables (see SETUP_GUIDE.md)"
echo "4. Start backend: cd backend && npm start"
echo "5. Start frontend: cd frontend && npm run dev"
echo ""
echo "📚 For detailed instructions, see SETUP_GUIDE.md"
echo "=========================================="

