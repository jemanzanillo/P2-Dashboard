# Quick Start: Testing Kiosk Turn Creation

## TL;DR — What I Did

I added **diagnostic logging** and a **direct API connection test** to find out why turns aren't being saved. The key tool is a button on the Launcher screen that tests if the Supabase API is reachable.

## Right Now

The dev server is running on **http://localhost:5175**

## What to Do Next

### 1️⃣ Open the App
```
http://localhost:5175
```

### 2️⃣ Open Browser Console
Press `F12` → Click "Console" tab

### 3️⃣ Test the Connection
- Scroll down to the yellow **"Test Supabase Connection"** button
- **Click it**
- Look for **"✓ Success"** or **"✗ Failed"**

### 4️⃣ Check the Logs
Look in the console for messages like:
```
[supabase.js] Client created successfully: { ... }
[queue] init: connection test result: { success: true, data: [...] }
```

**✓ If you see "success":** API is working, try creating a turn in the kiosk

**✗ If you see "failed":** Network/firewall issue, not your code

### 5️⃣ Try Creating a Turn
- Click **"Quiosco (Paciente)"**
- Select a service
- Enter patient info
- Create a turn
- Check console for success/error logs

### 6️⃣ Verify in Database
Go to https://app.supabase.com → SQL Editor → Run:
```sql
SELECT numero, servicio_id, paciente_nombre, estado, created_at
FROM turnos ORDER BY created_at DESC LIMIT 10;
```

Should see your new turn!

---

## Files Changed

| File | What | Why |
|------|------|-----|
| `src/lib/supabase.js` | Added init logs | Verify client loads |
| `src/lib/db.js` | Added `testConnection()` + query logs | Identify where queries hang |
| `src/queue.js` | Call test before queries | Establish API connectivity first |
| `src/auth.js` | Added import logs | Verify client available |
| `src/router/Launcher.vue` | Added test button | Visual feedback on connectivity |

## More Info

- **Full debugging guide:** Read `DEBUGGING_GUIDE.md`
- **Technical details:** Read `DEBUGGING_CHANGES_SUMMARY.md`
- **Console logs reference:** See "How to Read the Logs" in DEBUGGING_GUIDE.md

---

## Key Insight

The problem: **No HTTP requests to Supabase are being made** (from previous session)

The solution: **Test if API is reachable directly** (what I added)

This tells us:
- ✓ If test succeeds: Problem is in Supabase JS client configuration
- ✗ If test fails: Problem is network/firewall/API unavailable

---

**Status:** ✓ Ready to test  
**Server:** Running on port 5175  
**Next:** Click the button and check logs
