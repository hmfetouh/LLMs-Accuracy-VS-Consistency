# Summary and Charts Feature

## Overview
The **Summary and Charts** tab provides comprehensive data visualization and analysis for LLM evaluation results, including accuracy tables, multiple chart types, and export functionality.

## Features

### 1. Overall Accuracy Table
- **Displays**: Model-by-model accuracy across all three trials
- **Columns**:
  - Model name
  - Trial 1 accuracy (%)
  - Trial 2 accuracy (%)
  - Trial 3 accuracy (%)
  - Average accuracy across all trials (%)
  - Total number of questions evaluated
- **Color Coding**:
  - 🟢 Green: ≥70% accuracy
  - 🟠 Orange: 50-69% accuracy
  - 🔴 Red: <50% accuracy

### 2. Accuracy by Class/Step Table
- **Conditional**: Only appears when CSV file includes a `class` column
- **Purpose**: Shows performance breakdown by classification or step
- **Displays**: Accuracy per model, per class, per trial
- **Use Cases**:
  - Step-by-step question analysis
  - Category-based performance tracking
  - Identifying model strengths/weaknesses in specific areas

### 3. Interactive Charts

#### Chart Type Selector
Switch between three visualization types:
- 📊 **Bar Chart**: Horizontal bars showing accuracy for each trial
- 📈 **Line Chart**: Trend lines showing accuracy progression across trials
- 🔄 **Model Comparison**: Average accuracy comparison across all models

#### Bar Chart
- Shows individual trial performance for each model
- Four bars per model: Trial 1, Trial 2, Trial 3, and Average
- Different colors per trial for easy distinction
- Percentage labels on each bar

#### Line Chart
- Multi-line chart showing trends across trials
- Each model has a distinct color
- Points mark exact accuracy values
- Legend shows which line represents which model
- Grid lines for easy value reading

#### Model Comparison Chart
- Horizontal bars showing average accuracy
- Sorted view of model performance
- Color-coded based on performance thresholds
- Large, easy-to-read layout

### 4. Export Functionality

#### Export Summary Button
- **Location**: Top-right of Summary and Charts tab
- **Exports**: CSV file with all summary data
- **File Name**: `summary_YYYY-MM-DD.csv`

#### Export Contents
1. **Overall Accuracy Table**:
   - Model name, Trial 1/2/3 accuracy, Average, Total questions
2. **Class-Based Breakdown** (if applicable):
   - Model, Class, Trial accuracies, Average, Question count

## Usage

### Viewing Summary Data
1. Complete an evaluation run with one or more models
2. Click the **Summary and Charts** tab
3. Review overall accuracy table at the top
4. If using a CSV with class column, scroll to see class-based breakdown

### Using Charts
1. In the **Summary and Charts** tab, scroll to the Charts section
2. Click chart type buttons to switch between visualizations:
   - **Bar Chart**: Best for comparing individual trial performance
   - **Line Chart**: Best for seeing consistency/trends across trials
   - **Model Comparison**: Best for quick overall performance ranking

### Exporting Data
1. In the **Summary and Charts** tab, click **Export Summary** button
2. CSV file downloads automatically to your default downloads folder
3. Open in Excel, Google Sheets, or any spreadsheet application
4. Use exported data for further analysis, reporting, or presentations

## Data Structure

### Trial Results Format
```typescript
{
  questionId: string;
  question: string;
  correctAnswer: string;
  class?: string;  // Optional classification
  modelResults: {
    [modelId: string]: {
      trial1?: { answer: string; correct: boolean };
      trial2?: { answer: string; correct: boolean };
      trial3?: { answer: string; correct: boolean };
    }
  }
}
```

### Accuracy Calculation
- **Per Trial**: (Correct answers / Total questions) × 100
- **Average**: (Trial 1 + Trial 2 + Trial 3) / 3
- **By Class**: Same calculation filtered by class value

## Color Thresholds

The application uses consistent color coding across all visualizations:
- **Green** (≥70%): High performance, good accuracy
- **Orange** (50-69%): Medium performance, needs improvement
- **Red** (<50%): Low performance, significant issues

## Best Practices

1. **Compare Multiple Models**: Add 3-5 models for meaningful comparisons
2. **Use Class Column**: Include classifications in your CSV for deeper insights
3. **Check Consistency**: Use Line Chart to identify models with stable vs. erratic performance
4. **Export Regularly**: Save summary data after each evaluation run
5. **Analyze Trends**: Look for patterns across trials to identify reliability issues

## Technical Notes

- **Real-time Updates**: Charts update automatically as evaluation progresses
- **Performance**: Handles up to 100+ questions and 10+ models efficiently
- **Responsive**: Charts scale to fit different screen sizes
- **SVG-based**: Line charts use SVG for crisp, scalable graphics
- **No External Dependencies**: All charts built with native browser capabilities

## Integration with Other Features

- **Auto-Pause/Resume**: Summary data persists across pause/resume cycles
- **API Logs**: Cross-reference with API Logs tab for detailed debugging
- **Trial System**: Fully integrated with 3-trial evaluation workflow
- **Reasoning Effort**: Shows results for all reasoning effort variants

## Future Enhancements

Potential additions (not yet implemented):
- Interactive filtering by model or class
- Downloadable chart images (PNG/SVG)
- Statistical analysis (std deviation, confidence intervals)
- Comparison with previous evaluation runs
- Custom chart configuration options
