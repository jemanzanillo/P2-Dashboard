# Debugging Guide: Kiosk Turn Creation & Database Connection Issues

## Problem Summary
Turns created in the kiosk are not being persisted to the Supabase database, and agents are not seeing new turns. The previous investigation revealed that **no HTTP requests to Supabase are being made**, meaning the queries are hanging at the client level before being sent to the API.

## Changes Made for Diagnosis

### 1. **Supabase Client Initialization Logging** (`src/lib/supabase.js`)
Added console logs to verify:
- Environment variables are loaded correctly
- Supabase client is created successfully
- Client has the expected methods (auth, from, realtime)

**Expected console output:**
```
[supabase.js] URL present: true
[supabase.js] Anon key present: true
[supabase.js] Client created successfully: {
  url: "https://zkldrnhipsejoefljkud.supabase.co",
  auth: true,
  from: "function",
  realtime: true
}
```

### 2. **Database Query Diagnostic Logging** (`src/lib/db.js`)
Added step-by-step logging to all database query functions:
- `fetchTurns()`
- `fetchServices()`
- `fetchConditions()`
- `fetchCounters()`

**Expected logs show query lifecycle:**
```
[db] fetchTurns: starting...
[db] fetchTurns: about to call supabase.from("turnos")
[db] fetchTurns: query built, now awaiting...
[db] fetchTurns: got response { hasData: true, hasError: false }
[db] fetchTurns: completed, rows: N
```

**If you see:**
- `starting...` but never the `completed` message → query is hanging in the client
- `got response` with errors → API is reachable but returning errors
- No logs at all → init() is not being called or is being skipped

### 3. **Direct API Connection Test** (`src/lib/db.js`)
Added `testConnection()` function that:
- **Bypasses** the Supabase JS client
- Uses raw `fetch()` to test direct HTTP connectivity to Supabase
- Tests a real API endpoint: `/rest/v1/servicios?limit=1`

**This function determines if:**
- The network can reach Supabase API
- Authentication headers (apikey + Bearer token) work
- CORS is not blocking the request
- The Supabase project is accessible

### 4. **Queue Store Test in Init** (`src/queue.js`)
Modified `store.init()` to:
- Call `testConnection()` **first** before trying database queries
- Log the test result
- Fail gracefully if connection test fails

### 5. **Auth Client Verification** (`src/auth.js`)
Added logging to verify the Supabase client is properly imported and has all required methods.

### 6. **Debug Button in Launcher** (`src/router/Launcher.vue`)
Added a **"Test Supabase Connection"** button at the bottom of the launcher screen that:
- Calls `testConnection()` when clicked
- Shows real-time results (success/failure)
- Displays the API response or error details
- Helps you test without navigating to the kiosk

## Step-by-Step Testing Instructions

