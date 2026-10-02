---
name: Grounded Modern Utility
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#45474c'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#00190e'
  on-tertiary: '#ffffff'
  tertiary-container: '#00301f'
  on-tertiary-container: '#24a375'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 3rem
    fontWeight: '700'
    lineHeight: 3.5rem
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.25rem
    fontWeight: '700'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.625rem
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: -0.005em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1.125rem
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  margin-desktop-wide: 3rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
  space-4xl: 4rem
---

## Brand & Style

This design system embodies the ethos of quiet, high-craft software utility. The visual tone is grounded, calm, and unmistakably engineered by human hands with architectural clarity. It completely rejects gimmicks, decorative AI meshes, harsh neon gradients, and hyperactive micro-interactions in favor of deep structural clarity, disciplined typography, and tactile precision reminiscent of Stripe, Linear, and Notion.

The audience consists of modern product teams, operators, and discerning professionals who value their attention. The UI evokes a sense of unhurried confidence, cognitive relief, and focused agency:
- **Calm Authority:** Muted off-whites and cool grays lower visual fatigue while high-legibility typographic hierarchies establish immediate mental order.
- **Architectural Minimalism:** Whitespace serves as an active structural element, organizing density rather than simply leaving void space.
- **Deliberate Craft:** Thin, sharp hairline borders, subtle ink-tinted inner highlights, and crisp micro-geometry communicate rigor and reliability.

## Colors

The palette leverages balanced slate tones, structured off-white background planes, and selective functional accents. Every hue carries deliberate contrast ratios to comply with WCAG 2.1 AA/AAA accessibility standards.

### Canvas & Surface Hierarchy
- **Base Canvas (`#F8F9FA`):** The foundational backdrop across workspaces, providing a soft, non-fatiguing substrate.
- **Elevated Canvas / Card Surface (`#FFFFFF`):** High-clarity primary containment plane for interactive controls, cards, modals, and data tables.
- **Subtle Surface (`#F1F5F9`):** Recessed wells, nested panels, secondary button states, and table headers.

### Primary Accents & Neutral Spectrum
- **Primary Ink (`#1E293B`):** Deep slate-navy utilized for primary action buttons, focused headers, and strong anchor points. It provides executive gravity without the harshness of pure black.
- **Focus & Interaction Tint (`#2563EB`):** A sharp, grounded cobalt used sparingly for active states, link affordances, text selection, and keyboard focus rings.
- **Success Accent (`#059669`):** Natural emerald tone dedicated exclusively to positive deltas, valid input validations, live deployment health, and completed tasks.
- **Warning & Destructive:** Warm amber (`#D97706`) and precise crimson (`#DC2626`) reserved strictly for alerts, destructive actions, and critical halts.
- **Borders & Dividers (`#E2E8F0`):** Fine, cool-slate structural line work with an auxiliary subtle variant (`#F1F5F9`) for internal list dividers.
- **Typography Ink:** High-priority titles and values anchor at `#0F172A`, body and interactive labels use `#475569`, and subdued captions settle into `#64748B`.

## Typography

The type scale relies on **Plus Jakarta Sans** for headlines, editorial labels, and running copy, chosen for its contemporary geometric balance and humanist clarity. **JetBrains Mono** is introduced for tabular data, hash identifiers, system tokens, and API parameter displays.

### Typographic Principles
- **Optical Tracking:** Tighten letter-spacing progressively as font-size climbs (`-0.025em` on Display down to `0em` at body sizing) to lock headline density.
- **Hierarchy through Weight and Value:** Prefer shifting down to slate-gray (`#475569`) or shifting weight from Medium (`500`) to SemiBold (`600`) over multiplying font sizes.
- **Tabular Figures:** Always render timestamps, metric counters, financial values, and data tables with font-variant-numeric: `tabular-nums` to preserve alignment.

## Layout & Spacing

Layouts follow a clean fluid grid with strict column containment based on an 8pt modular scale, utilizing an auxiliary 4pt sub-scale for micro-spacing inside form controls and interactive pills.

### Layout Breakpoints
- **Mobile (`< 640px`):** Single column fluid container with `margin-mobile` (16px), 16px gutters, and vertical stacking of horizontal navigation bars.
- **Tablet (`640px - 1024px`):** 8-column layout with 24px margins and gutters; sidebars collapse into persistent horizontal drawer toggles.
- **Desktop (`1024px - 1440px`):** 12-column fixed-max layout (1200px or 1280px standard container) with a 240px persistent low-contrast left navigation panel.
- **Wide Canvas (`> 1440px`):** Max container clamped to 1360px with `margin-desktop-wide` (48px) centering the content viewport.

### Rhythmic Padding Rules
- **Form Components:** 8px vertical padding paired with 12px or 16px horizontal inset.
- **Cards and Panels:** 20px or 24px uniform padding (`space-xl`), scaling down to 16px on mobile viewports.
- **Section Spacing:** 32px (`space-3xl`) to 48px (`space-4xl`) separating major functional operational panels to maintain mental white space.

## Elevation & Depth

Depth is articulated through crisp, structural, low-contrast borders combined with ultra-diffused ambient drop shadows. The system avoids noisy skeuomorphism and heavy blurred glassmorphic backdrops, favoring physical paperboard layers that sit naturally above the neutral `#F8F9FA` canvas.

