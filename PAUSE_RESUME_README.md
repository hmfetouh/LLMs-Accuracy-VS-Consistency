# Pause/Resume Feature Documentation

## Overview
The evaluation system now supports pausing and resuming evaluations, providing better control over long-running evaluations and automatic error recovery.

## Features

### 1. **Manual Pause Control**
- **Pause Button**: A new orange "Pause" button appears between "Start Evaluation" and "Stop" buttons
- **Location**: Available during active evaluations
- **Behavior**: When clicked, the evaluation will pause after the current API call completes
- **Status**: Button shows "Pausing..." while waiting for the current call to finish

### 2. **Resume Capability**
- **Resume Button**: The "Start Evaluation" button changes to "Resume" when an evaluation is paused
- **State Preservation**: All evaluation state is preserved, including:
  - Current model being evaluated
  - Current trial phase (Trial 1, Trial 2, Trial 3, or Inconsistent questions)
  - Current question index
  - All previously collected results
- **Seamless Continuation**: Clicking "Resume" continues exactly where the evaluation left off

### 3. **Automatic Error Handling**
- **Auto-Pause on API Errors**: When an API call fails (e.g., rate limits, network issues), the evaluation automatically pauses
- **Auto-Pause on Response Parsing Errors**: When model responses cannot be parsed (e.g., invalid format, no A-D answers), the evaluation automatically pauses
  - For single questions: Pauses if the response is not A, B, C, or D
  - For batched questions: Pauses if more than 50% of responses fail to parse
- **Error Display**: A detailed error toast message appears showing:
  - Error description with details about what went wrong
  - Raw response from the model for debugging
  - Instruction to click "Resume" to retry
  - 10-second display duration
- **Retry Logic**: When resumed after an error, the system will retry the exact same API call that failed

### 4. **Three-Button Control System**

#### Start/Resume Button (Blue)
- **Text**: "Start Evaluation" (initial) or "Resume" (when paused)
- **State**: 
  - Enabled: When not running, or when paused
  - Disabled: When actively running
  - Loading: Shows "Running..." during active evaluation
- **Function**: Starts new evaluation or resumes paused evaluation

#### Pause Button (Orange Outline)
- **Text**: "Pause" or "Pausing..." 
- **State**:
  - Enabled: Only during active evaluation
  - Disabled: When not running, already paused, or stopping
- **Function**: Gracefully pauses evaluation after current API call

#### Stop Button (Red Ghost)
- **Text**: "Stop" or "Stopping..."
- **State**:
  - Enabled: During active evaluation or when paused
  - Disabled: When not running
- **Function**: Completely stops evaluation and clears saved state

## Use Cases

### 1. **Rate Limit Management**
When you hit API rate limits:
1. Evaluation automatically pauses with error message
2. Wait for rate limit to reset
3. Click "Resume" to continue from where it stopped
4. The failed API call will be retried

### 2. **Intentional Breaks**
For long evaluations:
1. Click "Pause" when you need to stop temporarily
2. Close browser or do other work
3. Return later and click "Resume" to continue
4. All progress is preserved

### 3. **Network Issues**
When network connection is lost:
1. API call fails and evaluation auto-pauses
2. Fix network connection
3. Click "Resume" to retry the failed call
4. Evaluation continues normally

### 4. **Cost Control**
To manage API costs:
1. Click "Pause" to stop before hitting budget limits
2. Check costs/usage
3. Click "Resume" when ready to continue
4. Or click "Stop" to permanently end evaluation

## GPT-5 and O-Series Reasoning Effort Support

### Overview
The system now supports OpenAI's `reasoning_effort` parameter for GPT-5 and O-series models, allowing you to control the computational effort spent on reasoning tasks.

### Available Model Variants

#### **GPT-5 Base Model**
When detected, creates four variants with minimal/low/medium/high options:
- **GPT-5 (Minimal reasoning)**: Uses `reasoning.effort: "minimal"` - fastest, minimal computational effort
- **GPT-5 (Low reasoning)**: Uses `reasoning.effort: "low"` - faster, less computational effort
- **GPT-5 (Medium reasoning - Default)**: Uses `reasoning.effort: "medium"` - balanced performance (default)
- **GPT-5 (High reasoning)**: Uses `reasoning.effort: "high"` - maximum reasoning effort, slower but potentially more accurate

**Date-versioned variants** like `gpt-5-2025-08-07` are also supported and create the same four reasoning effort options.

