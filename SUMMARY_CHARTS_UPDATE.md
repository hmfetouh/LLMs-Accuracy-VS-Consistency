# Summary and Charts Tab - Update Summary

## Changes Implemented

### 1. **Tab-Based View Structure**
- Added **Table View** and **Charts** tabs within the Summary and Charts section
- Users can now toggle between data tables and visualizations
- Each view has its own dedicated export button

### 2. **Redesigned Table Layout**

#### Without Class Column
- Simple table showing:
  - Model name
  - Trial 1, 2, 3 accuracy percentages
  - Overall average
- Removed "Total Questions" column as requested

#### With Class Column
- **Classes as Columns** layout
- Horizontal structure with classes spread across columns
- Each class shows: T1, T2, T3, and Average
- Final column shows "Overall Avg" across all classes
- Professional multi-header table design
- Color-coded values (green/orange/red) based on performance thresholds

### 3. **New Professional Bar Chart**
- **Vertical grouped bars** showing all models together
- Each model has 3 bars (Trial 1, 2, 3) side by side
- Color-coded trials:
  - Blue: Trial 1
  - Green: Trial 2
  - Purple: Trial 3
- Percentage values displayed above each bar
- Professional chart with grid lines and proper spacing
- Model names rotated for better readability
- Legend at bottom showing trial colors

### 4. **Export Functionality**

#### Export Table Button
- Exports current table view to CSV
- If no classes: exports simple model × trial table
- If classes exist: exports comprehensive table with class columns
- File name: `accuracy_table_YYYY-MM-DD.csv`

#### Export Chart Button
- Exports current chart as PNG image
- Converts SVG charts to raster images
- File name: `chart_{type}_YYYY-MM-DD.png`
- Uses native browser capabilities (no external libraries)

### 5. **UI/UX Improvements**
- **Contextual Export Buttons**: Shows different button based on active view
  - Table View: "Export Table" with 📥 icon
  - Charts View: "Export Chart" with 📸 icon
- **Professional Styling**: Gray backgrounds for charts, white for tables
- **Responsive Design**: Tables scroll horizontally if needed
- **Clean Layout**: Better spacing and organization

## Key Features

### Table View Features
✅ Classes displayed as columns (when available)  
✅ Trial accuracies for each class  
✅ Average per class  
✅ Overall average across all classes  
✅ Color-coded performance indicators  
✅ No "Total Questions" column  
✅ Compact, professional layout  

### Charts Features
✅ Vertical bar chart with all models together  
✅ Grouped bars for easy comparison  
✅ Professional grid and axis labels  
✅ Line chart showing trends  
✅ Model comparison chart (horizontal bars)  
✅ Chart type selector  
✅ Export charts as images  

## Technical Details

### New State Variables
```typescript
const [activeSummaryView, setActiveSummaryView] = useState<"table" | "charts">("table");
```

### New Functions
1. `exportTableData()` - Exports table to CSV with class-based layout
2. `exportChartAsImage()` - Converts SVG charts to PNG images

### Table Structure (With Classes)
```
Model | Class1-T1 | Class1-T2 | Class1-T3 | Class1-Avg | Class2-T1 | ... | Overall Avg
```

### Bar Chart SVG Structure
- ViewBox: 800×350
- Grid lines at 25% intervals
- Bars grouped by model with proper spacing
- Percentage labels above bars
- Rotated model names for readability

## Color Coding
- **Green (≥70%)**: High performance
- **Orange (50-69%)**: Medium performance  
- **Red (<50%)**: Low performance

## File Updates
- **Modified**: `/src/app/page.tsx`
  - Added `activeSummaryView` state
  - Added `exportTableData()` function
  - Added `exportChartAsImage()` function
  - Redesigned Summary tab with tab-based navigation
  - Implemented new table layout with classes as columns
  - Created professional vertical bar chart
  - Added contextual export buttons

## Usage

### Viewing Tables
1. Go to "Summary and Charts" tab
2. Click "Table View" button
3. See accuracy data in table format
4. If CSV has classes, they appear as columns
5. Click "Export Table" to download CSV

### Viewing Charts
1. Go to "Summary and Charts" tab
2. Click "Charts" button
3. Select chart type (Bar Chart, Line Chart, or Model Comparison)
4. Click "Export Chart" to download as PNG image

## Benefits

1. **Better Organization**: Separate views for tables and charts
2. **Clearer Insights**: Classes as columns make comparisons easier
3. **Professional Appearance**: Vertical grouped bar chart looks more professional
4. **Flexible Export**: Can export tables or charts separately
5. **Improved Readability**: Removed unnecessary columns, better layout
6. **Easy Navigation**: Tab-based interface for switching views

## Browser Compatibility
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers (responsive)

## Known Limitations
- Chart export requires modern browser with Canvas API support
- Some older browsers may not support SVG to PNG conversion
- Large numbers of models (>10) may make bar chart crowded

## Future Enhancements (Not Included)
- Interactive chart tooltips
- Chart customization options
- PDF export
- Print-friendly layouts
- Chart animations
- Zoom/pan for large charts
