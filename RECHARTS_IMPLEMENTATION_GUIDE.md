# Recharts Implementation Guide

## Why Recharts?

Recharts is a popular, modern charting library built on React components and D3. It offers:
- **React-native**: Built specifically for React with hooks support
- **Responsive**: Automatically adapts to container size
- **Customizable**: Easy to style and configure
- **Well-maintained**: Active community and regular updates
- **TypeScript support**: Full TypeScript definitions
- **Accessible**: Better accessibility features than custom SVG

## Installation

```bash
npm install recharts
# or
yarn add recharts
```

## Implementation Example for Grouped Bar Chart

Replace the current SVG implementation (lines ~3984-4144) with this Recharts version:

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';

// Inside your component, prepare the data:
const prepareChartData = () => {
  return selectedModels.map(model => {
    let trial1Correct = 0, trial2Correct = 0, trial3Correct = 0, total = 0;

    trialResults.forEach(qResult => {
      const modelResult = qResult.modelResults[model.id];
      if (modelResult) {
        total++;
        if (modelResult.trial1?.correct) trial1Correct++;
        if (modelResult.trial2?.correct) trial2Correct++;
        if (modelResult.trial3?.correct) trial3Correct++;
      }
    });

    const trial1Acc = total > 0 ? (trial1Correct / total) * 100 : 0;
    const trial2Acc = total > 0 ? (trial2Correct / total) * 100 : 0;
    const trial3Acc = total > 0 ? (trial3Correct / total) * 100 : 0;

    return {
      name: model.name.length > 25 ? model.name.substring(0, 22) + '...' : model.name,
      fullName: model.name,
      'Trial 1': parseFloat(trial1Acc.toFixed(1)),
      'Trial 2': parseFloat(trial2Acc.toFixed(1)),
      'Trial 3': parseFloat(trial3Acc.toFixed(1)),
    };
  });
};

// Custom label formatter to add percentage sign
const renderCustomLabel = (props: any) => {
  const { x, y, width, height, value } = props;
  if (value < 3) return null; // Don't show label for very small values
  
  return (
    <text 
      x={x + width / 2} 
      y={y - 5} 
      fill="#1f2937" 
      textAnchor="middle" 
      fontSize="11"
      fontWeight="700"
    >
      {value}%
    </text>
  );
};

// Custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <Box bg="white" p={3} border="1px" borderColor="gray.200" borderRadius="md" boxShadow="lg">
        <Text fontWeight="bold" mb={2}>{label}</Text>
        {payload.map((entry: any, index: number) => (
          <Text key={index} color={entry.color} fontSize="sm">
            {entry.name}: {entry.value}%
          </Text>
        ))}
      </Box>
    );
  }
  return null;
};

// Replace the entire chart section with:
{activeChartType === 'bar' && (
  <Box>
    <Text fontSize="sm" fontWeight="bold" mb={3}>Grouped Bar Chart</Text>
    <Box h="480px" bg="white" p={4}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={prepareChartData()}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="name" 
            angle={-15}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 11, fontWeight: 600 }}
          />
          <YAxis 
            domain={[0, 100]}
            label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft', style: { fontWeight: 600 } }}
            tick={{ fontSize: 12, fontWeight: 500 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="rect"
            iconSize={18}
          />
          <Bar dataKey="Trial 1" fill="#3b82f6" stroke="#1e40af" strokeWidth={1} radius={[4, 4, 0, 0]}>
            <LabelList content={renderCustomLabel} />
          </Bar>
          <Bar dataKey="Trial 2" fill="#10b981" stroke="#059669" strokeWidth={1} radius={[4, 4, 0, 0]}>
            <LabelList content={renderCustomLabel} />
          </Bar>
          <Bar dataKey="Trial 3" fill="#f59e0b" stroke="#d97706" strokeWidth={1} radius={[4, 4, 0, 0]}>
            <LabelList content={renderCustomLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  </Box>
)}
```

## Additional Chart Types Available with Recharts

### 1. Line Chart (for trends)
```tsx
import { LineChart, Line } from 'recharts';

<LineChart data={data}>
  <Line type="monotone" dataKey="Trial 1" stroke="#3b82f6" strokeWidth={2} />
  <Line type="monotone" dataKey="Trial 2" stroke="#10b981" strokeWidth={2} />
  <Line type="monotone" dataKey="Trial 3" stroke="#f59e0b" strokeWidth={2} />
</LineChart>
```

### 2. Area Chart
```tsx
import { AreaChart, Area } from 'recharts';

<AreaChart data={data}>
  <Area type="monotone" dataKey="Trial 1" fill="#3b82f6" stroke="#1e40af" />
</AreaChart>
```

### 3. Radar Chart (for model comparison)
```tsx
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

<RadarChart data={data}>
  <PolarGrid />
  <PolarAngleAxis dataKey="metric" />
  <PolarRadiusAxis />
  <Radar name="Trial 1" dataKey="Trial 1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
</RadarChart>
```

## Benefits of Switching to Recharts

1. **Less Code**: Recharts handles most chart logic internally
2. **Better Interactivity**: Built-in tooltips, hover effects, animations
3. **Responsive**: Automatically adjusts to screen size
4. **Animations**: Smooth transitions when data updates
5. **Accessibility**: Better screen reader support
6. **Export**: Easier to export charts as images
7. **Documentation**: Extensive examples and API docs at recharts.org

## Current SVG Chart Improvements

I've already improved your current SVG chart with:
- ✅ **Vibrant colors**: Blue (#3b82f6), Green (#10b981), Orange (#f59e0b)
- ✅ **Value labels**: Each bar shows percentage on top
- ✅ **Trial labels**: T1, T2, T3 labels below each bar
- ✅ **Better contrast**: Darker borders and text
- ✅ **Professional legend**: Enhanced with better styling

## Color Palette Used

The new colors are from Tailwind CSS, which ensures:
- High contrast and readability
- Professional appearance
- Accessibility compliance (WCAG)
- Consistent with modern design standards

### Color Codes:
- **Trial 1**: `#3b82f6` (Blue 500) - Traditional, trustworthy
- **Trial 2**: `#10b981` (Emerald 500) - Success, growth
- **Trial 3**: `#f59e0b` (Amber 500) - Energy, attention

## Migration Path

1. **Phase 1** (Current): Use improved SVG charts ✅ Done
2. **Phase 2** (Optional): Install Recharts: `npm install recharts`
3. **Phase 3** (Optional): Gradually replace charts one by one
4. **Phase 4** (Optional): Remove custom SVG implementations

## Testing Recharts

To test Recharts without committing to a full migration:

1. Install: `npm install recharts`
2. Create a new chart type button (e.g., "Modern Chart")
3. Implement Recharts version alongside existing
4. Compare and decide which works better for your needs

## Support

- Recharts Documentation: https://recharts.org/
- GitHub: https://github.com/recharts/recharts
- Examples: https://recharts.org/en-US/examples

## Performance Comparison

- **Current SVG**: Fast, lightweight, full control
- **Recharts**: Slightly heavier (~50KB gzipped), but more features
- **Recommendation**: For your use case (academic evaluation), both work well. Recharts offers better UX with minimal performance impact.
