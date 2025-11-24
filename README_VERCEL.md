# Vercel Deployment Guide

## Features
All features work on Vercel including scheduled alerts!

## Setup Steps

### 1. Deploy to Vercel
```bash
vercel
```

### 2. Set Environment Variables
In Vercel dashboard, add:
- `BOT_TOKEN` - Your Telegram bot token
- `CRON_SECRET` (optional) - Secret token for cron endpoint security

### 3. Create Vercel KV Database
1. Go to Vercel Dashboard → Storage → Create Database → KV
2. The KV credentials will be automatically available

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
- **KV Storage**: All data (preferences, attendance, states) stored in Vercel KV
- **Test Alerts**: Stored in KV and picked up by cron job

## Features Status

✅ Check In/Out  
✅ Photo attachments  
✅ Monthly reports  
✅ Excel exports  
✅ Scheduled alerts (check-in/check-out reminders)  
✅ Test alerts  
✅ User preferences  

All features work on Vercel!

