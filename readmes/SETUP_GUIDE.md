# Setup Guide - Before First Launch

## ⚠️ CRITICAL: Do These First

### 1. Create `.env` File

Create a `.env` file in the root directory:

```env
DISCORD_TOKEN=your_bot_token_here
API_ENABLED=false
API_PORT=3000
API_HOST=127.0.0.1
```

**How to get your bot token:**
1. Go to https://discord.com/developers/applications
2. Create a new application (or select existing)
3. Go to "Bot" section
4. Click "Reset Token" or "Copy" to get your token
5. Paste it in `.env` file

### 2. Enable Bot Intents

In Discord Developer Portal:
1. Go to your application
2. Go to "Bot" section
3. Scroll to "Privileged Gateway Intents"
4. Enable:
   - ✅ PRESENCE INTENT
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT

**Without these, the bot won't work properly!**

### 3. Install Dependencies

```bash
npm install
```

### 4. Replace Placeholders

**In these files, replace:**
- `YOUR_SUPPORT_SERVER` → Your Discord server invite
- `YOUR_USERNAME` → Your GitHub username
- `YOUR_BOT_ID` → Your bot's client ID
- `[Date]` → Current date
- `[Your Email]` → Your contact email

**Files to update:**
- `commands/invite.js`
- `commands/support.js`
- `PRIVACY_POLICY.md`
- `TERMS_OF_SERVICE.md`
- `DATA_HANDLING.md`

### 5. Test Bot Startup

```bash
# Test single instance
node index.js

# OR test with sharding
node shard.js
```

**Check for:**
- ✅ Bot connects to Discord
- ✅ Commands register
- ✅ No errors in console
- ✅ Database connects

## 🧪 Testing Checklist

### Basic Tests

- [ ] Bot starts without errors
- [ ] Bot appears online in Discord
- [ ] Commands show up when typing `/`
- [ ] `/help` command works
- [ ] `/ping` command works
- [ ] `/invite` command works
- [ ] `/support` command works

### Security Tests

- [ ] `/antiraid enable` works
- [ ] `/joingate enable` works
- [ ] Member joins trigger checks
- [ ] Raid detection works
- [ ] Nuke detection works

### Moderation Tests

- [ ] `/ban add @user reason` works
- [ ] `/kick @user reason` works
- [ ] `/warn @user reason` works
- [ ] `/mute @user 1h reason` works
- [ ] `/purge 10` works

### AI Features Tests

- [ ] `/recommend analyze` works
- [ ] `/behavior analyze @user` works
- [ ] `/threatnet check @user` works
- [ ] `/queue view` works

## 🐛 Common Issues

### Issue: "DISCORD_TOKEN not found"
**Fix:** Create `.env` file with `DISCORD_TOKEN=your_token`

### Issue: "Invalid token"
**Fix:** Check token in Discord Developer Portal, make sure it's correct

### Issue: "Missing intents"
**Fix:** Enable intents in Discord Developer Portal

### Issue: "Commands not showing"
**Fix:** 
- Wait 5 minutes (Discord cache)
- Restart bot
- Check command registration in console

### Issue: "Database errors"
**Fix:**
- Check `data/` folder exists
- Check file permissions
- Check SQL syntax

## ✅ Pre-Launch Checklist

### Critical
- [ ] `.env` file exists with valid token
- [ ] Bot intents are enabled
- [ ] Dependencies installed (`npm install`)
- [ ] Bot starts without errors
- [ ] Commands register
- [ ] Basic commands work
- [ ] Placeholders replaced

### Important
- [ ] Support server created
- [ ] GitHub repo created
- [ ] Legal docs customized
- [ ] Bot list descriptions ready
- [ ] Error handling works
- [ ] Database works

### Nice to Have
- [ ] Documentation complete
- [ ] FAQ ready
- [ ] Social media accounts
- [ ] Announcement ready

## 🚀 First Launch Steps

1. **Create `.env` file** with your token
2. **Enable bot intents** in Discord Developer Portal
3. **Install dependencies** (`npm install`)
4. **Replace placeholders** in files
5. **Test bot startup** (`node index.js`)
6. **Test commands** in Discord
7. **Fix any errors**
8. **Then** submit to bot lists

## ⚠️ Don't Launch Until

- ❌ Bot doesn't start
- ❌ Commands don't work
- ❌ Errors in console
- ❌ Placeholders not replaced
- ❌ Token is invalid
- ❌ Intents not enabled

---

**Take your time. Test thoroughly. Don't rush.**

---

_Setup Guide - 2024_