### Step 1: Open the Browser DevTools
1. Open your browser (Chrome, Firefox, Edge)
2. Navigate to `http://localhost:5174` (or `5173` if 5174 isn't available)
3. Press `F12` to open Developer Tools
4. Go to the **Console** tab
5. **Keep this open** while testing — you'll see the logs here

### Step 2: Check Initialization Logs
When the page loads, you should see:
```
[supabase.js] URL present: true
[supabase.js] Anon key present: true
[supabase.js] Client created successfully: { ... }
[auth.js] supabase client imported: { hasAuth: true, hasFrom: "function", hasRealtime: true }
[auth] init: starting...
[queue] init: starting...
```

**If you don't see these → the app is not loading properly. Check for JavaScript errors in the console.**

### Step 3: Test Direct API Connection (Recommended First Test)
1. Look at the **Launcher** screen (the dev screen picker at `/`)
2. Scroll down to the bottom
3. You'll see a **yellow "Test Supabase Connection" button**
4. **Click it** and observe:
   - If it says **"✓ Success"** → API is reachable, credentials work ✓
   - If it says **"✗ Failed"** → Network/API issue, check the error details below

**Example success response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-xxx",
      "nombre": "Laboratorio",
      ...
    }
  ]
}
```

**Example failure response:**
```json
{
  "success": false,
  "error": "Failed to fetch"
}
```

### Step 4: Check Queue Store Initialization
After the page fully loads, check the console for:
```
[queue] init: testing connection...
[queue] init: connection test result: { success: true, data: [...] }
[queue] init: starting...
[queue] init: fetched data { turnsCount: 42, servicesCount: 8 }
```

**If you see timeout errors:**
```
[db] fetchTurns: starting...
[db] fetchTurns: about to call supabase.from("turnos")
[db] fetchTurns: query built, now awaiting...
[queue] Database query timeout after 5s
```
This means:
- Queries are being initiated
- But they never resolve (hang indefinitely)
- Problem is likely in Supabase client, not network

### Step 5: Try Creating a Turn in the Kiosk
1. Click **"Quiosco (Paciente)"** button
2. Select a service
3. Enter patient name and ID
4. Click "Crear turno"
5. **Check the console for logs** showing:
   - If successful: `[db] insertTurn: insert completed`
   - If failed: `[db] insertTurn exception: [error details]`

### Step 6: Verify Data in Database
After creating a turn:
1. Go to Supabase dashboard: https://app.supabase.com
2. Navigate to **SQL Editor**
3. Run this query:
   ```sql
   SELECT numero, servicio_id, paciente_nombre, estado, created_at
   FROM turnos
   ORDER BY created_at DESC
   LIMIT 10;
   ```
4. Check if your new turn appears in the results

## Interpreting Results

### Scenario A: Test Succeeds ✓
**If the "Test Supabase Connection" button shows success:**
- Network is fine ✓
- Authentication is fine ✓
- Problem is likely in how the Supabase JS client queries are being built
- **Next step:** Check the console logs for database query details
- Look for logs like `[db] fetchServices: got response { hasData: true, hasError: false }`

### Scenario B: Test Fails ✗
**If the test button shows failure:**
- Network cannot reach Supabase
- **Possible causes:**
  1. **Firewall/VPN blocking** → Check if you need VPN or have network restrictions
  2. **Wrong environment variables** → Check `.env.local` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  3. **Supabase project issue** → Verify project exists at https://app.supabase.com
  4. **DNS issue** → Try pinging `zkldrnhipsejoefljkud.supabase.co` from terminal

### Scenario C: Test Succeeds but Kiosk Still Fails
**If the raw fetch works but queries still timeout:**
- API is reachable
- Supabase JS client has a configuration issue
- **Next steps:**
  1. Check browser console for JavaScript errors
  2. Look at the detailed database query logs
  3. Check if there's a CORS error (would show in browser Network tab → XHR requests)

## Key Console Log Patterns to Watch For

### Good Logs (Everything Working)
```
[supabase.js] Client created successfully: { url: "...", auth: true, from: "function", realtime: true }
[queue] init: connection test result: { success: true, data: [...] }
[db] fetchServices: completed, rows: 8
[db] fetchCounters: completed, counters: 5
[db] fetchTurns: completed, rows: 42
```

### Bad Logs (Queries Hanging)
```
[db] fetchTurns: starting...
[db] fetchTurns: about to call supabase.from("turnos")
[db] fetchTurns: query built, now awaiting...
[... 5 second silence ...]
[queue] Database query timeout after 5s
```

### Network Error Logs
```
[db] testConnection exception: NetworkError when attempting to fetch resource
```

### API Error Logs
```
[db] fetchTurns: got response { hasData: false, hasError: true }
[db] fetchTurns error: { message: "...", code: "..." }
```

## Environment Variables to Verify

The `.env.local` file should have these variables (Vite prefixes with `VITE_` for browser):

```env
VITE_SUPABASE_URL="https://zkldrnhipsejoefljkud.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

To verify they're loaded:
1. Open browser console
2. Type: `import.meta.env.VITE_SUPABASE_URL`
3. Should return: `"https://zkldrnhipsejoefljkud.supabase.co"`
4. Type: `import.meta.env.VITE_SUPABASE_ANON_KEY`
5. Should return: `"eyJ..."` (JWT token)

If they're `undefined`, restart the dev server (`npm run dev`).

## Quick Troubleshooting Checklist

- [ ] Dev server is running (`npm run dev`)
- [ ] Browser can reach `http://localhost:5174`
- [ ] Browser console shows no JavaScript errors
- [ ] "Test Supabase Connection" button returns success
- [ ] Database query logs show completion (not timeouts)
- [ ] New turns appear in Supabase SQL Editor within seconds
- [ ] Agents can see new turns in their queue

## Need More Help?

If tests still fail after these steps:
1. **Save all console logs** (right-click → Save as → save as .txt file)
2. **Screenshot the test button result**
3. **Note the timestamp** when you tested
4. **Check Supabase status** at https://status.supabase.com

---

**Last updated:** 2026-05-26  
**Debug changes committed to:** src/lib/supabase.js, src/lib/db.js, src/queue.js, src/auth.js, src/router/Launcher.vue