### Surface Tiers
- **Flat Ground (`#F8F9FA`):** Zero elevation. Base canvas for background viewports and workspace frames.
- **Surface Level 1 (Static Cards, Sidebars):** Surface color `#FFFFFF` with a crisp 1px perimeter border of `#E2E8F0` and a featherweight ambient shadow:
  - `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.02);`
- **Surface Level 2 (Interactive Cards Hover, Popovers, Flyout Menus):**
  - Surface color `#FFFFFF`, border `#CBD5E1`.
  - `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04);`
- **Surface Level 3 (Dialog Modals, Floating Command Palettes):**
  - Surface color `#FFFFFF`, border `#E2E8F0`.
  - `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.03);`
  - Backdrop overlay: `#0F172A` at 35% opacity, paired with an ultra-subtle backdrop blur (`backdrop-filter: blur(2px)`).

### Inner Bevel Highlight
Primary action elements and interactive surface buttons employ an interior top bevel for tactile polish:
- `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.16);` on dark primary actions.
- `box-shadow: 0 1px 2px 0 rgba(15, 23, 42, 0.05), inset 0 1px 0 0 #FFFFFF;` on light secondary actions.

## Shapes

The design system uses a **Soft** shape archetype (`roundedness: 1`), providing measured modern curves without crossing into playful or toy-like aesthetics.

### Geometric Corner Logic
- **Base Geometry (`rounded` / 6px or 0.375rem):** Standard buttons, text inputs, dropdown triggers, and interactive menu rows.
- **Medium Structural (`rounded-lg` / 8px or 0.5rem):** Cards, metric containers, code blocks, tab panels, and contextual tooltips.
- **Large Structural (`rounded-xl` / 12px or 0.75rem):** Global modal dialogues, command palettes (`Cmd+K`), and sticky notification panels.
- **Full Radius (`rounded-full`):** Strictly reserved for status badge dots, user avatar images, and system activity indicators. Avoid pills for primary call-to-action buttons to maintain structural alignment with rectangular form fields.

## Components

### Buttons
- **Primary:** Background `#1E293B`, text `#FFFFFF`, border `1px solid #0F172A`, radius 6px, padding `8px 16px`. Top inner highlight `inset 0 1px 0 rgba(255,255,255,0.14)`. Hover state transitions to `#334155`. Active state translates `translateY(0.5px)` with shadow compression.
- **Secondary:** Background `#FFFFFF`, text `#0F172A`, border `1px solid #E2E8F0`, radius 6px, padding `8px 16px`. Subtle ambient drop shadow `0 1px 2px rgba(15,23,42,0.05)`. Hover state shifts background to `#F8F9FA` and border to `#CBD5E1`.
- **Tertiary / Ghost:** Background transparent, text `#475569`, radius 6px, padding `8px 12px`. Hover state applies `#F1F5F9` background and `#0F172A` text color.

### Form Inputs & Selects
- Container height: 38px. Background `#FFFFFF`, border `1px solid #E2E8F0`, text `#0F172A`, placeholder `#94A3B8`. Padding: `8px 12px`, radius 6px.
- **Focus State:** Border changes to `#2563EB`, paired with a crisp outer glow: `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12)`. No default browser outlines.
- **Validation State:** In error, border shifts to `#DC2626` with `0 0 0 3px rgba(220, 38, 38, 0.1)`. Helper text renders in `#DC2626` with `font-size: 0.75rem`.

### Chips & Status Badges
- Compact height (22px-24px), radius 4px or 6px (not pill-shaped), padding `2px 8px`, typography `label-sm`.
- **Neutral:** Background `#F1F5F9`, text `#475569`, border `1px solid #E2E8F0`.
- **Success:** Background `#ECFDF5`, text `#065F46`, border `1px solid #A7F3D0`. Includes a 6px circular dot (`#059669`) positioned inline left.
- **Active / Accent:** Background `#EFF6FF`, text `#1E40AF`, border `1px solid #BFDBFE`.

### Cards & Panels
- Background `#FFFFFF`, border `1px solid #E2E8F0`, radius 8px, padding 20px or 24px.
- Internal headers feature a dedicated separator line (`border-bottom: 1px solid #F1F5F9`) with 16px bottom padding, neatly segregating header metadata from card body execution areas.

### Checkboxes & Radios
- Size: 16px x 16px. Background `#FFFFFF`, border `1.5px solid #CBD5E1`, radius 4px (checkbox) or circular (radio).
- **Checked:** Background `#1E293B`, border `#1E293B`. Icon check is pure white (`#FFFFFF`) with 2px stroke width. Focus outlines mirror the 3px subtle focus ring of text inputs.

### Lists & Data Rows
- Table rows and item lists use fixed 48px or 52px heights with internal `border-bottom: 1px solid #F1F5F9`.
- Hover state across list items introduces a light transition to `#F8F9FA`. Text switches from secondary `#475569` to primary `#0F172A` on row hover.

### Command Palette (Specialty Component)
- Centered modal anchored 15% from the top viewport. Width 580px, background `#FFFFFF`, border `1px solid #CBD5E1`, radius 12px, elevated at Level 3.
- Integrated search input without outer borders, anchored by a 16px keyboard navigation badge (`Esc` / `↵`) formatted in `code-sm` over `#F1F5F9`.