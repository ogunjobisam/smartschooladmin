

# White-Labelling for Each School

## What This Means
Each school in the platform gets its own branding — logo, primary color, school name — applied throughout the UI when that school is selected. The sidebar header, login page, and document headers reflect the active school's brand instead of the generic "SchoolFlow" branding.

## Database Changes

Add branding columns to the existing `schools` table via migration:

```sql
ALTER TABLE schools
  ADD COLUMN logo_url text,
  ADD COLUMN primary_color text DEFAULT '#1e293b',
  ADD COLUMN accent_color text DEFAULT '#3b82f6',
  ADD COLUMN tagline text;
```

Create a **storage bucket** `school-assets` for logo uploads, with RLS allowing authenticated users in the same org to read, and admins to upload.

## Frontend Changes

### 1. School Branding Context
Create `src/contexts/SchoolBrandingContext.tsx`:
- Fetches the active school's branding fields (`logo_url`, `primary_color`, `accent_color`, `name`, `tagline`) based on `schoolId` from `AuthContext`
- Applies `primary_color` and `accent_color` as CSS custom properties on `document.documentElement`
- Exposes `branding` object to all components

### 2. Sidebar Header Update (`AppSidebar.tsx`)
- Replace hardcoded "SchoolFlow" + `Building2` icon with the school's `logo_url` (if set) and `name`
- Fall back to "SchoolFlow" when no school branding exists

### 3. Login Page Branding (`Login.tsx`)
- Accept an optional `?school=<slug>` query param
- Fetch that school's branding to show their logo and colors on the login page
- Fall back to default SchoolFlow branding

### 4. Top Bar Update (`TopBar.tsx`)
- School selector dropdown shows logos next to school names when available

### 5. Settings Page — Branding Tab (`SettingsPage.tsx`)
- Add a "Branding" section under Settings
- Logo upload (to `school-assets` bucket)
- Color pickers for primary and accent colors
- Live preview of how the sidebar/header will look
- Tagline field
- Restricted to `proprietor` and `group_admin` roles

### 6. Dynamic CSS Variables
The branding context sets these CSS custom properties, which Tailwind config already references for `--sidebar-primary`, `--accent`, etc.:
- `--school-primary` → mapped to sidebar background and header accents
- `--school-accent` → mapped to action buttons and links

## Files to Create/Edit
- **New**: `src/contexts/SchoolBrandingContext.tsx`
- **Edit**: `src/components/layout/AppSidebar.tsx` — dynamic logo/name
- **Edit**: `src/components/layout/TopBar.tsx` — logos in school selector
- **Edit**: `src/pages/SettingsPage.tsx` — branding management UI
- **Edit**: `src/pages/Login.tsx` — optional school-specific branding
- **Edit**: `src/App.tsx` — wrap with `SchoolBrandingProvider`
- **Migration**: Add branding columns to `schools`, create storage bucket

