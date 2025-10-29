# Next Steps - Quick Reference Guide

**Status:** Phase 1 is 75% complete! 🎯
**Remaining:** ~3-4 hours of work to reach 100%

---

## 🚦 Current State

### ✅ What's Working:
- All security modules in place
- Path traversal protection active
- Race conditions eliminated
- Input validation framework ready
- 4 commands fully updated and working

### ⚠️ What Needs Fixing:
- 7 TypeScript build errors (all in messageCreate.ts)
- 3 commands need validation added
- A few utility files need await statements

---

## 🎯 Step-by-Step Fix Guide

### STEP 1: Fix messageCreate.ts (HIGHEST PRIORITY)
**Time:** 1-2 hours
**File:** `src/events/messageCreate.ts`
**Errors:** 7 TypeScript errors

#### Pattern to Apply:

**OLD CODE (Callback-based):**
```typescript
await new Promise((resolve) => {
    getChannelInfo(`${message.channelId}-context.json`, (channelInfo) => {
        if (channelInfo?.messages)
            resolve(channelInfo.messages);
        else {
            log(`File does not exist...`);
            resolve([]);
        }
    });
});
```

**NEW CODE (Async/await):**
```typescript
const channelInfo = await getChannelInfo(`${message.channelId}-context.json`);
if (!channelInfo) {
    log(`Creating new channel context...`);
    await saveChannelContext(message.channelId, message.channel as TextChannel);
}
const channelContextHistory = channelInfo?.messages ?? [];
```

#### Specific Fixes Needed:

**Line 24:** getChannelInfo callback → async
```typescript
// Replace lines 23-32 with:
const channelInfo = await getChannelInfo(`${message.channelId}-context.json`);
let channelContextHistory: UserMessage[] = [];

if (!channelInfo) {
    log(`Channel context does not exist. Creating...`);
    await saveChannelContext(message.channelId, message.channel as TextChannel, []);
    channelContextHistory = [];
} else {
    channelContextHistory = channelInfo.messages;
}
```

**Line 39:** getChannelInfo callback → async
```typescript
// Replace lines 34-46 with:
// (This code is redundant with above - can be removed)
```

**Lines 93, 127:** getServerConfig/getUserConfig callbacks → async
```typescript
// OLD (lines 87-117):
await new Promise((resolve, reject) => {
    getServerConfig(`${message.guildId}-config.json`, (config) => {
        if (config === undefined) {
            openConfig(`${message.guildId}-config.json`, 'toggle-chat', true);
            reject(new Error('Failed to locate or create Server Preferences'));
        } else if (!config.options['toggle-chat']) {
            reject(new Error('Chat features disabled'));
        } else {
            resolve(config);
        }
    });
});

// NEW:
const serverConfig = await getServerConfig(`${message.guildId}-config.json`);
if (!serverConfig) {
    // Create default config
    await openConfig(`${message.guildId}-config.json`, 'toggle-chat', true);
    // Retry after creation
    const retryConfig = await getServerConfig(`${message.guildId}-config.json`);
    if (!retryConfig || !retryConfig.options['toggle-chat']) {
        throw new Error('Failed to initialize server preferences');
    }
} else if (!serverConfig.options['toggle-chat']) {
    throw new Error('Admin(s) have disabled chat features. Please contact your server admins.');
}
```

**Line 129:** String vs string type
```typescript
// Change the defaultModel parameter type in events.ts line 42:
// OLD: defaultModel: String
// NEW: defaultModel: string

// Or in keys.ts, ensure it returns string not String
```

**Lines 167, 183:** Similar to lines 24/39 - use new async API

---

### STEP 2: Update Remaining Commands (30 min each)

#### pullModel.ts:
```typescript
// Add at top:
import { validateModelName, ValidationError } from '../utils/validation.js';

// In run function, add:
try {
    // Admin check FIRST (move to line 22, before deferReply)
    if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
            content: 'Admin only command',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply();

    // Validate model name
    const modelInput = validateModelName(
        interaction.options.getString('model-to-pull')
    );

    // ... rest of existing logic
} catch (error) {
    if (error instanceof ValidationError) {
        await interaction.editReply({
            content: `Validation Error: ${error.message}`
        });
    } else {
        // ... existing error handling
    }
}
```

#### deleteModel.ts:
```typescript
// Same pattern as pullModel.ts:
// 1. Add validation import
// 2. Move admin check to beginning
// 3. Validate model name input
// 4. Add ValidationError handling
// 5. Fix line 68: use editReply not reply
```

---

### STEP 3: Fix Non-Null Assertions (20 min)

**Find all occurrences:**
```bash
grep -rn "!!" src/
```

**Fix each one:**
```typescript
// threadDelete.ts:11
// OLD: thread.memberCount!!
// NEW: thread.memberCount ?? 0

// messageCreate.ts:15 (if not already fixed in Step 1)
// OLD: client.user!!.id
// NEW:
if (!client.user) {
    log('[Error] Client user not available');
    return;
}
const clientId = client.user.id;

// shutoff.ts:15
// OLD: client.user!!.tag
// NEW: client.user?.tag ?? 'Unknown'
```

---

### STEP 4: Fix Unhandled Promises (20 min)

**interactionCreate.ts:18:**
```typescript
// OLD:
command.run(client, interaction);

// NEW:
await command.run(client, interaction).catch(error => {
    log('[Command Error]', error);
});
```

