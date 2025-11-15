# Auto Deployment Setup

This repository is configured to automatically deploy all Cloudflare Workers when code is pushed to the `master` branch.

## Workers Deployed

- **app** (zine worker) - `apps/app`
- **dash** (admin dashboard with workflows) - `apps/dash`
- **landing-page** - `apps/landing-page`

## GitHub Secrets Required

To enable auto-deployment, add the following secrets to your GitHub repository:

### 1. CLOUDFLARE_API_TOKEN

Generate an API token from Cloudflare:
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template
4. Add the following permissions:
   - Account > Workers Scripts > Edit
   - Account > Workers KV Storage > Edit
   - Account > Workers Routes > Edit
   - Account > D1 > Edit
   - Account > Vectorize > Edit
   - Account > Workflows > Edit
5. Set Account Resources to your specific account
6. Set Zone Resources to "All zones" or specific zones (zinelocal.com)
7. Click "Continue to summary" → "Create Token"
8. Copy the token immediately (you won't see it again!)

### 2. CLOUDFLARE_ACCOUNT_ID

Find your Account ID:
1. Go to https://dash.cloudflare.com/
2. Click "Workers & Pages" in the left sidebar
3. Your Account ID is shown in the right sidebar
4. Or find it in the URL: `dash.cloudflare.com/<account-id>/...`

## Adding Secrets to GitHub

1. Go to your repository on GitHub
2. Click "Settings" → "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Add both secrets:
   - Name: `CLOUDFLARE_API_TOKEN`, Value: `<your-token>`
   - Name: `CLOUDFLARE_ACCOUNT_ID`, Value: `<your-account-id>`

## How It Works

The workflow (`.github/workflows/deploy.yml`) will:
1. Trigger on every push to `master` or `main` branch
2. Install dependencies with `bun install`
3. Build all workers with `bun run build`
4. Deploy each worker individually using `bunx wrangler deploy`

## Manual Deployment

You can still deploy manually:

```bash
# Build all workers
bun run build

# Deploy specific worker
cd apps/app && bunx wrangler deploy
cd apps/dash && bunx wrangler deploy
cd apps/landing-page && bunx wrangler deploy
```

## Troubleshooting

- **Authentication errors**: Verify your API token has the correct permissions
- **Build errors**: Test the build locally with `bun run build`
- **Deployment errors**: Check the Actions tab in GitHub for detailed logs
- **Missing bindings**: Ensure all environment variables and secrets are configured in Cloudflare dashboard
