# Vercel Deployment Setup

This guide walks through setting up automated deployments to Vercel via GitHub Actions.

## Prerequisites

1. Vercel account (free tier supported)
2. Project deployed to Vercel (manually or via Vercel CLI)
3. GitHub repository with this CI/CD setup

## One-Time Setup (5 minutes)

### 1. Link Repo to Vercel Project

**Option A: Via Vercel Dashboard (Recommended)**
1. Go to https://vercel.com/dashboard
2. Click "New Project"
3. Import your GitHub repository
4. Select Next.js framework
5. Add environment variables (see step 3 below)
6. Click "Deploy"

**Option B: Via Vercel CLI**
```bash
npm i -g vercel
vercel link
vercel env pull
```

### 2. Get Vercel Tokens & IDs

1. Go to https://vercel.com/account/tokens
2. Click "Create Token" (name it `github-actions`)
3. Copy the token value
4. Go to https://vercel.com/account/settings (bottom of sidebar)
5. Note your **Team ID** (for org-id) or use default if personal account
6. Open project settings: https://vercel.com/{team}/{project}/settings
7. Copy the **Project ID** from URL or settings

### 3. GitHub Secrets (Already Configured ✓)

You have these set up:

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | Your Vercel API token |
| `VERCEL_PROJECT_ID` | Your Vercel project ID |
| `VERCEL_ORG_ID` | Your Vercel org/team ID (optional for personal) |
| `SPLITWISE_API_KEY` | Your Splitwise API key |

These are automatically passed to Vercel during deployment via CI/CD.

### 4. Verify Vercel Project Settings

1. Go to your Vercel project: https://vercel.com/dashboard/{project-name}
2. Go to **Settings → Environment Variables**
3. If you want DATABASE_URL set in Vercel (optional), add it there as a Secret
4. The `NEXT_PUBLIC_SPLITWISE_API_KEY` is automatically passed from GitHub Actions during deployment

**Already handled by CI/CD:**
- `NEXT_PUBLIC_SPLITWISE_API_KEY` is passed from `${{ secrets.SPLITWISE_API_KEY }}`
- No need to manually add it to Vercel dashboard

## Deployment Flow

### Preview Deployments (on Pull Requests)
```
PR created → build → unit-test → e2e-test → deploy-preview
```

- Runs on every PR
- Creates unique preview URL
- Tests must pass first
- Link in PR details

### Production Deployments (on main push)
```
git push main → build → unit-test → e2e-test → deploy-production → comment
```

- Runs only on main branch
- Deploys to production domain
- Comments on commit with live URL
- Tests must pass first

## Vercel Configuration

Configuration is in `vercel.json`:

```json
{
  "projectSettings": {
    "framework": "nextjs",
    "nodeVersion": "20.x"
  },
  "buildCommand": "npm run build",
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

**Key settings:**
- **Node 20.x** — Required for Next.js 16.2.2
- **Memory 1024 MB** — API functions (default is 512MB)
- **Max Duration 60s** — Timeout for API routes
- **iad1 region** — US East (change in vercel.json if needed)

## Environment Variables Flow

**GitHub Secrets** (in repo settings):
- `VERCEL_TOKEN` — Vercel API token
- `VERCEL_PROJECT_ID` — Your Vercel project ID
- `VERCEL_ORG_ID` — Vercel organization/team ID (optional for personal)
- `SPLITWISE_API_KEY` — Splitwise API key

**CI/CD Deployment** (automatically passed):
- `NEXT_PUBLIC_SPLITWISE_API_KEY` = `${{ secrets.SPLITWISE_API_KEY }}`
- Vercel receives this during preview/production deploy

**Vercel Dashboard** (only if needed):
- `DATABASE_URL` — PostgreSQL connection (optional, unused at runtime)

**Local/Code** (in `.env.local`):
- `SPLITWISE_USER_ID` — Your Splitwise user ID
- `SPLITWISE_WIFE_ID` — Spouse Splitwise user ID
- `SPLITWISE_GROUP_ID` — Shared group ID

**Why this setup?**
- API keys are secrets → GitHub Secrets only
- Secrets are passed at deploy-time → no need to store in Vercel dashboard
- User/Group IDs are public → safe in code/`.env.local`

## Troubleshooting

### "Project not found" error
- Verify `VERCEL_PROJECT_ID` is correct
- Ensure project exists in Vercel dashboard
- Check that org ID matches (if using team)

### Deployment succeeds but site is blank
- Check Environment Variables in Vercel dashboard
- Verify `NEXT_PUBLIC_SPLITWISE_API_KEY` is set
- Check logs: **Deployments → {latest} → Logs**

### Build fails with "npm ERR"
- Check Node version in vercel.json (should be 20.x)
- Verify package.json and package-lock.json are in sync
- Check build logs for missing dependencies

### API routes return 500 errors
- Verify all Splitwise env vars are set
- Check function timeout (increased to 60s in vercel.json)
- View logs: **Deployments → Logs → View Function Logs**

### Tests pass locally but fail in CI
- Ensure same Node version (20.x)
- Check for missing environment variables in CI
- Run `npm ci` instead of `npm install` (done in workflow)

## Custom Domain

1. Go to project **Settings → Domains**
2. Add custom domain
3. Update DNS records (instructions shown in Vercel)
4. SSL certificate auto-provisioned (free)

## Monitoring & Logs

- **Real-time logs**: https://vercel.com/{team}/{project}/logs
- **Function logs**: https://vercel.com/{team}/{project}/logs?type=function
- **Deployment history**: https://vercel.com/{team}/{project}/deployments

## Local Testing Before Deploy

Test the same way Vercel will build:

```bash
npm run build
npm start
```

This runs `.next/` production build locally.

## Cost

**Vercel free tier includes:**
- 100 GB bandwidth/month
- 1000 function executions/day
- 12 serverless function hours/month
- Automatic SSL
- Custom domains

**Perfect for personal projects!**

## Rollback

If deployment breaks production:

1. Go to **Deployments** tab
2. Find previous good deployment
3. Click **Promote to Production**
4. Live immediately (no rebuild)

## Next Steps

1. ✅ Create Vercel account + project
2. ✅ Generate tokens and secrets
3. ✅ Add GitHub secrets
4. ✅ Set Vercel environment variables
5. ✅ Push to main or create PR to test
6. ✅ Verify deployment URL works