**commands.ts:**
```typescript
// Line 27-34: Add .catch()
client.application.commands.fetch()
    .then((fetchedCommands) => {
        // ... existing code
    })
    .catch(error => {
        console.error('[Commands] Failed to fetch commands:', error);
    });

// Line 41-46: Add .catch()
client.application.commands.create(command)
    .then((c) => {
        // ... existing code
    })
    .catch(error => {
        console.error(`[Commands] Failed to create ${command.name}:`, error);
    });
```

**messageNormal.ts:**
```typescript
// Line 70: Add await
await channel.send(result.slice(0, 2000));

// Line 43: Add await
await channel.send("Creating new stream block...");
```

**events.ts:92:**
```typescript
// Make callback async
client.on(key, async (...args) => {
    const log = console.log.bind(console, `[Event: ${key}]`);
    try {
        await callback(..., ...args);  // Add await
    } catch (error) {
        log('[Uncaught Error]', error);
    }
});
```

---

### STEP 5: Verify Build (5 min)

```bash
npm run build
```

**Expected:** ✅ No errors!

---

### STEP 6: Run Tests (10 min)

```bash
npm run tests
npm run coverage
```

---

### STEP 7: Manual Testing (30 min)

Test each updated command:
```
/modify-capacity context-capacity:10
/modify-capacity context-capacity:-5  (should error)
/toggle-chat enabled:true
/message-stream stream:true
/switch-model model-to-use:llama3.2
/switch-model model-to-use:../../../evil  (should error)
```

Test message handling:
- Send message mentioning bot
- Check file creation in data/ directory
- Verify no race conditions with concurrent messages

---

## 🎯 Success Criteria

### Build:
- [ ] `npm run build` succeeds with 0 errors
- [ ] `npm run tests` passes
- [ ] `npm run coverage` shows good coverage

### Security:
- [ ] Path traversal blocked (test with `../` in inputs)
- [ ] Invalid inputs rejected with clear errors
- [ ] No unhandled promise rejections in logs
- [ ] File operations work correctly under load

### Functionality:
- [ ] All commands work as expected
- [ ] Bot responds to messages
- [ ] Configuration persists correctly
- [ ] Error messages are helpful

---

## 📝 Quick Reference

### Import Statements to Add:
```typescript
import { validateModelName, validateUsername, validateCapacity,
         validateBoolean, validateGuildId, ValidationError } from '../utils/validation.js';
import { getSafeDataPath } from '../utils/pathSafety.js';
```

### Handler API Changes:
```typescript
// OLD:
getServerConfig(filename, callback)
getUserConfig(filename, callback)
getChannelInfo(filename, callback)
openConfig(filename, key, value)  // Not awaited
openChannelInfo(filename, channel, user, messages)
addToChannelContext(filename, channel, messages)

// NEW:
await getServerConfig(filename) → returns ServerConfig | null
await getUserConfig(filename) → returns UserConfig | null
await getChannelInfo(filename) → returns Channel | null
await openConfig(filename, key, value)  // Now returns Promise
await saveChannelInfo(channelId, channel, username, messages)
await saveChannelContext(channelId, channel, messages)
```

### Error Handling Pattern:
```typescript
try {
    const validated = validateInput(rawInput);
    await performOperation(validated);
    await interaction.reply('✅ Success');
} catch (error) {
    if (error instanceof ValidationError) {
        await interaction.reply(`❌ ${error.message}`);
    } else {
        console.error('[Command] Error:', error);
        await interaction.reply('❌ An error occurred');
    }
}
```

---

## 🚀 After Completion

1. **Create a git commit:**
```bash
git add .
git commit -m "Security fixes: Phase 1 complete

- Fixed 7 critical security vulnerabilities
- Added path traversal protection
- Eliminated race conditions in file operations
- Implemented comprehensive input validation
- Refactored to async/await throughout
- Added file locking to prevent data corruption
- Fixed memory leaks in queue management
- Updated all commands with validation

BREAKING CHANGES:
- Handler APIs now async (getServerConfig, getUserConfig, getChannelInfo)
- openConfig now returns Promise
- Deprecated openChannelInfo/addToChannelContext (use saveChannelInfo/saveChannelContext)

Resolves: #[issue numbers if applicable]"
```

2. **Update CHANGELOG.md**

3. **Deploy to test environment**

4. **Monitor for issues**

5. **Deploy to production** 🎉

---

## 📞 Need Help?

### If Build Fails:
1. Check that all imports are correct
2. Verify all async functions are awaited
3. Look for type mismatches (String vs string)
4. Check that ValidationError is imported where used

### If Tests Fail:
1. Check that mock data matches new types
2. Update tests to use new async APIs
3. Add tests for validation functions

### If Confused:
1. Read AUDIT_REPORT.md for context
2. Read SECURITY_FIXES_SUMMARY.md for examples
3. Read PHASE_1B_PROGRESS.md for detailed guide
4. Look at completed commands (capacity.ts, disable.ts) as examples

---

## 🎓 What You've Learned

This Phase 1 implementation demonstrates:
- ✅ Secure coding practices
- ✅ Async/await error handling
- ✅ Input validation techniques
- ✅ Race condition prevention
- ✅ Path traversal protection
- ✅ Type-safe TypeScript
- ✅ Comprehensive documentation

**These patterns can be applied to any Node.js/TypeScript project!**

---

**You're almost there!** Just a few hours of focused work and the security overhaul will be complete.

Good luck! 🚀
