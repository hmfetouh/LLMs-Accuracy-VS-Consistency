# Class Column Feature

## Overview
The application now supports an optional "Class" column in CSV files to classify questions for better analysis and organization.

## Supported Column Names
The class column can be named any of the following (case-insensitive):
- `class`
- `category` 
- `catogory` (handles common typo)
- `group`
- `step`

## CSV Format
### With Class Column
```csv
Class,ID,Question,Len (Char),Correct Answer
Basic,Q1,What is the capital of France?,30,C
Intermediate,Q2,Which element has the symbol 'Fe'?,35,B
Advanced,Q3,What is the derivative of x^2?,32,A
```

### Without Class Column (Backward Compatible)
```csv
ID,Question,Len (Char),Correct Answer
Q1,What is the capital of France?,30,C
Q2,Which element has the symbol 'Fe'?,35,B
Q3,What is the derivative of x^2?,32,A
```

## Features
- **Optional**: Existing CSV files without class columns will continue to work
- **Conditional Display**: Class column only appears in results table when present in CSV
- **Smart Export**: Class column is only included in CSV exports when available in source data
- **Backward Compatible**: All existing functionality works seamlessly without class data
- **Analysis**: Enables classification-based analysis of results when class data is available

## Benefits
- Organize questions by difficulty level (Basic, Intermediate, Advanced)
- Group questions by topic or subject area
- Track performance across different question categories
- Enable more detailed analysis and reporting
- Clean UI that only shows classification when available

## Testing
Two sample files are provided:
- `sample-questions-with-class.csv` - Shows class column in results
- `sample-questions-no-class.csv` - No class column displayed (traditional view)
