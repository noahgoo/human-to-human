# NexusPulse MVP — Complete Design System & Specification Document

## 1. Executive Summary & Brand Identity

**Product Name:** NexusPulse  
**Tagline:** High-Signal Engineering Talent Marketplace & Referral Network  
**Target Archetype:** Two-sided MVP (Engineering Job Seekers & Tech Recruiters / Hiring Managers)  
**Core Value Proposition:**
- Eliminates application spam through a balanced 10-token/month candidate budget and customizable employer credit barriers (1–3 credits).
- Surfaces 1st-degree mutual network connections via LinkedIn CSV mapping.
- Automates preliminary technical screening through GitHub repository code analysis (Security Rigor, System Architecture, Runtime & Concurrency, Code Quality).

---

## 2. Design System Tokens (Grounded Modern Utility)

### 2.1 Color Palette
- **Canvas / App Background:** `#F8FAFC` (Slate-50)
- **Card / Surface Container:** `#FFFFFF` (Pure White)
- **Surface Hover / Subtle Tint:** `#F1F5F9` (Slate-100)
- **Borders & Dividers:** `#E2E8F0` (Slate-200)
- **Muted Borders:** `#CBD5E1` (Slate-300)
- **Primary Text / Headings:** `#0F172A` (Slate-900)
- **Secondary Text / Subtitles:** `#475569` (Slate-600)
- **Muted / Placeholder Text:** `#94A3B8` (Slate-400)
- **Brand / Primary Action:** `#0F172A` (Charcoal / Slate-900 with `#FFFFFF` text)
- **Interactive Brand Accent (LinkedIn OAuth):** `#0A66C2`
- **Positive / Match Indicator:**
  - Background: `#ECFDF5` (Emerald-50)
  - Text / Border: `#059669` (Emerald-600)
- **Warning / Review Indicator:**
  - Background: `#FEF3C7` (Amber-50)
  - Text: `#D97706` (Amber-600)
- **Token / Credit Badge:**
  - Background: `#EFF6FF` (Blue-50)
  - Text: `#2563EB` (Blue-600)

### 2.2 Typography
- **Font Family:** `Plus Jakarta Sans`, system-ui, sans-serif
- **Heading 1 (Page Title):** 28px–32px | Bold (700) | Line-height: 1.25 | Letter-spacing: -0.02em
- **Heading 2 (Section Title):** 20px–22px | Semi-bold (600) | Line-height: 1.3 | Letter-spacing: -0.01em
- **Heading 3 (Card Title / Sub-header):** 16px–18px | Semi-bold (600) | Line-height: 1.4
- **Body Regular:** 14px–15px | Regular (400) | Line-height: 1.5
- **Body Small / Captions:** 12px–13px | Medium (500) | Line-height: 1.4
- **Monospace (Code / Repositories):** `JetBrains Mono`, `ui-monospace`, 12px–13px

### 2.3 Spacing & Grid System
- **Grid Layout:** 12-column responsive layout, max-width 1280px, centered
- **Base Grid Unit:** 4px
- **Card Padding:** 24px (p-6) default; 16px (p-4) compact
- **Element Spacing (Gaps):** 8px, 12px, 16px, 24px, 32px
- **Border Radius:**
  - Cards & Containers: `12px` (rounded-xl)
  - Inputs & Buttons: `8px` (rounded-lg)
  - Badges & Tags: `9999px` (rounded-full) or `6px` (rounded-md)

### 2.4 Component Library Patterns
1. **Top Navigation Bar:**
   - 64px fixed height, pure white `#FFFFFF` with bottom border `#E2E8F0`.
   - Left: Square monogram logo + brand text "NexusPulse" + MVP pill.
   - Center: Nav link pills (`Jobs`, `Candidates & Pipeline`, `Post a Job`).
   - Right: Role switcher segmented pill (`Candidate` | `Recruiter`), Token Balance counter pill (`8 / 10 Credits`), notification bell, user avatar.
2. **Metric Summary Cards:**
   - 3 or 4 horizontal column grid.
   - Large metric value (32px Bold), title caption (13px Muted), category icon, and delta/trend badge.
3. **Job & Candidate List Items:**
   - White card container with hover border transition.
   - Left logo/avatar square (48x48px).
   - Match % badge (e.g. `94% Match` emerald pill).
   - Credit requirement tag (e.g. `2 Credits Required`).
   - Mutual connection indicator box with stacked avatar bubbles.
   - Code evaluation score box (`Security`, `Architecture`, `Runtime`).
   - Direct action primary and secondary buttons.

---

## 3. Screen Specifications & Flow Map

