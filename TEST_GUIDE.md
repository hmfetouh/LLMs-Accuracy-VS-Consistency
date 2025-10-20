# Quick Test Guide for Trial-Based Table

## What Changed
✅ Fixed the results display to show the new trial-based table
✅ Updated summary tab to work with trial results
✅ Clear both old and new results when starting evaluation
✅ Show evaluation section when either old or new results exist

## How to Test

### 1. Refresh Your Browser
- Go to http://localhost:3000
- Press Cmd+Shift+R (hard refresh) to clear cache

### 2. Start Fresh
- If you see old results, they will be cleared when you start a new evaluation
- The table will now show the new format with:
  - Question #
  - Question text
  - Length (characters)
  - Correct Answer
  - Tokens
  - TTFT (ms)
  - Trial 1, 2, 3 answers (color-coded)
  - % Correct of 10 (for inconsistent questions)

### 3. What to Expect During Evaluation

**Phase 1 - Trial 1** (Individual Requests):
- Each question sent one at a time
- Table fills in with Trial 1 results
- You'll see token counts and time for each question
- Answers will be green (correct) or red (incorrect)

**Phase 2 - Trial 2** (Batched Requests):
- Up to 10 questions sent together
- Trial 2 column fills in
- Faster than Trial 1

**Phase 3 - Trial 3** (Batched Requests):
- Up to 10 questions sent together
- Trial 3 column fills in

**Phase 4 - Additional Trials** (Only if inconsistent):
- System automatically detects if answers differ across trials 1-3
- Runs 7 more trials for those questions
- Shows percentage in the last column
- Orange background indicates inconsistent results

## Table Layout Example

For each model selected, you'll see these columns:
```
| # | Question | [Model Name - Purple Header]                              |
|   |          | Len | Correct | Tokens | TTFT | T1 | T2 | T3 | % Correct |
|---|----------|-----|---------|--------|------|----|----|----|---------  |
| 1 | Q text   | 150 |    A    |  384   | 2814 | A  | A  | A  |    -      |
| 2 | Q text   | 200 |    B    |  233   |  856 | B  | B  | B  |    -      |
| 3 | Q text   | 180 |    D    |  140   | 3718 | D  | D  | D  |   70%     |
```

## Color Coding
- **Purple Headers**: Model name sections
- **Green Cells**: Correct answers
- **Red Cells**: Incorrect answers  
- **Orange Cells**: Inconsistent questions (with percentage)
- **Light backgrounds**: Different trial types

## If You Still See Old Table
1. Clear browser cache completely
2. Check browser console (F12) for any errors
3. Make sure the page reloaded after the last compile
4. Try clicking "Start Evaluation" to generate fresh results

## Debugging
If the new table doesn't appear:
1. Open browser console (F12)
2. Check for compile errors in the terminal
3. Verify `trialResults.length > 0` in React DevTools
4. Check that `startEvaluation` function is the trial-based version

## Current Server Status
✅ Server running on http://localhost:3000
✅ Code compiled successfully
✅ No TypeScript errors
✅ Ready to test!
