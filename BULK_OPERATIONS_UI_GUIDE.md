# Bulk Operations - UI Guide

## 🎨 Visual Walkthrough

### Step 1: Select Questions

```
┌─────────────────────────────────────────────────────────┐
│ Question Bank - Manage Questions                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ☐ Select All  │  Type: All  │  Difficulty: All     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ☑ What is photosynthesis?                    [Edit] │ │
│ │   MCQ • Easy • Remember                              │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ☑ Explain the water cycle.                   [Edit] │ │
│ │   Short • Medium • Understand                        │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ☑ Calculate the area of a circle.            [Edit] │ │
│ │   Long • Hard • Apply                                │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Step 2: Bulk Actions Toolbar Appears

```
┌─────────────────────────────────────────────────────────┐
│ ╔═══════════════════════════════════════════════════╗  │
│ ║  [3]  3 of 150 selected                           ║  │
│ ║       Choose an action below                      ║  │
│ ║                                                   ║  │
│ ║  [✏️ Edit] [📋 Duplicate] [💾 Export]            ║  │
│ ║  [🗑️ Delete]  │  [✖️ Clear]                       ║  │
│ ╚═══════════════════════════════════════════════════╝  │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ☑ What is photosynthesis?                    [Edit] │ │
│ │ ☑ Explain the water cycle.                   [Edit] │ │
│ │ ☑ Calculate the area of a circle.            [Edit] │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Step 3: Bulk Edit Modal

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  ╔════════════════════════════════════════════════════╗ │
│  ║ Bulk Edit Questions                                ║ │
│  ║ Update 3 selected questions                        ║ │
│  ╠════════════════════════════════════════════════════╣ │
│  ║                                                    ║ │
│  ║ ☑ Difficulty Level                                ║ │
│  ║   [Easy ▼]                                         ║ │
│  ║                                                    ║ │
│  ║ ☐ Bloom's Taxonomy Level                          ║ │
│  ║   [Select bloom level ▼] (disabled)               ║ │
│  ║                                                    ║ │
│  ║ ☑ Question Level                                  ║ │
│  ║   [Exercise Question ▼]                            ║ │
│  ║                                                    ║ │
│  ║ ☐ Move to Chapter                                 ║ │
│  ║   [Select chapter ▼] (disabled)                    ║ │
│  ║                                                    ║ │
│  ║ ┌────────────────────────────────────────────────┐ ║ │
│  ║ │ ℹ️ Note: Only checked fields will be updated. │ ║ │
│  ║ │ Unchecked fields will remain unchanged.        │ ║ │
│  ║ └────────────────────────────────────────────────┘ ║ │
│  ║                                                    ║ │
│  ╠════════════════════════════════════════════════════╣ │
│  ║                    [Cancel] [Apply to 3 Questions] ║ │
│  ╚════════════════════════════════════════════════════╝ │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Step 4: Processing State

```
┌─────────────────────────────────────────────────────────┐
│ ╔═══════════════════════════════════════════════════╗  │
│ ║  [3]  3 of 150 selected                           ║  │
│ ║       Choose an action below                      ║  │
│ ║                                                   ║  │
│ ║  [✏️ Edit] [📋 Duplicate] [💾 Export]            ║  │
│ ║  [🗑️ Delete]  │  [✖️ Clear]                       ║  │
│ ║                                                   ║  │
│ ║  ⏳ Processing...                                 ║  │
│ ╚═══════════════════════════════════════════════════╝  │
└─────────────────────────────────────────────────────────┘
```

### Step 5: Success Notification

