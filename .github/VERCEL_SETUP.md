# Vercel Deployment Setup

## Prerequisites

1. Vercel account (free tier supported)
2. Project deployed to Vercel (manually or via Vercel CLI)
3. GitHub repository with this CI/CD setup

## One-Time Setup

### 1. Link Repo to Vercel Project

**Via Vercel Dashboard:**
1. Go to https://vercel.com/dashboard → New Project → Import GitHub repo
2. Select Next.js framework → Deploy

**Via CLI:**
```bash
npm i -g vercel
vercel link
vercel env pull
```

### 2. GitHub Secrets Required

| Secret | Where to get it |
|--------|-----------------|
| `VERCEL_TOKEN` | https://vercel.com/account/tokens |
| `VERCEL_PROJECT_ID` | Vercel project settings |
| `VERCEL_ORG_ID` | Vercel account settings |
| `DATABASE_URL` | Neon dashboard |
| `AUTH_SECRET` | Generate: `openssl rand -base64 32` |
| `GCP_PROJECT_ID` | GCP Console |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | GCP IAM → Workload Identity |
| `GCP_SERVICE_ACCOUNT` | GCP IAM → Service Accounts |

The GCP secrets must be stored as **Environment secrets** scoped to `Production`.

## Deployment Flow

```
git push main → build → deploy-production
PR             → build → unit-test → e2e-test (no deploy)
```

## Troubleshooting

### Deployment succeeds but app errors
- Check Environment Variables in Vercel dashboard → Settings → Environment Variables
- Check function logs: **Deployments → {latest} → Logs**

### BigQuery sync fails
- Verify GCP secrets are set under the **Production** environment (not repository secrets)

## Rollback

1. Go to **Deployments** tab in Vercel
2. Find previous good deployment → **Promote to Production**
