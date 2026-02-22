# Fix for "Puzzle Loading Error - Results Not Published"

## Problem
Teams were encountering an error message:
> "Puzzle Loading Error: Level 1 results have not been published yet. Please wait for admin evaluation."

This error prevented teams from accessing gameplay even when they should have been able to play.

## Root Causes
1. **Database Initialization**: Level 1 was initialized with `IN_PROGRESS` state instead of `RESULTS_PUBLISHED`
2. **API Access Control**: Teams already assigned to Level 2 were still being blocked by the results-publication check
3. **No Auto-Retry**: Users had to manually retry when waiting for results to be published
4. **Unclear Error Messages**: The error message didn't explain that auto-retry was happening

## Fixes Applied

### 1. Database Schema Update
**Files Modified:**
- `supabase/schema.sql` (both main and worktree versions)

**Change:**
```sql
-- Before:
INSERT INTO level_evaluation_state (level_id, evaluation_state) 
VALUES (1, 'IN_PROGRESS') ON CONFLICT (level_id) DO NOTHING;

-- After:
INSERT INTO level_evaluation_state (level_id, evaluation_state, results_published_at) 
VALUES (1, 'RESULTS_PUBLISHED', NOW()) ON CONFLICT (level_id) DO NOTHING;
```

**Reason:** Level 1 should always be accessible since it's the entry point. By marking its results as published from the start, teams can begin playing immediately.

### 2. API Level Access Logic Update
**Files Modified:**
- `api/gameplay/[...path].js` (main version)

**Change:** Removed the strict level access check for teams playing on their currently assigned level.

**Before:**
```javascript
const levelCheck = await checkLevelAccess(supabase, team.id, team.level);
if (!levelCheck.allowed) {
  return res.status(403).json({ error: levelCheck.reason });
}
```

**After:**
```javascript
// Teams can always access puzzles for their currently assigned level (team.level)
// The assignment itself (via admin or qualification) already verified access rights
```

**Reason:** If a team is already assigned to Level 2, they should be able to access it without re-checking if results were published (they were already promoted).

### 3. Frontend Auto-Retry Mechanism
**Files Modified:**
- `src/pages/TeamGameplay.tsx` (both main and worktree versions)

**Changes:**
- Added intelligent retry logic that detects "results not published" errors
- Auto-retries every 10 seconds for this specific error (vs 30s for normal refresh)
- Infinite retries when waiting for results (vs 1 retry for other errors)
- Visual indicator showing "Auto-retrying every 10 seconds..."

**Code:**
```typescript
refetchInterval: (data, query) => {
  if (query.state.error?.message?.includes('results have not been published')) {
    return 10000; // 10 seconds for polling
  }
  return 30000; // Normal refresh
},
retry: (failureCount, error) => {
  if (error.message?.includes('results have not been published')) {
    return true; // Infinite retries
  }
  return failureCount < 1;
}
```

### 4. Improved Error UI
**Files Modified:**
- `src/pages/TeamGameplay.tsx` (both main and worktree versions)

**Changes:**
- Differentiated error messages based on error type
- Added blue info box showing auto-retry status
- More specific "Possible reasons" list based on error type
- Changed button text from "Retry" to "Retry Now" when auto-retry is active

## How to Apply the Fix

### For Existing Databases
Run the migration script to update Level 1 state:

```bash
# Using Supabase CLI
supabase db push supabase/migrations/fix-level1-results-published.sql

# Or run directly in Supabase SQL Editor:
cat supabase/migrations/fix-level1-results-published.sql | supabase db execute
```

Alternatively, run this SQL directly in your Supabase dashboard:
```sql
UPDATE level_evaluation_state
SET 
  evaluation_state = 'RESULTS_PUBLISHED',
  results_published_at = COALESCE(results_published_at, NOW())
WHERE level_id = 1;
```

### For New Deployments
The schema.sql file has been updated, so new deployments will automatically have Level 1 marked as RESULTS_PUBLISHED.

### Deploy the Code Changes
```bash
# Commit and push changes
git add .
git commit -m "Fix: Resolve puzzle loading error for Level 1 and improve auto-retry"
git push

# If using Vercel, it will auto-deploy
# If self-hosted, redeploy your application
```

## Testing
After applying the fix:

1. **Test Level 1 Access:**
   - New teams should be able to access Level 1 gameplay immediately
   - No "results not published" error should appear

2. **Test Level 2 Access:**
   - Teams already on Level 2 should maintain access
   - Teams on Level 1 should only access Level 2 after admin publishes Level 1 results

3. **Test Auto-Retry:**
   - If you temporarily set Level 2 state to IN_PROGRESS, teams should see the auto-retry indicator
   - After publishing results, teams should automatically gain access within 10 seconds

## Prevention
To prevent this issue in the future:

1. **Always mark Level 1 as RESULTS_PUBLISHED** when initializing the database
2. **Use the admin panel** to properly manage level states
3. **Monitor the level_evaluation_state table** to ensure proper state progression
4. **Don't manually change team levels** without also checking/updating evaluation states

## Related Files
- `supabase/schema.sql` - Database initialization
- `supabase/migrations/fix-level1-results-published.sql` - Migration script
- `api/gameplay/[...path].js` - API access control
- `src/pages/TeamGameplay.tsx` - Frontend error handling and auto-retry
- `server/middleware/levelAccess.js` - Server-side access control (for Express backend)

## Additional Notes
- The auto-retry mechanism only activates for "results not published" errors
- Other errors (network issues, auth failures, etc.) maintain the normal retry behavior
- The fix is backward compatible and won't affect existing functionality
- Admin can still manually control when to publish results for Level 2+