### Screen 1: Sign In & Authentication (`/auth`)
- **Type:** Split Two-Column Centered Modal Layout
- **Left Panel (Value Proposition):**
  - NexusPulse brand identity.
  - Three value bullets: 10 Monthly Application Credits, 1st-Degree Connections Discovery, Automated GitHub Code Reviews.
  - Social proof counter: "Trusted by 14,000+ software engineers".
- **Right Panel (Authentication):**
  - Segmented role selector: `Job Seeker` vs. `Recruiter / Company`.
  - Prominent primary CTA: "Continue with LinkedIn" (`#0A66C2`).
  - Or email divider with Email and Password form fields.
  - "Sign In" primary action button + "Create an account" trigger.

### Screen 2: Candidate Onboarding (`/onboarding/candidate`)
- **Type:** Multi-step wizard banner + Two-column form layout
- **Progress Tracker:** Step 1 (Profile Setup - complete), Step 2 (Upload Data - active), Step 3 (Review & Finish).
- **Left Section (Connections Ingestion):**
  - Drag-and-drop target zone for `Connections.csv`.
  - Parse confirmation status showing parsed contacts count (e.g., "1,428 contacts mapped across 342 companies").
  - Clear helper instructions on how to export CSV from LinkedIn privacy settings.
- **Right Section (Resume & Preferences):**
  - Uploaded resume card with replacement trigger.
  - Target role level dropdown (Senior / Staff Engineer, Principal, Lead).
  - Target work location preference (Remote, Hybrid, On-site).
- **Bottom Banner (Token Grant):**
  - Complimentary 10-credit monthly allowance unlock card with explanation of spam-prevention economics.
  - Action button: "Continue to Job Board".

### Screen 3: Job Marketplace & Candidate Dashboard (`/candidate/jobs`)
- **Top Metrics Row:**
  - Available Credits (8 of 10, refreshes in 14 days).
  - Matched Jobs (42 openings matching criteria).
  - Active Applications (2 submitted with live status tracking).
- **Search & Filters:**
  - Semantic search input ("Go, Rust, Distributed Systems").
  - Filter pills: "1st-Degree Connection", "Remote only", "1–2 Credits", and Filter Options icon.
- **Main Feed (Opportunities):**
  - High match cards featuring company logo, role title, compensation range ($240k - $290k), and required credits.
  - Warm connection callout: "3 connections work here (Sarah L., Alex M.)" with "Request Intro" trigger.
  - Primary CTA: "Review & Apply".
- **Right Sidebar:**
  - Recent Application Activity tracker with in-flight progress chips.
  - Educational card: "Why Application Credits?".

### Screen 4: Recruiter Pipeline & Candidate Review (`/recruiter/pipeline`)
- **Top Metrics Row:**
  - Active Job Posts (4 active, 100% capacity).
  - Total Curated Applicants (38 credit-gated, 0 spam).
  - Qualified Matches (12 matches ≥85%).
- **Applicant Feed:**
  - Candidate profile card with match percentage score.
  - Verified internal connections alert ("3 internal Stripe connections" + "Request Warm Ping").
  - Verified GitHub Architecture Review block: Overall score (e.g., 9.2/10), Security Rigor (9.4), Architecture (9.2), Runtime Performance (9.0).
  - Action buttons: "Schedule Interview", "View Dossier", "Request Referral Check".
- **Right Management Sidebar:**
  - **Credit Intake Gate**: Radio button toggle setting required candidate credits (1 Credit vs 2 Credits) to control pipeline selectivity.
  - **Technical AI Evaluation Pillars**: Rubric weight editor (Code Organization 30%, Security Rigor 25%, Runtime & Concurrency 25%, Test Harness 20%).
  - **Hiring Review Panel**: Active engineers reviewing candidate dossiers.

### Screen 5: Post a Job & Screening Setup (`/recruiter/post-job`)
- **Step 1: Role Overview** (Title, Department, Seniority Level, Compensation Range with equity toggle).
- **Step 2: Technical Stack & Scope** (Tag-based skill requirements with matching weights, Markdown role description).
- **Step 3: Automated Technical Screening** (GitHub repository submission requirement checkbox, rubric weight sliders).
- **Step 4: Application Intent & Anti-Spam Barrier** (1 Credit, 2 Credits [Recommended], 3 Credits selectivity selector).
- **Right Sticky Sidebar:**
  - Live marketplace card preview showing exactly how the posting will appear on candidate dashboards.
  - Internal connections detector previewing company engineers on the platform.
  - "Publish Job Posting" primary button.

---

## 4. Export & Implementation Notes

- **CSS Framework:** Tailwind CSS v3.4+ compatible tokens.
- **Component Portability:** Modular layout partitions can be directly extracted into React / Vue / Svelte components.
- **Data Schemas:** Compatible with REST/GraphQL schemas for User Auth, LinkedIn Connection Graph, Candidate Profile Dossiers, and Requisition Rubrics.
