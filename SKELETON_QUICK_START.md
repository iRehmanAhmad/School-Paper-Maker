# Loading Skeletons - Quick Start Guide

## 🚀 5-Minute Integration

### For Tables (Most Common)

```tsx
// 1. Import
import { LoadingTable } from "@/components/LoadingState";

// 2. Add state
const [loading, setLoading] = useState(true);

// 3. Wrap fetch
async function fetchData() {
  setLoading(true);
  try {
    const data = await getData();
    setData(data);
  } finally {
    setLoading(false);
  }
}

// 4. Render
{loading ? (
  <LoadingTable rows={10} columns={5} />
) : (
  <YourTable data={data} />
)}
```

### For AdminTable (Easiest)

```tsx
// Just add loading prop - that's it!
<AdminTable
  data={items}
  columns={columns}
  keyExtractor={(item) => item.id}
  loading={isLoading}  // ← Add this
/>
```

### For Dashboard

```tsx
import { LoadingDashboard } from "@/components/LoadingState";

if (loading) {
  return <LoadingDashboard />;
}

return <YourDashboard />;
```

### For Question Lists

```tsx
import { LoadingQuestions } from "@/components/LoadingState";

{loading ? (
  <LoadingQuestions count={5} />
) : (
  <QuestionList questions={questions} />
)}
```

### For Forms

```tsx
import { LoadingForm } from "@/components/LoadingState";

{loading ? (
  <LoadingForm fields={5} />
) : (
  <YourForm />
)}
```

## 📋 Component Cheat Sheet

| Use Case | Component | Props |
|----------|-----------|-------|
| Data table | `<LoadingTable />` | `rows`, `columns` |
| Admin table | `<AdminTable loading={true} />` | `loading` |
| Dashboard | `<LoadingDashboard />` | none |
| Questions | `<LoadingQuestions />` | `count` |
| Forms | `<LoadingForm />` | `fields` |
| Paper preview | `<LoadingPaper />` | none |
| Generic list | `<SkeletonList />` | `items` |
| Stats cards | `<SkeletonStats />` | `count` |

## ✅ Implementation Checklist

- [ ] Import the loading component
- [ ] Add `loading` state (`useState(true)`)
- [ ] Wrap data fetching in try/finally
- [ ] Set `setLoading(false)` in finally block
- [ ] Add conditional rendering
- [ ] Test with slow network (DevTools throttling)

## 🎯 Examples in Codebase

Look at these files for working examples:
- `src/pages/DashboardPage.tsx` - Full page loading
- `src/pages/QuestionBankPage.tsx` - Table loading
- `src/pages/ClassesPage.tsx` - List loading
- `src/components/AdminTable.tsx` - Built-in loading

## 💡 Pro Tips

1. **Always use try/finally** - Ensures loading stops even on error
2. **Minimum 300ms** - Prevents flashing for fast loads
3. **Match the layout** - Use skeleton that matches your content
4. **Progressive loading** - Load critical content first
5. **Test thoroughly** - Use network throttling in DevTools

## 🐛 Common Mistakes

❌ **Don't do this:**
```tsx
// Forgetting to stop loading on error
try {
  const data = await getData();
  setLoading(false);  // ← Won't run if error occurs
} catch (error) {
  console.error(error);
}
```

✅ **Do this:**
```tsx
// Always use finally
try {
  const data = await getData();
  setData(data);
} finally {
  setLoading(false);  // ← Always runs
}
```

---

❌ **Don't do this:**
```tsx
// No loading state at all
const data = await getData();
return <Table data={data} />;
```

✅ **Do this:**
```tsx
// Show skeleton while loading
if (loading) return <LoadingTable />;
return <Table data={data} />;
```

## 🎨 Customization

Need a custom skeleton? Use the base components:

```tsx
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

function CustomSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-16 rounded-full" />
      <SkeletonText lines={3} />
      <Skeleton className="h-10 w-32 rounded-xl" />
    </div>
  );
}
```

## 📚 Full Documentation

For complete documentation, see:
- `src/components/ui/SKELETON_README.md`
- `LOADING_SKELETONS_IMPLEMENTATION.md`

## 🎉 That's It!

You're ready to add loading skeletons to any page in under 5 minutes.
