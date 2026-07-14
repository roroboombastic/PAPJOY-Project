# PAP-JOY Design System

## 🎨 Design Philosophy
**Premium, Modern, Cohesive** - Every element reflects a unified brand identity with sophisticated aesthetics and smooth interactions.

---

## 📐 Color Palette

### Primary Colors
- **Primary Background**: `#0f1015` - Deep dark navy base
- **Surface**: `#161823` - Elevated surface color
- **Surface Light**: `#1f2332` - Lighter surface variant

### Accent Colors
- **Primary Accent**: `#f5a442` - Warm golden orange
- **Accent Strong**: `#ffb557` - Bright golden orange
- **Text**: `#f7f7fb` - Off-white text
- **Muted**: `#a9aec8` - Muted gray for secondary text
- **Border**: `rgba(255, 255, 255, 0.08)` - Subtle borders

### Semantic Colors
- **Success**: `#2ecc71` - Green
- **Error**: `#e74c3c` - Red
- **Warning**: `#f1c40f` - Yellow
- **Info**: `var(--accent)` - Orange

---

## 🔤 Typography

### Font Families
- **Display Font**: `Playfair Display` (serif) - Headlines, brand, large text
- **Body Font**: `Poppins` (sans-serif) - Body copy, UI elements

### Font Weights
- **Light**: 300
- **Regular**: 400
- **Medium**: 500
- **Semi-Bold**: 600
- **Bold**: 700

### Font Scales
- **H1**: `clamp(2.5rem, 4vw, 4rem)` - Hero titles
- **H2**: `2rem` - Section headers
- **H3**: `1.3rem` - Subsection headers
- **Body**: `1rem` - Regular text
- **Small**: `0.9rem` - Secondary text
- **Tiny**: `0.75rem` - Badges, captions

---

## 🎭 Component Styling

### Buttons
**Primary Button** (Gradient)
- Background: `linear-gradient(135deg, var(--accent), var(--accent-strong))`
- Color: `#000` (black text)
- Padding: `14px 28px`
- Border Radius: `12px`
- Box Shadow: `0 4px 16px rgba(245, 164, 66, 0.3)`
- Hover: `translateY(-2px)`, increased shadow

**Secondary Button** (Outline)
- Background: `rgba(255, 255, 255, 0.05)`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Color: `var(--text)`
- Hover: Increased opacity, border color change

### Cards
- Background: `var(--surface)`
- Border: `1px solid rgba(255, 255, 255, 0.08)`
- Border Radius: `20px`
- Padding: `24px - 32px`
- Backdrop Filter: `blur(20px)` (where applicable)
- Box Shadow: `0 24px 80px rgba(0, 0, 0, 0.18)`
- Hover: `translateY(-4px to -8px)`, increased shadow

### Inputs
- Background: `rgba(255, 255, 255, 0.05)`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Border Radius: `12px`
- Padding: `14px 20px`
- Color: `var(--text)`
- Focus: Border color `var(--accent)`, shadow `0 0 0 2px rgba(245, 164, 66, 0.2)`

### Badges
- Background: `rgba(245, 164, 66, 0.1)`
- Color: `var(--accent)`
- Padding: `4px 8px` to `8px 16px`
- Border Radius: `12px` to `24px`
- Font Weight: `600`
- Font Size: `0.75rem` to `0.85rem`

---

## 🧭 Layout System

### Sidebar Navigation
- **Position**: Fixed, left side
- **Width**: `280px`
- **Background**: `linear-gradient(180deg, rgba(12, 14, 22, 0.98), rgba(18, 22, 35, 0.98))`
- **Breakpoint**: Collapses on `max-width: 1000px`
- **Mobile**: Becomes hamburger toggle

### Main Content
- **Max Width**: `1150px`
- **Padding**: Responsive (24px - 60px)
- **Background**: Gradient with radial overlays

### Grid System
- **Products**: `repeat(auto-fit, minmax(280px, 1fr))`
- **Features**: `repeat(auto-fit, minmax(280px, 1fr))`
- **Testimonials**: `repeat(auto-fit, minmax(300px, 1fr))`

---

## 🎬 Animation System

