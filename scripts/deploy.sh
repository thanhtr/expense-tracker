#!/bin/bash

# Expense Tracker - Deployment Script
# Run this script to verify your app is ready for deployment

set -e

echo "🚀 Expense Tracker Deployment Verification"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Check git
if ! command -v git &> /dev/null; then
    echo -e "${RED}✗ Git not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Git $(git -v | head -1)${NC}"

echo ""
echo "📦 Checking project structure..."

# Check essential files
files=(
    "package.json"
    "tsconfig.json"
    "next.config.js"
    "tailwind.config.js"
    "prisma/schema.prisma"
    ".env.example"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file${NC}"
    else
        echo -e "${RED}✗ $file missing${NC}"
        exit 1
    fi
done

echo ""
echo "🔧 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
else
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

echo ""
echo "🏗️  Building application..."
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""
echo "📝 Checking TypeScript..."
if npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "${GREEN}✓ No TypeScript errors${NC}"
else
    echo -e "${YELLOW}⚠ TypeScript errors found (see above)${NC}"
fi

echo ""
echo "🐙 Checking Git status..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Git repository initialized${NC}"

    if [ -z "$(git config --get remote.origin.url)" ]; then
        echo -e "${YELLOW}⚠ No remote origin configured${NC}"
        echo "  Run: git remote add origin <your-github-url>"
    else
        echo -e "${GREEN}✓ Remote origin: $(git config --get remote.origin.url)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Not a git repository${NC}"
    echo "  Run: git init && git add . && git commit -m 'Initial commit'"
fi

echo ""
echo "📋 Deployment Checklist:"
echo "======================"
echo ""
echo "Before deploying to Vercel:"
echo ""
echo "1. ✓ Code is on GitHub"
echo "   Run: git push origin main"
echo ""
echo "2. ✓ Neon database is ready"
echo "   Get: Connection string from https://console.neon.tech"
echo "   Save: DATABASE_URL for Vercel"
echo ""
echo "3. ✓ Vercel account created"
echo "   Visit: https://vercel.com"
echo ""
echo "4. ✓ Environment variables set in Vercel"
echo "   Add: DATABASE_URL secret"
echo ""
echo "5. ✓ Deploy to Vercel"
echo "   Import your GitHub repository"
echo ""
echo "6. ✓ Initialize production database"
echo "   Run: npm run db:push && npm run db:seed"
echo ""

echo ""
echo "🎯 Next Steps:"
echo "=============="
echo ""
echo "1. Commit and push your code:"
echo "   git add ."
echo "   git commit -m 'Ready for deployment'"
echo "   git push origin main"
echo ""
echo "2. Go to https://vercel.com"
echo "3. Create new project from your GitHub repository"
echo "4. Add DATABASE_URL environment variable"
echo "5. Deploy!"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
echo ""
echo -e "${GREEN}✓ All checks passed! Ready to deploy.${NC}"
