# Testing Guide - Before Launch

## 🧪 Critical Tests

### 1. Bot Startup Test

```bash
# Test if bot starts
node index.js
```

**Check:**
- ✅ Bot connects to Discord
- ✅ No errors in console
- ✅ Commands are registered
- ✅ Events are loaded
- ✅ Database connects

**If errors:**
- Check `.env` file exists
- Check `DISCORD_TOKEN` is valid
- Check all dependencies installed (`npm install`)
- Check bot intents are enabled in Discord Developer Portal

### 2. Command Tests

Test each command category:

**Security Commands:**
```bash
/antiraid enable
/antiraid disable
/joinraid enable
/joingate enable
/security audit
```

**Moderation Commands:**
```bash
/ban add @user reason
/kick @user reason
/warn @user reason
/mute @user 1h reason
/purge 10
```

**Utility Commands:**
```bash
/help
/invite
/support
/dashboard
/stats server
/ping
```

**AI Commands:**
```bash
/recommend analyze
/behavior analyze @user
/threatnet check @user
/queue view
```

**Test with:**
- ✅ Valid input
- ✅ Invalid input (missing user, invalid time, etc.)
- ✅ Missing permissions
- ✅ Invalid command options

### 3. Event Tests

**Test Events:**
- ✅ Join server → Bot joins, commands register
- ✅ Member joins → Anti-raid checks, welcome message
- ✅ Message sent → Auto-mod checks, XP gain
- ✅ Channel deleted → Notification sent
- ✅ Role deleted → Notification sent
- ✅ Member banned → Queue updated

**How to test:**
1. Create test server
2. Add bot
3. Trigger each event
4. Check if handlers fire
5. Check for errors

### 4. Database Tests

**Test Database:**
```javascript
// In Node.js console or test script
const db = require('./utils/database');

// Test read
db.getServerConfig('GUILD_ID').then(console.log);

// Test write
db.setServerConfig('GUILD_ID', { prefix: '!' }).then(console.log);

// Test tables exist
// Check data/nexus.db file exists
```

**Check:**
- ✅ Database file is created
- ✅ Tables are created
- ✅ Can read data
- ✅ Can write data
- ✅ No SQL errors

### 5. Error Handling Tests

**Test Error Cases:**
- ✅ Invalid command input
- ✅ Missing permissions
- ✅ Rate limits
- ✅ Database errors
- ✅ API errors
- ✅ Network errors

**What to check:**
- Bot doesn't crash
- Errors are logged
- User gets error message
- Bot recovers gracefully

### 6. Permission Tests

**Test Permissions:**
- ✅ Admin commands require admin
- ✅ Mod commands require mod
- ✅ User commands work for everyone
- ✅ Bot has required permissions

**How to test:**
1. Remove bot permissions
2. Try commands
3. Check error messages
4. Restore permissions
5. Try again

### 7. Performance Tests

**Test Performance:**
- ✅ Commands respond quickly (< 2 seconds)
- ✅ Database queries are fast
- ✅ No memory leaks
- ✅ Bot handles load

**How to test:**
1. Run multiple commands quickly
2. Check response times
3. Monitor memory usage
4. Check for slowdowns

### 8. Security Tests

**Test Security:**
- ✅ No tokens in code
- ✅ Input is validated
- ✅ SQL is parameterized
- ✅ Rate limiting works
- ✅ Permissions are checked

**How to test:**
1. Search code for hardcoded tokens
2. Try SQL injection (should fail safely)
3. Try command spam (should rate limit)
4. Try unauthorized commands (should fail)

## 🐛 Common Bugs to Check

### Bug 1: Commands Not Registering
**Symptoms:** Commands don't show in Discord
**Fix:** 
- Check `registerCommands.js`
- Check command syntax
- Restart bot
- Check bot permissions

### Bug 2: Database Errors
**Symptoms:** Database operations fail
**Fix:**
- Check database path
- Check file permissions
- Check SQL syntax
- Check table creation

### Bug 3: Events Not Firing
**Symptoms:** Events don't trigger
**Fix:**
- Check event files exist
- Check event names match
- Check event registration
- Check intents are enabled

### Bug 4: Bot Crashes
**Symptoms:** Bot stops working
**Fix:**
- Check error logs
- Check error handling
- Check for unhandled promises
- Check for memory leaks

### Bug 5: Commands Timeout
**Symptoms:** Commands take too long
**Fix:**
- Check database queries
- Check API calls
- Check for infinite loops
- Optimize slow operations

## ✅ Pre-Launch Test Script

Run these tests before launching:

```bash
# 1. Install dependencies
npm install

# 2. Check .env exists
# (manually check .env file)

# 3. Test bot startup
node index.js
# (let it run for 30 seconds, check for errors)

# 4. Test commands (in Discord)
# Run each command category

# 5. Test events (in Discord)
# Trigger each event type

# 6. Check logs
# Look for errors or warnings
```

## 🚨 Red Flags

**Don't launch if:**
- ❌ Bot crashes on startup
- ❌ Commands don't register
- ❌ Database errors occur
- ❌ Events don't fire
- ❌ Errors aren't handled
- ❌ Placeholders aren't replaced
- ❌ Tokens are hardcoded
- ❌ No error logging

**Fix these first!**

## 📝 Test Results Template

```
Bot Startup: [ ] Pass [ ] Fail
Commands: [ ] Pass [ ] Fail
Events: [ ] Pass [ ] Fail
Database: [ ] Pass [ ] Fail
Error Handling: [ ] Pass [ ] Fail
Permissions: [ ] Pass [ ] Fail
Performance: [ ] Pass [ ] Fail
Security: [ ] Pass [ ] Fail

Issues Found:
1. 
2. 
3. 

Ready to Launch: [ ] Yes [ ] No
```

---

**Test thoroughly before launching!**

---

_Testing Guide - 2024_