#### **GPT-5-mini and GPT-5-nano**
Both models create four variants with minimal/low/medium/high options:
- **GPT-5-mini/nano (Minimal reasoning)**: Uses `reasoning.effort: "minimal"`
- **GPT-5-mini/nano (Low reasoning)**: Uses `reasoning.effort: "low"`
- **GPT-5-mini/nano (Medium reasoning - Default)**: Uses `reasoning.effort: "medium"` (default)
- **GPT-5-mini/nano (High reasoning)**: Uses `reasoning.effort: "high"`

**Date-versioned variants** like `gpt-5-mini-2025-08-07` or `gpt-5-nano-2024-12-17` are also supported.

#### **O-Series Models (o1, o3, o3-mini, o4-mini)**
Excludes o1-mini, creates three variants with low/medium/high options:
- **o1/o3/o3-mini/o4-mini (Low reasoning)**: Uses `reasoning.effort: "low"`
- **o1/o3/o3-mini/o4-mini (Medium reasoning - Default)**: Uses `reasoning.effort: "medium"` (default)
- **o1/o3/o3-mini/o4-mini (High reasoning)**: Uses `reasoning.effort: "high"`

**Date-versioned variants** like `o1-2024-12-17`, `o3-2025-01-15`, or `o3-mini-2024-12-17` are also supported.

### Implementation Details
- **Automatic Detection**: 
  - GPT-5 base: `/^gpt-5(-\d{4}-\d{2}-\d{2})?$/i` (includes date-versioned variants)
  - GPT-5 mini/nano: `/^gpt-5-(mini|nano)(-\d{4}-\d{2}-\d{2})?$/i` (includes date-versioned variants)
  - O-series: `/^(o1|o3|o3-mini|o4-mini)(-\d{4}-\d{2}-\d{2})?$/i` (includes date-versioned variants, excludes o1-mini)
- **Date-Versioned Models**: Supports models like `gpt-5-2025-08-07`, `o1-2024-12-17`, `gpt-5-mini-2025-08-07`, etc.
- **API Parameter**: Adds `reasoning_effort: "minimal|low|medium|high"` as a top-level parameter to API requests
- **Model Variants**: Creates separate selectable models for each effort level
- **Default Value**: Medium reasoning is the default (indicated by "- Default" suffix)
- **Compatibility**: Only applies to OpenAI GPT-5 and O-series models (including date-versioned variants)

### Usage
1. Load OpenAI models from the API configuration sidebar
2. Supported models will appear as multiple separate options in the model selection dropdown
3. Select the desired reasoning effort level (e.g., "GPT-5 (High reasoning)")
4. The system automatically includes the appropriate `reasoning_effort` parameter in API calls
5. Models marked with "- Default" use the default medium reasoning effort

### Benefits
- **Performance Control**: Choose between speed and accuracy based on your needs
- **Cost Optimization**: Lower reasoning effort may result in faster responses and lower costs
- **Comparative Analysis**: Compare different reasoning levels within the same evaluation
- **Flexibility**: Different model families support different effort levels
- **Clear Defaults**: Easily identify which option is the default behavior

## Technical Implementation

### State Management
The system tracks comprehensive evaluation state:
```typescript
{
  parsedQuestions: Array<{id, question, answer, class?}>;
  trialResultsArray: QuestionResult[];
  currentModelIndex: number;
  currentPhase: 'trial1' | 'trial2' | 'trial3' | 'inconsistent';
  currentQuestionIndex: number;
  currentTrialNumber: number;
  inconsistentQuestions: Array<{index, modelId}>;
}
```

### Real-time Pause/Stop Detection
To ensure pause/stop requests are detected immediately (even during long-running async operations):
- **useRef hooks** are used for `shouldPauseRef` and `shouldStopRef`
- These refs are checked within the evaluation loop for instant detection
- React state is also maintained for UI updates
- Both state and refs are updated together when pause/stop is clicked

This dual approach ensures:
- UI updates correctly (using state)
- Long-running async loops detect changes immediately (using refs)
- No race conditions between button clicks and evaluation progress

### Evaluation Phases
The system preserves position across four phases:
1. **Trial 1**: Individual questions (one per API call)
2. **Trial 2**: Batched questions (up to 10 per call)
3. **Trial 3**: Batched questions (up to 10 per call)
4. **Inconsistent**: Additional 7 trials for inconsistent answers (batched)

