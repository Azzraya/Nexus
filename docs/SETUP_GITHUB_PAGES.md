# GitHub Pages Setup Guide

## 📝 Step-by-Step Setup (5 minutes)

### Step 1: Push to GitHub
If you haven't already, push this repo to GitHub:
```bash
git add .
git commit -m "Add landing page"
git push origin main
```

### Step 2: Enable GitHub Pages
1. Go to your GitHub repo: `https://github.com/Azzraya/Nexus`
2. Click **Settings** (top right)
3. Scroll down to **Pages** (left sidebar)
4. Under **Source**, select:
   - Source: **GitHub Actions**
5. Click **Save**

### Step 3: Deploy
The GitHub Action will automatically deploy when you push to `main` branch.

Wait 1-2 minutes, then your site will be live at:
```
https://azzraya.github.io/Nexus/
```

### Step 4: Update Bot Lists
Use these URLs on each bot list:

**Top.gg:**
```
https://azzraya.github.io/Nexus/?source=topgg
```

**Discord Bot List:**
```
https://azzraya.github.io/Nexus/?source=discordbotlist
```

**Void Bots:**
```
https://azzraya.github.io/Nexus/?source=voidbots
```

**Reddit:**
```
https://azzraya.github.io/Nexus/?source=reddit
```

**YouTube:**
```
https://azzraya.github.io/Nexus/?source=youtube
```

**Discord Ads:**
```
https://azzraya.github.io/Nexus/?source=discord
```

---

## 📊 How Tracking Works

When someone clicks a link:
1. Page loads with `?source=topgg` (or whatever source)
2. JavaScript tracks the click
3. **Sends to your Discord webhook:**
```
📊 Nexus Invite Click
Source: topgg
Referrer: https://top.gg/bot/...
Time: [timestamp]
```
4. Redirects to Discord OAuth
5. User adds bot to server

You'll see **every click** in your Discord channel!

---

## 🔧 Optional: Custom Domain

Want `nexusbot.com` instead of `azzraya.github.io/Nexus`?

### Step 1: Buy domain ($12/year)
- Namecheap
- Google Domains
- Cloudflare

### Step 2: Configure DNS
Add CNAME record:
```
CNAME  www  azzraya.github.io
```

### Step 3: Update GitHub Pages
In repo Settings → Pages:
- Custom domain: `www.nexusbot.com`
- Save

Done! Your site is now at `nexusbot.com`

---

## ✅ That's It!

**Total cost:** $0 (or $12/year for custom domain)
**Setup time:** 5 minutes
**Tracking:** Perfect - see every click source

Once you push to GitHub, the site auto-deploys. Any changes you make to `/website` folder will automatically update the live site.

---

## 🎯 What You'll See in Discord

Every time someone clicks your invite link:
```
📊 Nexus Invite Click
━━━━━━━━━━━━━━━━
Source: topgg
Referrer: https://top.gg/bot/1444739230679957646
Time: December 2, 2025 5:30 PM
━━━━━━━━━━━━━━━━
User Agent: Mozilla/5.0 (Windows NT 10.0...)
```

Track which bot lists drive the most traffic! 📈

