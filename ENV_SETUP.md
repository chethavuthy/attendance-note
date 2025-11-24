# Environment Variables Setup Guide

## Where to Add Environment Variables

### Option 1: Vercel Dashboard (Recommended)

1. Go to your project on https://vercel.com
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add each variable:

#### For Vercel KV:
- **Key:** `KV_REST_API_URL`
- **Value:** `***************` (your KV REST API URL)
- **Environment:** Production, Preview, Development (select all)

- **Key:** `KV_REST_API_TOKEN`
- **Value:** `*****************` (your KV REST API Token)
- **Environment:** Production, Preview, Development (select all)

- **Key:** `KV_REST_API_READ_ONLY_TOKEN` (optional)
- **Value:** `***************************` (your read-only token)
- **Environment:** Production, Preview, Development (select all)

- **Key:** `KV_URL` (optional)
- **Value:** `******` (your KV URL)
- **Environment:** Production, Preview, Development (select all)

- **Key:** `REDIS_URL` (optional)
- **Value:** `*********` (your Redis URL)
- **Environment:** Production, Preview, Development (select all)

#### Required:
- **Key:** `BOT_TOKEN`
- **Value:** Your Telegram bot token
- **Environment:** Production, Preview, Development (select all)

#### Optional:
- **Key:** `CRON_SECRET`
- **Value:** A random secret string for cron endpoint security
- **Environment:** Production, Preview, Development (select all)

6. Click **Save** after adding each variable
7. **Redeploy** your project for changes to take effect

### Option 2: Using Vercel CLI

```bash
# Set environment variables
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
vercel env add BOT_TOKEN

# For each environment (production, preview, development)
# You'll be prompted to enter the value
```

### Option 3: Using .env.local (Local Development Only)

Create a `.env.local` file in your project root:

```env
BOT_TOKEN=your_telegram_bot_token
KV_REST_API_URL=your_kv_rest_api_url
KV_REST_API_TOKEN=your_kv_rest_api_token
KV_REST_API_READ_ONLY_TOKEN=your_read_only_token
KV_URL=your_kv_url
REDIS_URL=your_redis_url
CRON_SECRET=your_random_secret
```

**Important:** Never commit `.env.local` to git! It's already in `.gitignore`.

## After Adding Variables

1. **Redeploy** your project:
   - Go to Vercel Dashboard → Deployments
   - Click the three dots on latest deployment → Redeploy
   - Or push a new commit to trigger redeploy

2. **Verify** variables are set:
   - Go to Settings → Environment Variables
   - Check that all variables are listed

## Which Variables Do I Need?

- **If using Vercel KV:** Add `KV_REST_API_URL` and `KV_REST_API_TOKEN` (minimum required)
- **If using Upstash Redis:** Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` instead
- **Always required:** `BOT_TOKEN` (your Telegram bot token)
