# GitHub & Vercel Setup

## Required GitHub Secrets

Add these secrets to your GitHub repository settings (**Settings → Secrets and variables → Actions**):

### Database & Auth
- `DATABASE_URL` - Neon PostgreSQL connection string
- `AUTH_SECRET` - Random 32+ char secret for signing session cookies

### Vercel Integration
- `VERCEL_TOKEN` - [Get from Vercel](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` - Found in Vercel project settings
- `VERCEL_PROJECT_ID` - Found in Vercel project settings

### GCP / BigQuery Sync
- `GCP_PROJECT_ID` - GCP project ID
- `GCP_WORKLOAD_IDENTITY_PROVIDER` - Workload Identity Federation provider resource name
- `GCP_SERVICE_ACCOUNT` - Service account email for BigQuery sync

## Local Development

Copy `.env.example` to `.env.local` and fill in your values:
```bash
cp .env.example .env.local
```

### Running Locally
```bash
npm install
npm run dev
```

## Troubleshooting

### "VERCEL_TOKEN invalid"
- Regenerate token from [vercel.com/account/tokens](https://vercel.com/account/tokens)
- Ensure token has proper permissions for the project

### BigQuery sync fails
- Verify all three `GCP_*` secrets are set under the **Production** environment (not repository secrets)
- Check the `Sync to BigQuery` workflow run logs in Actions tab