```
┌─────────────────────────────────────────────────────────┐
│                                    ┌──────────────────┐  │
│                                    │ ✅ Updated 3     │  │
│                                    │    questions     │  │
│                                    │         [Close]  │  │
│                                    └──────────────────┘  │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ☐ What is photosynthesis?                    [Edit] │ │
│ │   MCQ • Easy • Remember                              │ │
│ │ ☐ Explain the water cycle.                   [Edit] │ │
│ │   Short • Easy • Remember                            │ │
│ │ ☐ Calculate the area of a circle.            [Edit] │ │
│ │   Long • Easy • Remember                             │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 🎯 UI Components Breakdown

### Bulk Actions Toolbar

```
╔═══════════════════════════════════════════════════════╗
║  ┌───┐  3 of 150 selected                            ║
║  │ 3 │  Choose an action below                       ║
║  └───┘                                                ║
║  ┌──────────────────────────────────────────────────┐ ║
║  │ [✏️ Edit] [📋 Duplicate] [💾 Export]             │ ║
║  │ [🗑️ Delete]  │  [✖️ Clear]                        │ ║
║  └──────────────────────────────────────────────────┘ ║
╚═══════════════════════════════════════════════════════╝

Components:
├── Selection Badge [3] - Shows count
├── Info Text - "3 of 150 selected"
├── Action Buttons
│   ├── Edit (Blue) - Opens modal
│   ├── Duplicate (Green) - Creates copies
│   ├── Export (Blue) - Downloads CSV
│   ├── Delete (Red) - Removes questions
│   └── Clear (White) - Deselects all
└── Processing Indicator (Optional)
```

### Bulk Edit Modal

```
╔════════════════════════════════════════════════════╗
║ Bulk Edit Questions                                ║
║ Update 3 selected questions                        ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║ Field Selection (Checkboxes)                      ║
║ ├── ☑ Difficulty Level                            ║
║ │   └── [Dropdown: Easy/Medium/Hard]              ║
║ ├── ☐ Bloom's Taxonomy Level                      ║
║ │   └── [Dropdown: Disabled]                       ║
║ ├── ☑ Question Level                              ║
║ │   └── [Dropdown: Exercise/Additional/...]        ║
║ ├── ☐ Move to Chapter                             ║
║ │   └── [Dropdown: Disabled]                       ║
║ └── ☐ Assign to Topic                             ║
║     └── [Dropdown: Disabled]                       ║
║                                                    ║
║ Info Box                                           ║
║ ┌──────────────────────────────────────────────┐  ║
║ │ ℹ️ Only checked fields will be updated       │  ║
║ └──────────────────────────────────────────────┘  ║
║                                                    ║
╠════════════════════════════════════════════════════╣
║                    [Cancel] [Apply to 3 Questions] ║
╚════════════════════════════════════════════════════╝
```

## 🎨 Color Scheme

### Toolbar Colors
```
┌─────────────────────────────────────────┐
│ Background: Brand Blue (#0f6f8f)       │
│ Text: White (#ffffff)                   │
│ Badge: White with transparency          │
│ Buttons:                                │
│   - Edit: White bg, Brand text          │
│   - Duplicate: White bg, Green text     │
│   - Export: White bg, Blue text         │
│   - Delete: Red bg, White text          │
│   - Clear: White/20 bg, White text      │
└─────────────────────────────────────────┘
```

### Modal Colors
```
┌─────────────────────────────────────────┐
│ Background: White (#ffffff)             │
│ Border: Slate 200 (#e2e8f0)             │
│ Header: Slate 900 (#0f172a)             │
│ Text: Slate 700 (#334155)               │
│ Checkboxes: Brand when checked          │
│ Disabled: Opacity 50%                   │
│ Info Box: Blue 50 bg, Blue 700 text     │
│ Apply Button: Brand bg, White text      │
└─────────────────────────────────────────┘
```

## 📱 Responsive Behavior

### Desktop (>768px)
```
┌─────────────────────────────────────────────────────────┐
│ ╔═══════════════════════════════════════════════════╗  │
│ ║  [3]  3 of 150 selected                           ║  │
│ ║                                                   ║  │
│ ║  [✏️ Edit] [📋 Duplicate] [💾 Export]            ║  │
│ ║  [🗑️ Delete]  │  [✖️ Clear]                       ║  │
│ ╚═══════════════════════════════════════════════════╝  │
└─────────────────────────────────────────────────────────┘
```

### Mobile (<768px)
```
┌───────────────────────────┐
│ ╔═══════════════════════╗ │
│ ║ [3] 3 of 150 selected ║ │
│ ║                       ║ │
│ ║ [✏️] [📋] [💾]        ║ │
│ ║ [🗑️] │ [✖️]          ║ │
│ ╚═══════════════════════╝ │
└───────────────────────────┘

- Icons only (no text)
- Stacked layout
- Touch-friendly spacing
```

## 🎭 Animation States

### Toolbar Entrance
```
Frame 1: Hidden (above viewport)
Frame 2: Sliding down (50% visible)
Frame 3: Fully visible (100%)
Duration: 300ms
Easing: ease-out
```

### Button Hover
```
Default: bg-white
Hover: bg-white/90 + scale(1.02)
Active: bg-white/80 + scale(0.98)
Duration: 150ms
```

### Processing Spinner
```
┌─────┐
│  ⟳  │ Rotating 360° continuously
└─────┘
Speed: 1 second per rotation
```

## 🔔 Notification Styles

### Success Toast
```
┌────────────────────────────┐
│ ✅ Updated 3 questions     │
│                   [Close]  │
└────────────────────────────┘
Color: Green (#10b981)
Position: Top-right
Duration: 4 seconds
```

### Error Toast
```
┌────────────────────────────┐
│ ❌ Failed to update        │
│                   [Close]  │
└────────────────────────────┘
Color: Red (#ef4444)
Position: Top-right
Duration: 4 seconds
```

## 🎯 Interactive States

### Checkbox States
```
☐ Unchecked (default)
☑ Checked (brand color)
☒ Indeterminate (partial selection)
⊗ Disabled (grayed out)
```

### Button States
```
[Button]          - Default
[Button]          - Hover (lighter)
[Button]          - Active (pressed)
[Button...]       - Loading (with spinner)
[Button] (grayed) - Disabled
```

### Dropdown States
```
[Select ▼]        - Closed
[Select ▲]        - Open
[Select ▼] (gray) - Disabled
```

## 📐 Spacing & Layout

### Toolbar Spacing
```
Padding: 16px (all sides)
Gap between elements: 12px
Button padding: 8px 16px
Border radius: 16px
```

### Modal Spacing
```
Padding: 24px (all sides)
Gap between fields: 16px
Button padding: 8px 24px
Border radius: 24px
Max width: 640px
```

## 🎨 Typography

### Toolbar
```
Selection count: 18px, bold, white
Info text: 12px, regular, white/80
Button text: 14px, bold
```

### Modal
```
Title: 18px, bold, slate-900
Subtitle: 14px, regular, slate-500
Labels: 14px, bold, slate-700
Info text: 12px, regular, blue-700
```

## 🖱️ Interaction Patterns

### Click Flow
```
1. User clicks checkbox → Question selected
2. Toolbar appears (animated)
3. User clicks "Edit" → Modal opens
4. User checks fields → Dropdowns enable
5. User selects values → Preview updates
6. User clicks "Apply" → Processing starts
7. Success toast appears → Selection clears
```

### Keyboard Flow
```
Tab → Navigate between elements
Space → Toggle checkbox
Enter → Confirm action
Escape → Close modal/Clear selection
```

## 🎯 Accessibility

### ARIA Labels
```html
<button aria-label="Edit selected questions">
<input aria-label="Select question">
<div role="alert">Success message</div>
```

### Focus States
```
Visible focus ring on all interactive elements
Skip links for keyboard navigation
Proper heading hierarchy
```

## 💡 Visual Hierarchy

```
Level 1: Toolbar (highest contrast, sticky)
Level 2: Modal (overlay, centered)
Level 3: Question list (scrollable)
Level 4: Individual questions (cards)
Level 5: Metadata (subtle, smaller text)
```

---

**Design System**: Tailwind CSS
**Icons**: Lucide React
**Animations**: CSS transitions
**Responsive**: Mobile-first approach
