# 🧪 Edge Case Testing Checklist

## Test These Scenarios Before NTTS Does

---

## 🎯 Command Testing

### **Test EVERY Command With:**

#### **1. No Permissions**
```
Remove your admin role
Try: /ban, /kick, /lockdown, /config
Expected: Clear permission error message
```

#### **2. Bot No Permissions**
```
Remove bot's admin role
Try: /ban @someone
Expected: "I need Ban Members permission" error
```

#### **3. Target Yourself**
```
Try: /ban @yourself
Expected: "You can't ban yourself" error
```

#### **4. Target the Bot**
```
Try: /ban @NexusBot
Expected: "Nice try, but you can't ban me" error
```

#### **5. Target Server Owner**
```
Try: /ban @ServerOwner
Expected: "Can't target server owner" error
```

#### **6. Missing Arguments**
```
Try: /ban (with no user)
Expected: Discord shows it's required OR clear error
```

#### **7. Invalid Arguments**
```
Try: /timeout duration:999999
Expected: "Duration must be between X and Y" error
```

---

## 🏠 Server-Specific Tests

### **Empty Server (0 Members)**
```
Create test server with ONLY you and the bot
Try:
- /serverinfo (should handle 1 member)
- /stats (should handle empty data)
- /leaderboard (should handle no users)
Expected: Graceful handling, no crashes
```

### **Massive Server (Simulated)**
```
Try:
- /purge 1000 (test limits)
- /bulk ban (max users)
Expected: Proper limits, no crashes
```

### **No Channels**
```
Delete all channels except one
Try:
- /setup (should handle minimal channels)
- /logs set moderation (no channel to set)
Expected: Clear errors, no crashes
```

---

## 💬 Message Testing

### **Very Long Inputs**
```
Try:
- /custom create with 2000+ char description
- /warn reason with max length
- /notes add with huge note
Expected: Truncation or clear limit error
```

### **Special Characters**
```
Try:
- Username with emojis: /ban @👻🔥💀
- Reason with quotes: /ban reason:"He said "hi""
- SQL injection attempt: /notes add note:"'; DROP TABLE--"
Expected: Properly escaped, no SQL injection
```

### **Unicode/Emoji Spam**
```
Try:
- /poll question:"💀💀💀💀💀💀" (100 emojis)
Expected: Handles gracefully
```

---

## ⏰ Timing Tests

### **Rapid Command Spam**
```
Run /ping 50 times rapidly
Expected:
- Bot doesn't crash
- Rate limiting works
- Clear cooldown messages
```

### **Concurrent Commands**
```
Have 5 friends run /ban simultaneously
Expected:
- No race conditions
- All execute properly
- No database locks
```

### **Long-Running Commands**
```
Try:
- /backup (might take a while)
- /analytics (lots of data)
Expected: Proper "Processing..." feedback
```

---

## 🔒 Security Tests

### **Permission Bypass Attempts**
```
1. Remove admin role
2. Use /eval or /config
3. Try to @everyone ping
Expected: Blocked by permission checks
```

### **SQL Injection**
```
Try:
- /config set key:"guild_id' OR '1'='1"
- /notes add note:"'; DROP TABLE users--"
Expected: Properly parameterized, no injection
```

### **XSS Attempts** (Dashboard)
```
Try:
- Username: <script>alert('xss')</script>
- Config value: <img src=x onerror=alert(1)>
Expected: Properly escaped in dashboard
```

---

## 🌐 Network Tests

### **Discord API Down**
```
Simulate: Disconnect internet briefly
Try: /ban @someone
Expected: Graceful error, retry logic
```

### **Database Locked**
```
Simulate: Open DB in another process
Try: Any DB command
Expected: Timeout error, no crash
```

### **Rate Limited by Discord**
```
Try: /purge 1000 messages (hits rate limit)
Expected: Handles 429 errors gracefully
```

---

## 👤 User Tests

### **Deleted User**
```
Ban someone, then try /userinfo on them
Expected: "User not found" or shows cached data
```

### **User Left Server**
```
/warn @user (who just left)
Expected: Clear error message
```

### **Bot User**
```
Try: /ban @AnotherBot
Expected: Allowed (bots can be banned)
```

---

## 📊 Data Tests

### **Empty Database**
```
Fresh database with no data
Try:
- /stats
- /leaderboard
- /cases view
Expected: "No data yet" messages, not errors
```

### **Corrupted Data**
```
Manually edit DB with invalid data
Try: Commands that read that data
Expected: Validation catches it, clear error
```

### **Very Old Data**
```
Add data from 2 years ago
Try: /analytics
Expected: Handles old timestamps
```

---

## 🎮 DM vs Server Tests

### **Commands That Should Work in DMs:**
```
- /help (info only)
- /ping (general info)
- /support (opens ticket)
Expected: Work normally
```

### **Commands That Shouldn't Work in DMs:**
```
- /ban (requires server)
- /setup (requires server)
- /serverinfo (requires server)
Expected: "This command only works in servers" error
```

---

## 🔄 State Tests

### **Bot Restart During Command**
```
Run /backup
Restart bot mid-execution
Expected: Proper cleanup, no hanging state
```

### **User Leaves During Command**
```
User runs /ticket create
User leaves server immediately
Expected: Ticket creates or cancels cleanly
```

---

## 🧪 Chaos Monkey Tests

### **Random Chaos:**
```
- Change bot's nickname mid-command
- Delete role being assigned
- Remove channel being used
- Change permissions mid-execution
Expected: Graceful degradation, no crashes
```

---

## ✅ Testing Priority

### **Phase 1: Critical (Test Now)**
- [ ] Permission errors (all major commands)
- [ ] Target validation (ban, kick, warn)
- [ ] Database errors (all DB commands)
- [ ] Rate limiting (rapid spam)

### **Phase 2: Important (Test This Week)**
- [ ] Special characters
- [ ] Empty server
- [ ] DM vs server
- [ ] Long inputs

### **Phase 3: Nice to Have (Test Eventually)**
- [ ] Network errors
- [ ] Corrupted data
- [ ] Chaos monkey
- [ ] Very old data

---

## 📝 Test Results Template

```
Command: /ban
Date: [Date]

✅ Passed: Missing permissions
✅ Passed: Bot missing permissions
✅ Passed: Target self
✅ Passed: Target bot
❌ FAILED: Target owner (crashed instead of error)
✅ Passed: Missing user argument

Issues Found: 1
Priority: HIGH (fix ASAP)
```

---

## 🐛 When You Find a Bug

1. **Document it:**
   - Command
   - Steps to reproduce
   - Expected vs actual
   - Error message/log

2. **Prioritize it:**
   - Critical: Crashes bot
   - High: Breaks important feature
   - Medium: Confusing error
   - Low: Minor issue

3. **Fix it:**
   - Critical: Fix immediately
   - High: Fix within 24h
   - Medium: Fix this week
   - Low: Fix when convenient

4. **Test the fix:**
   - Reproduce original bug
   - Verify fix works
   - Test related features

---

**Start testing the top 10 most-used commands first!** 🧪

