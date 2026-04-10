# GitHub Automation & Claude Code Review Cycle

This project uses GitHub Actions + Claude Code for automated issue creation and PR review.

## Setup Required

### 1. Install Claude Code GitHub App (One-time)

1. Go to https://github.com/apps/claude-code (or search "Claude Code" in GitHub Apps)
2. Click "Install" and select this repository
3. Authorize the app with your GitHub account
4. This uses your existing Claude Max subscription — **no extra cost**

### 2. Set up API Key for `anthropics/claude-code-action`

The GitHub Actions workflows need an API key:

1. Go to https://console.anthropic.com/account/keys
2. Create a new API key (keep this secret)
3. In your GitHub repo settings:
   - Go to **Settings → Secrets and variables → Actions**
   - Click **New repository secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: paste your API key
4. Save

**Cost note**: Each workflow run uses Claude Haiku (cheap). Typical costs:
- **Issue creation**: ~$0.01 per run (weekly)
- **PR review**: ~$0.02-0.05 per review
- **Total**: ~$1-2/month

---

## The Workflow

### 1. Issues are Created Automatically

**Trigger**: Every Monday at 9am UTC (via `create-issues.yml`)

- Claude scans the codebase
- Identifies improvement opportunities
- Creates GitHub issues via `gh issue create`

**Manual trigger**: Push to any branch and run:
```bash
gh workflow run create-issues.yml
```

### 2. You Trigger Issue Resolution

**On any open issue**, comment:

```
@claude implement this issue
```

This triggers the Claude Code GitHub App, which:
- Creates a feature branch
- Writes code to fix the issue
- Opens a pull request linking to the issue
- Runs your existing CI/CD (tests, lint, build)

**Note**: The `@claude` mention uses Claude Code's GitHub integration (included with Claude Max subscription).

### 3. PR Review Happens Automatically

**Trigger**: When a PR is opened or updated (via `claude-review.yml`)

Claude:
- Reviews the code changes
- Adds comments on specific lines
- Points out bugs, security issues, performance problems
- **Never auto-approves or auto-merges**
- You always review and decide whether to merge

---

## Cost Breakdown

| Component | Cost | Frequency | Monthly |
|-----------|------|-----------|---------|
| Issue creation workflow | $0.01 | Weekly | $0.04 |
| PR review (Haiku API) | $0.02-0.05 | Per PR | ~$1-2 |
| Claude Code GitHub App | Included in Claude Max | - | $0 |
| GitHub Actions minutes | Free (180 min/month) | - | $0 |
| **Total** | - | - | **$1-2** |

(Your Claude Max subscription already covers the GitHub App.)

---

## Customizing the Workflows

### Change Issue Creation Schedule

Edit `.github/workflows/create-issues.yml`, line 7:
```yaml
cron: '0 9 * * 1'  # Monday 9am UTC
```

Cron format: `minute hour day month day-of-week`

Examples:
- `0 9 * * 1` = Every Monday at 9am
- `0 9 * * *` = Every day at 9am
- `0 */6 * * *` = Every 6 hours

### Change PR Review Scope

Edit `.github/workflows/claude-review.yml` and update the `direct_prompt` to focus on different aspects.

### Disable Auto-Reviews

Comment out or delete `.github/workflows/claude-review.yml` if you prefer manual review only.

---

## Troubleshooting

### "API key is invalid"
- Check you pasted the full key in GitHub Secrets
- Ensure the key wasn't accidentally truncated

### "@claude mention not working"
- Make sure Claude Code GitHub App is installed on this repo
- Go to Settings → GitHub Apps and verify "claude-code" is listed

### PR review workflow fails
- Check the workflow run logs: **Actions** tab → **Claude Code Review** → latest run
- Most common issue: API key secret not set

### Issues not created
- Check the workflow run: **Actions** tab → **Weekly Issue Suggestions**
- Verify your repo has `contents: read` and `issues: write` permissions

---

## Next Steps

1. ✅ Install Claude Code GitHub App
2. ✅ Add `ANTHROPIC_API_KEY` secret to GitHub
3. ✅ Push this branch
4. ✅ Workflows are now active
5. ✅ Test with manual trigger: `gh workflow run create-issues.yml`
