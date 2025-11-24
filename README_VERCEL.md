# Vercel Deployment Guide

## Features
All features work on Vercel including scheduled alerts!

## Setup Steps

### 1. Deploy to Vercel
```bash
vercel
```

### 2. Set Environment Variables
In Vercel dashboard, go to:
**Settings → Environment Variables**

Add these variables:

**Required:**
- `BOT_TOKEN` - Your Telegram bot token

**For Vercel KV (if using):**
- `KV_REST_API_URL` - Your KV REST API URL
- `KV_REST_API_TOKEN` - Your KV REST API Token
- `KV_REST_API_READ_ONLY_TOKEN` (optional) - Read-only token
- `KV_URL` (optional) - KV URL
- `REDIS_URL` (optional) - Redis URL

**For Upstash Redis (if using instead of KV):**
- `UPSTASH_REDIS_REST_URL` - Your Upstash REST URL
- `UPSTASH_REDIS_REST_TOKEN` - Your Upstash REST Token

**Optional:**
- `CRON_SECRET` - Secret token for cron endpoint security

**Note:** If you have both KV and Upstash credentials, Upstash will be used first (it's free!).

### 3. Set Up Storage (Choose One)

#### Option A: Upstash Redis (FREE - Recommended)
1. Go to https://upstash.com and sign up (free tier available)
2. Create a new Redis database
3. Copy the REST URL and Token
4. In Vercel Dashboard → Settings → Environment Variables, add:
   - `UPSTASH_REDIS_REST_URL` - Your Upstash REST URL
   - `UPSTASH_REDIS_REST_TOKEN` - Your Upstash REST Token

#### Option B: Vercel KV (Pro Plan Required)
1. Go to Vercel Dashboard → Storage → Create Database → KV
2. The KV credentials will be automatically available
3. Note: Vercel KV requires a Pro plan ($20/month)

#### Option C: File System (Local Development Only)
- No setup needed, uses local files
- Not recommended for production on Vercel

### 4. Set Up Webhook
After deployment, set your Telegram webhook:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_URL>/api/webhook"
```

### 5. Set Up Scheduled Alerts (Choose One)

#### Option A: Vercel Cron Jobs (Pro Plan)
If you have Vercel Pro, cron jobs are already configured in `vercel.json`. They run every 30 minutes automatically.

#### Option B: External Cron Service (Free Tier)
For free tier, use an external cron service:

**Using cron-job.org:**
1. Go to https://cron-job.org
2. Create a new cron job
3. URL: `https://<YOUR_VERCEL_URL>/api/cron/alerts?secret=<YOUR_CRON_SECRET>`
4. Schedule: Every 30 minutes (`*/30 * * * *`)
5. Save

**Using EasyCron:**
1. Go to https://www.easycron.com
2. Create a new cron job
3. URL: `https://<YOUR_VERCEL_URL>/api/cron/alerts?secret=<YOUR_CRON_SECRET>`
4. Schedule: Every 30 minutes
5. Save

**Using GitHub Actions (Free):**
Create `.github/workflows/cron.yml`:
```yaml
name: Alert Cron
on:
  schedule:
    - cron: '*/30 * * * *'
jobs:
  cron:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger alerts
        run: |
          curl "https://<YOUR_VERCEL_URL>/api/cron/alerts?secret=${{ secrets.CRON_SECRET }}"
```

## How It Works

- **Webhook**: Telegram sends updates to `/api/webhook`
- **Cron**: Runs every 30 minutes to check and send scheduled alerts
- **Storage**: All data (preferences, attendance, states) stored in:
  - Upstash Redis (free tier) - Recommended
  - Vercel KV (Pro plan) - Alternative
  - File system (local dev only)
- **Test Alerts**: Stored in storage and picked up by cron job

## Storage Options Comparison

| Feature | Upstash Redis | Vercel KV | File System |
|---------|---------------|-----------|-------------|
| **Free Tier** | ✅ Yes (10K commands/day) | ❌ No (Pro only) | ✅ Yes |
| **Setup** | Easy (sign up, get credentials) | Easy (auto-configured) | None |
| **Performance** | Fast | Fast | Slow (local only) |
| **Recommended** | ✅ **Yes** | If you have Pro | Local dev only |

## Features Status

✅ Check In/Out  
✅ Photo attachments  
✅ Monthly reports  
✅ Excel exports  
✅ Scheduled alerts (check-in/check-out reminders)  
✅ Test alerts  
✅ User preferences  

All features work on Vercel!
