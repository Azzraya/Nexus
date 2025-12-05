# Nexus Landing Page with Click Tracking

## 🎯 Purpose

Professional landing page that tracks invite clicks by source and sends data to Discord webhook.

## 📊 What Gets Tracked

### Every Click:

- Source (hero, cta, footer, etc.)
- Timestamp
- Referrer (where they came from)
- User agent (device/browser)
- Screen size

### Every Page View:

- Referrer URL
- Timestamp
- Page path

### Sent To:

Discord webhook in your server - you'll get embeds showing each click/view.

## 🚀 Deployment Options

### Option 1: Netlify (Recommended)

1. Create Netlify account
2. Connect GitHub repo
3. Set build settings:
   - Build command: (none needed)
   - Publish directory: `website`
4. Deploy!
5. Add custom domain (optional)

### Option 2: GitHub Pages

1. Push to GitHub
2. Settings → Pages
3. Source: `main` branch, `/website` folder
4. Done! URL: `yourusername.github.io/nexus`

### Option 3: Cloudflare Pages

1. Create Cloudflare account
2. Pages → Create project
3. Connect GitHub
4. Set build:
   - Build command: (none)
   - Build output: `website`
5. Deploy!

## 📝 Custom URLs for Bot Lists

Once deployed, use these URLs on each bot list:

### Top.gg:

`https://yourdomain.com/?source=topgg`

### Discord Bot List:

`https://yourdomain.com/?source=discordbotlist`

### Void Bots:

`https://yourdomain.com/?source=voidbots`

### Reddit:

`https://yourdomain.com/?source=reddit`

### YouTube:

`https://yourdomain.com/?source=youtube`

The script automatically detects `?source=` in URL and tracks it!

## 🔧 Customization

### Change Discord Invite:

Edit `script.js` line 2:

```javascript
const DISCORD_INVITE = "your_invite_url";
```

### Change Webhook:

Edit `script.js` line 1:

```javascript
const WEBHOOK_URL = "your_webhook_url";
```

### Change Content:

Edit `index.html` - all text is easily modifiable.

## 📈 What You'll See in Discord

### Click Webhook:

```
📊 Nexus Invite Click
Source: topgg
Referrer: https://top.gg/bot/...
Time: December 2, 2025 5:30 PM
```

### Page View Webhook:

```
👁️ Nexus Page View
Referrer: https://reddit.com/r/Discord
Page: /
```

## 🎨 Customize Colors

In `styles.css`:

```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

Change to your brand colors!

## ✅ Ready to Deploy

All files are in `/website` folder. Just push to any hosting platform!

No backend needed. Pure HTML/CSS/JS. Works everywhere.