### Timing Functions
- **Standard**: `0.3s ease`
- **Cubic**: `0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- **Smooth**: `0.8s ease-out`

### Animation Types

**Fade In Up**
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Slide In Left**
```css
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-30px); }
  to { opacity: 1; transform: translateX(0); }
}
```

**Float**
```css
@keyframes float {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(180deg); }
}
```

**Pulse**
```css
@keyframes pulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(245, 164, 66, 0.3); }
  50% { box-shadow: 0 4px 24px rgba(245, 164, 66, 0.5); }
}
```

---

## 📱 Responsive Breakpoints

### Desktop
- **Min Width**: 1000px
- **Layout**: Sidebar + Main content side-by-side
- **Font Scale**: Full size

### Tablet
- **Max Width**: 999px
- **Layout**: Sidebar becomes horizontal nav or hidden
- **Font Scale**: Reduced slightly

### Mobile
- **Max Width**: 640px
- **Layout**: Full screen, hamburger menu
- **Font Scale**: Reduced to fit

---

## 🎯 Component Hierarchy

### Page Structure
1. **Sidebar** (Fixed)
2. **Mobile Menu Toggle** (Fixed, hidden on desktop)
3. **Main Content** (Margin-left on desktop)
4. **Footer** (Full width)

### Content Sections
1. **Hero** - Large, immersive, animated
2. **Featured** - Showcase best products/content
3. **Info Panels** - Feature highlights, 4-6 columns
4. **Testimonials** - Social proof, 3 columns
5. **Newsletter** - Call-to-action, centered
6. **Footer** - Contact, links, social

---

## ✨ Special Effects

### Glassmorphism
- Background: `rgba(color, opacity)`
- Backdrop Filter: `blur(10px - 20px)`
- Border: `1px solid rgba(255, 255, 255, 0.08)`

### Gradients
- **Accent Gradient**: `linear-gradient(135deg, var(--accent), var(--accent-strong))`
- **Background Gradient**: `linear-gradient(180deg, #0b0c11, #12141c)`
- **Radial**: `radial-gradient(circle at position, color-start, transparent)`

### Shadow System
- **Subtle**: `0 2px 8px rgba(0, 0, 0, 0.1)`
- **Medium**: `0 8px 24px rgba(0, 0, 0, 0.15)`
- **Large**: `0 24px 80px rgba(0, 0, 0, 0.18)`

---

## 🎨 Consistent Patterns

### Headers
- Eyebrow: Small, muted, uppercase
- Heading: Large, bold, sometimes with gradient
- Description: Medium, muted, limited width

### Cards
- Hover: Lift effect + increased shadow
- Active: Accent border + background highlight
- Disabled: Reduced opacity + cursor not-allowed

### Forms
- Labels: Medium weight, color: var(--text)
- Inputs: Standard spacing, consistent border
- Focus: Accent highlight, shadow effect
- Error: Red border, error message below

### Navigation
- Active: Accent background + text color
- Hover: Slight background + transform
- Disabled: Muted color, no pointer

---

## 📋 Usage Guidelines

### When Creating New Pages
1. Add sidebar navigation to every page
2. Use consistent color variables
3. Apply hover animations to interactive elements
4. Ensure responsive behavior at all breakpoints
5. Use consistent typography hierarchy
6. Add toast notifications for user feedback

### When Creating Components
1. Use CSS variables for colors
2. Apply consistent padding/margin system
3. Include smooth transitions
4. Add focus states for accessibility
5. Test on mobile devices

### When Styling Text
1. Use typography hierarchy (H1, H2, H3, body, small)
2. Apply appropriate font weights
3. Use color contrast ratios ≥ 4.5:1
4. Limit line length to ~65 characters for body text

---

## 🎊 Brand Essence

**PAP-JOY** embodies:
- **Premium Quality**: Refined materials, attention to detail
- **Modern Aesthetics**: Contemporary design trends, smooth interactions
- **Customer Focus**: Clear communication, intuitive navigation
- **Sophistication**: Elevated color palette, professional typography
- **Reliability**: Consistent patterns, predictable behavior

Every element reinforces this brand promise.
