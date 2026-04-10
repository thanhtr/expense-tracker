# GitHub & Vercel Setup

## Overview

Environment variables are automatically bootstrapped from GitHub Secrets to Vercel during deployment. No manual configuration is needed on Vercel's dashboard.

## Required GitHub Secrets

Add these secrets to your GitHub repository settings (**Settings → Secrets and variables → Actions**):

### API Credentials (Required for Build & Deployment)
- `SPLITWISE_API_KEY` - Your Splitwise API key (sensitive)
- `SPLITWISE_USER_ID` - Your Splitwise user ID (e.g., "2206773")
- `SPLITWISE_WIFE_ID` - Spouse's Splitwise user ID (e.g., "14152499")
- `SPLITWISE_GROUP_ID` - Splitwise group ID (e.g., "7014251")

### Vercel Integration (Required for Deployment)
- `VERCEL_TOKEN` - [Get from Vercel](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` - Found in Vercel project settings
- `VERCEL_PROJECT_ID` - Found in Vercel project settings
- `VERCEL_URL` - Your production URL (optional, used for deployment notifications)

## How It Works

### CI/CD Pipeline

1. **Build Job** (`build`)
   - Installs dependencies
   - Runs linter
   - Builds Next.js app
   - Uses `SPLITWISE_API_KEY` from secrets for API calls

2. **Test Jobs** (`unit-test`, `e2e-test`)
   - Run with test credentials (not real secrets)

3. **Deploy Production** (`deploy-production`)
   - Runs on every push to `main` branch
   - **Step 1:** Sets `NEXT_PUBLIC_SPLITWISE_API_KEY` in Vercel using the Vercel CLI
   - **Step 2:** Deploys to production
   - **Step 3:** Comments on commit with deployment URL

### Bootstrap Process

When deploying to production, the workflow runs:
```bash
npx vercel env add NEXT_PUBLIC_SPLITWISE_API_KEY "${{ secrets.SPLITWISE_API_KEY }}" \
  --token "${{ secrets.VERCEL_TOKEN }}" \
  --project-id "${{ secrets.VERCEL_PROJECT_ID }}" \
  --org-id "${{ secrets.VERCEL_ORG_ID }}" \
  --environment production \
  --confirm
```

This automatically:
- Reads the secret from GitHub
- Adds it to Vercel's environment variables
- No manual Vercel dashboard configuration needed

## Local Development

### Environment Variables

Copy `.env.example` to `.env.local` and add your values:
```bash
NEXT_PUBLIC_SPLITWISE_API_KEY=your_api_key
SPLITWISE_API_KEY=your_api_key
SPLITWISE_USER_ID=your_id
SPLITWISE_WIFE_ID=spouse_id
SPLITWISE_GROUP_ID=group_id
DATABASE_URL=postgresql://...  # Optional
```

### Running Locally
```bash
npm install
npm run dev
```

## Vercel Dashboard

After the first deployment from GitHub, you'll see the environment variable in Vercel:
- **Settings → Environment Variables**
- `NEXT_PUBLIC_SPLITWISE_API_KEY` (sourced from GitHub Secrets)

No manual updates needed—changes to GitHub Secrets flow automatically to Vercel on next deployment.

## Troubleshooting

### "Environment Variable references Secret which does not exist"

This error means the GitHub Secret hasn't been set yet. Add the secret to GitHub first:
1. Go to repo **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `SPLITWISE_API_KEY`
4. Value: your API key
5. Click **Add secret**

### Deployment fails with "VERCEL_TOKEN invalid"

- Verify `VERCEL_TOKEN` is set in GitHub Secrets
- Regenerate token from [vercel.com/account/tokens](https://vercel.com/account/tokens)
- Ensure token has proper permissions for the project

### Environment variable not showing in Vercel

Check the deployment log in GitHub Actions:
```
✓ Set Vercel environment variables
```

If the step is skipped or fails, manually set it in Vercel dashboard as a fallback.

---

**Note:** The `vercel.json` file no longer contains hardcoded secret references—all configuration comes from GitHub Secrets during CI/CD.
