# Expense Tracker Web

Real-time expense tracking with Splitwise API sync, interactive dashboards, and CSV uploads from banks.

## Features

- 📊 Dashboard with category breakdown and daily spending charts
- 📝 Transactions list with inline category editing
- 📤 CSV upload from OP Bank, Amex, Finnair Visa
- 🏷️ Keyword-based automatic categorization
- 💰 Duplicate detection and deduplication
- 📥 CSV export and filtering

## Tech Stack

- **Framework:** Next.js 16.2.2
- **API:** Splitwise (primary data source)
- **Database:** PostgreSQL with Prisma (optional, unused at runtime)
- **UI:** React 19, Tailwind CSS, Recharts
- **Testing:** Vitest (unit) + Playwright (E2E)
- **Node:** 20+

## Quick Start

### Prerequisites
- Node.js 20+
- Splitwise API key (set `NEXT_PUBLIC_SPLITWISE_API_KEY` env var)

### Setup
```bash
npm install
npm run dev
```

Open http://localhost:3000

### Environment Variables
```
NEXT_PUBLIC_SPLITWISE_API_KEY=your_api_key
SPLITWISE_USER_ID=your_id
SPLITWISE_WIFE_ID=spouse_id
SPLITWISE_GROUP_ID=group_id
```

## Testing

```bash
# Unit tests (Vitest)
npm test
npm run test:watch
npm run test:coverage

# E2E tests (Playwright)
npm run test:e2e
```

## CI/CD

GitHub Actions runs on every push:
- Lint & type check
- Unit tests (Vitest)
- E2E tests (Playwright)
- Auto-deploy to Vercel (main branch)

See `.github/workflows/ci.yml` for pipeline config.

## Key Docs

- **CLAUDE.md** - Agent instructions (with references to PROJECT_SUMMARY.md and AGENTS.md)
- **PROJECT_SUMMARY.md** - Architecture, data flow, and API reference
- **AGENTS.md** - Notes on Next.js changes

## Scripts

```bash
npm run dev              # Dev server
npm run build            # Build for production
npm run lint             # Run ESLint
npm test                 # Run unit tests
npm run test:e2e         # Run E2E tests
npm run db:push          # Sync Prisma schema
npm run db:seed          # Seed keywords
```
