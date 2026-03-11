# Loading Skeleton Components

A comprehensive loading skeleton system for the Paper Generator SaaS application. These components provide smooth loading states that match your application's design system.

## 📦 Components

### Base Components

#### `Skeleton`
Basic building block for all skeleton components.
```tsx
<Skeleton className="h-12 w-full rounded-xl" />
```

#### `SkeletonText`
Multi-line text placeholder with automatic width variation.
```tsx
<SkeletonText lines={3} />
```

### Composite Components

#### `SkeletonCard`
Generic card skeleton with header, text, and action buttons.
```tsx
<SkeletonCard />
```

#### `SkeletonTable`
Table skeleton with customizable rows and columns.
```tsx
<SkeletonTable rows={10} columns={5} />
```

#### `SkeletonForm`
Form skeleton with labels and input fields.
```tsx
<SkeletonForm fields={5} />
```

#### `SkeletonList`
List of items with icons and metadata.
```tsx
<SkeletonList items={5} />
```

#### `SkeletonStats`
Statistics cards grid (for dashboard metrics).
```tsx
<SkeletonStats count={4} />
```

#### `SkeletonQuestionCard`
Question card with options and metadata badges.
```tsx
<SkeletonQuestionCard />
```

#### `SkeletonPaperPreview`
Full paper preview with header and questions.
```tsx
<SkeletonPaperPreview />
```

#### `SkeletonDashboard`
Complete dashboard layout with stats, charts, and lists.
```tsx
<SkeletonDashboard />
```

## 🎯 Usage Examples

### In Pages

```tsx
import { LoadingDashboard, LoadingTable } from "@/components/LoadingState";

export function MyPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  if (loading) {
    return <LoadingDashboard />;
  }

  return <div>{/* Your content */}</div>;
}
```

### In Tables

```tsx
import { LoadingTable } from "@/components/LoadingState";

{loadingQuestions ? (
  <LoadingTable rows={8} columns={5} />
) : (
  <YourTableComponent data={questions} />
)}
```

### With AdminTable

```tsx
import { AdminTable } from "@/components/AdminTable";

<AdminTable
  data={items}
  columns={columns}
  keyExtractor={(item) => item.id}
  loading={isLoading}  // Built-in loading support
  onEdit={handleEdit}
  onDelete={handleDelete}
/>
```

### Conditional Rendering

```tsx
{loading && <LoadingQuestions count={5} />}
{!loading && questions.length === 0 && <EmptyState />}
{!loading && questions.length > 0 && <QuestionList />}
```

## 🎨 Customization

All skeleton components support Tailwind CSS classes via the `className` prop:

```tsx
<Skeleton className="h-20 w-full rounded-2xl bg-blue-200" />
```

### Dark Mode Support

Skeletons automatically adapt to dark mode:
```tsx
// Light mode: bg-slate-200
// Dark mode: bg-slate-700
```

## 📋 Best Practices

1. **Match the Layout**: Use skeleton components that match your actual content layout
2. **Consistent Timing**: Show skeletons for at least 300ms to avoid flashing
3. **Progressive Loading**: Load critical content first, show skeletons for secondary content
4. **Accessibility**: Skeletons are decorative and don't need ARIA labels

### Example: Progressive Loading

```tsx
function QuestionBankPage() {
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  return (
    <div>
      {loadingContext ? (
        <SkeletonForm fields={3} />
      ) : (
        <ContextSelector />
      )}
      
      {loadingQuestions ? (
        <LoadingQuestions count={10} />
      ) : (
        <QuestionList />
      )}
    </div>
  );
}
```

## 🔧 Advanced Usage

### Custom Skeleton Patterns

```tsx
// Custom loading pattern for specific use case
function CustomLoadingPattern() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={3} />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-xl" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
    </div>
  );
}
```

### Skeleton with Staggered Animation

```tsx
function StaggeredSkeleton({ count = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ animationDelay: `${i * 100}ms` }}
          className="animate-in fade-in slide-in-from-left-4"
        >
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}
```

## 📊 Performance

- **Lightweight**: Pure CSS animations, no JavaScript
- **Efficient**: Reuses base `Skeleton` component
- **Accessible**: Doesn't interfere with screen readers
- **Smooth**: 60fps animations using CSS transforms

## 🐛 Troubleshooting

### Skeleton not showing
- Ensure Tailwind CSS is properly configured
- Check that `animate-pulse` utility is available
- Verify component is actually rendering (check React DevTools)

### Animation stuttering
- Reduce number of simultaneous skeletons
- Use `will-change: transform` for complex layouts
- Consider using `SkeletonTable` instead of many individual skeletons

### Dark mode not working
- Ensure `dark:` variant is enabled in Tailwind config
- Check that ThemeProvider is wrapping your app
- Verify `dark` class is applied to root element

## 🎓 Demo

Visit `/skeleton-demo` (if route is configured) to see all skeleton components in action.

## 📝 Component Reference

| Component | Props | Use Case |
|-----------|-------|----------|
| `Skeleton` | `className` | Base building block |
| `SkeletonText` | `lines`, `className` | Multi-line text |
| `SkeletonCard` | `className` | Generic cards |
| `SkeletonTable` | `rows`, `columns` | Data tables |
| `SkeletonForm` | `fields` | Forms |
| `SkeletonList` | `items` | Lists |
| `SkeletonStats` | `count` | Dashboard stats |
| `SkeletonQuestionCard` | - | Question cards |
| `SkeletonPaperPreview` | - | Paper preview |
| `SkeletonDashboard` | - | Full dashboard |

## 🚀 Future Enhancements

- [ ] Shimmer effect variant
- [ ] Skeleton with gradient backgrounds
- [ ] Skeleton with custom animation speeds
- [ ] Skeleton with wave animation
- [ ] Skeleton presets for common patterns
