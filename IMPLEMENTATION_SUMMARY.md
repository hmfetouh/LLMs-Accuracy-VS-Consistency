# Trial-Based Evaluation System - Implementation Summary

## ✅ What We've Built

### 1. New Data Structures
Created comprehensive interfaces to track multi-trial evaluation results:
- `TrialResult`: Stores answer, correctness, token count, and time for each trial
- `QuestionResult`: Aggregates all trial results for a question across models
- Tracks inconsistencies and calculates percentage accuracy over 10 trials

### 2. Evaluation Flow

#### Phase 1: Initial 3 Trials
- **Trial 1**: Individual API requests (1 question per request)
  - Captures baseline performance
  - Records exact token usage and response time
  
- **Trial 2 & 3**: Batched API requests (up to 10 questions per request)
  - More efficient API usage
  - Tests model performance with multiple questions
  - Distributes tokens/time evenly across questions in batch

#### Phase 2: Consistency Detection
- Automatically compares answers across the 3 trials
- Flags questions where the model gave different answers
- Marks these as "inconsistent" for additional testing

#### Phase 3: Extended Testing (Inconsistent Questions Only)
- Runs 7 additional trials for inconsistent question-model pairs
- Total of 10 trials for problematic questions
- Calculates percentage of correct answers out of 10

### 3. Enhanced Results Table

The new table displays:
- Question number and text
- For each model:
  - Character length of question
  - Correct answer
  - Token usage
  - Time to first token (TTFT) in milliseconds
  - Answers for Trial 1, 2, and 3 (color-coded: green=correct, red=incorrect)
  - Percentage correct (only shown for inconsistent questions that ran 10 trials)

### 4. Helper Functions

- `parseCSVLine()`: Robust CSV parser handling quoted fields
- `runSingleQuestionTrial()`: Executes individual question API call
- `runBatchedTrial()`: Sends multiple questions in one API request
- `parseAndResponseText()`: Extracts individual answers from batched response
- `estimateTokenCount()`: Approximates tokens when API doesn't provide usage data

## 🎨 UI Features

- Column headers span multiple rows for better organization
- Color-coded backgrounds:
  - Purple: Model names
  - Green: Trial 1 column
  - Blue: Trial 2 & 3 columns
  - Orange: Percentage column (for inconsistent results)
- Cell backgrounds change based on correctness (green/red)
- Orange highlighting for inconsistent question-model pairs
- Responsive table with horizontal scrolling

## 📊 Data Flow

1. User uploads CSV with questions
2. User selects models to evaluate
3. Clicks "Start Evaluation"
4. System runs through 3 trial phases for each model
5. Table updates in real-time as trials complete
6. Inconsistent questions automatically get 7 more trials
7. Final table shows comprehensive results

## 🔧 Current Status

### Completed
- ✅ New data structures
- ✅ Trial evaluation logic (3 phases)
- ✅ Batched API request handling
- ✅ Response parsing for batched questions
- ✅ Consistency checking
- ✅ Enhanced results table matching design
- ✅ Color-coded display
- ✅ Real-time progress updates

### In Progress
- 🔨 Fixing variable naming conflict in old evaluation function

### Next Steps
1. Clean up the old `startEvaluation` function (causing `duration` variable conflict)
2. Test with real API keys and questions
3. Fine-tune the batched response parser for different LLM response formats
4. Add export functionality for trial results
5. Add summary statistics for trial-based results

## 🎯 Key Benefits

1. **Consistency Testing**: Identifies unreliable model responses
2. **Efficiency**: Batches questions to reduce API calls
3. **Detailed Metrics**: Tracks tokens and time for each trial
4. **Automatic Deep Dive**: Inconsistent questions get more trials automatically
5. **Visual Clarity**: Easy-to-read table with color coding
6. **Scalable**: Handles multiple models and questions efficiently

## 📝 Usage Notes

- Maximum 10 questions per batched request (configurable)
- Token and time estimates when API doesn't provide usage data
- Supports OpenAI, DeepSeek, and OpenWebUI providers
- Works with the existing API configuration system
- Backward compatible with old results (falls back to simple table)