### Error Recovery
- Try/catch blocks around each API call and response parsing
- On API error: Auto-pause and save exact position
- On parsing error: Auto-pause with detailed error message
- On resume: Retry the same call with same parameters
- Failed calls don't increment progress
- Error types detected:
  - Network/API failures (rate limits, authentication, etc.)
  - Invalid response format (non A-D answers, unparseable responses)
  - Empty responses from models

## Best Practices

1. **Use Pause for Temporary Stops**: When you plan to resume later
2. **Use Stop for Permanent Cancellation**: When you want to discard the evaluation
3. **Monitor Error Messages**: They provide guidance on how to fix issues
4. **Resume Promptly After Errors**: Some errors (like rate limits) resolve automatically
5. **Check Partial Results**: Even paused evaluations show all completed results

## UI Indicators

- **Progress Bar**: Continues to show accurate progress even when paused
- **Button States**: Visual feedback shows current evaluation state
- **Toast Messages**: Clear messages for all state transitions:
  - "Pausing Evaluation" - when pause is clicked
  - "Evaluation Paused" - when pause completes
  - "Resuming Evaluation" - when resume is clicked
  - "API Error - Evaluation Paused" - when auto-paused due to error
  - "Evaluation Stopped" - when manually stopped

## Smart Change Detection

### File Change Detection
When you upload a new CSV file while an evaluation is paused:
- **Pause state is automatically cleared**
- **Saved evaluation progress is discarded**
- **Button changes from "Resume" back to "Start Evaluation"**
- **Previous results are cleared from the table**
- **Toast notification confirms the reset**

This ensures you never accidentally mix data from different CSV files or resume an evaluation with outdated questions.

### Model Change Detection
When you add or remove models while an evaluation is paused:
- **Pause state is automatically cleared**
- **Saved evaluation progress is discarded**
- **Button changes from "Resume" back to "Start Evaluation"**
- **Previous results are cleared from the table**
- **Toast notification confirms the reset**

This ensures you never accidentally mix results from different model configurations or resume an evaluation with incompatible models.

### Behavior Examples
1. **During active evaluation**: Changing files/models stops the current evaluation
2. **While paused**: Changing files/models clears pause state and enables fresh start
3. **After completion**: Changing files/models clears results and prepares for new evaluation

## API Timeout Settings

### Timeout Configuration
The system uses extended timeout values to accommodate slow reasoning models:

- **Main API Calls**: 10 minutes (600,000ms)
  - Used for single question evaluations and batch processing
  - Accommodates the slowest reasoning models including OpenAI o1/o3 series
  - Handles complex multi-step reasoning, batch processing, and network delays
  - Timeout triggers auto-pause with error message for user to retry
  
- **Model Discovery**: 3 minutes (180,000ms)
  - Used when fetching available models from API providers
  - Adequate time for provider API to respond with model list under high load
  - Less critical as this happens once during configuration

### Timeout Benefits
- **Slow Reasoning Models**: Accommodates models that take significant time to process complex questions
  - OpenAI o1/o3 models can take 30+ seconds for complex reasoning
  - Batch processing multiplies this time across multiple questions
  - Some reasoning tasks require extensive "thinking time"
- **Network Issues**: Allows for temporary network slowdowns without immediate failure
- **Rate Limiting**: Provides buffer time during API rate limit recovery
- **High Load Periods**: When API providers are under heavy usage
- **Token-Heavy Responses**: Complex explanations and detailed reasoning take more time
- **User Control**: When timeout occurs, auto-pause allows user to decide whether to retry or stop

### Why 10 Minutes?
- **Industry Standards**: Most production systems use 10-15 minute timeouts for reasoning models
- **Real-world Performance**: o1 models can take 30+ seconds per complex question
- **Batch Safety**: Multiple questions in batches compound the processing time
- **Network Buffer**: Accounts for API latency and temporary slowdowns
- **User Experience**: Reduces false timeouts that interrupt valid long-running operations

## Limitations

- State is only preserved in browser memory (lost on page refresh)
- Uploading new CSV file automatically clears any paused evaluation
- Changing selected models automatically clears any paused evaluation
- Stop button clears all saved state (cannot resume after stop)
- Auto-pause only occurs on API errors, not browser/system errors
- Extended timeouts may delay error detection for truly failed requests

## Future Enhancements

Potential improvements for future versions:
- Persistent state (localStorage or database)
- Ability to export/import paused evaluations
- Scheduling resumption at specific times
- Retry limits before auto-pausing
- Pause/resume for specific models only
