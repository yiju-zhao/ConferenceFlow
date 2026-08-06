# BlueprintJS Redesign — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `@blueprintjs/core` into ConferenceFlow and build the shared UI shell (navbar, avatar menu, page container, section-accent context, dark mode) so that Phase A+ screens can be migrated onto a common foundation.

**Architecture:** Add BlueprintJS as the component library; define per-section accent CSS tokens; add a `ThemeProvider` (dark mode), a `SectionAccent` context (area accent color), and `shell/` primitives (`AppNavbar`, `PageContainer`). Wire `AppNavbar` + `SectionAccentProvider` into the Dashboard to prove the foundation end-to-end. All existing screens keep working (mixed styling) until their own phase.

**Tech Stack:** React 18, TypeScript, Vite, react-router v7, Tailwind (layout only), `@blueprintjs/core@^6.18.0`, `@blueprintjs/icons@^6.13.0`, i18next.

## Global Constraints

(Copied verbatim from the approved spec; every task inherits these.)

- **Accent colors (exact):** dashboard `#4A7FB5`, calendar `#E8976B`, report `#cf0a2c`, admin `#5E8B7E`. Generic primary actions use BlueprintJS cobalt (`bp6-intent-primary`), **not** red.
- **Fonts (unchanged):** Work Sans (headings/navbar), Inter (body), DM Mono (codes/meta/time).
- **Tailwind stays for layout utilities only.** Color comes from CSS variables / BlueprintJS tokens.
- **Routing is unchanged.** Do not add/remove/rename routes. Deep links must keep working.
- **i18n:** reuse existing keys; new keys go in existing namespaces (`avatar`, add `nav`).
- **No test framework exists in this project.** Per-task verification gate = `npm run typecheck && npm run build` (both must pass). Task 6 adds a manual visual smoke as the phase-exit check.
- **Dependencies:** add exactly `@blueprintjs/core@^6.18.0` and `@blueprintjs/icons@^6.13.0` (React peer `18||19` — compatible). Do not add other libraries in Phase 0.
- **Surgical changes:** only touch what each task lists. Do not restyle screens that belong to later phases. Remove only the imports/vars your own change orphans.

---

## File Structure

**Created:**
- `src/contexts/ThemeContext.tsx` — `dark` boolean + `toggleDark`, persisted to `localStorage`, toggles `.bp6-dark` on `<html>`.
- `src/components/shell/SectionAccent.tsx` — React context exposing the current area accent key + hex; `AccentKey` type; `ACCENT_HEX` map; `SectionAccentProvider`; `useSectionAccent`.
- `src/components/shell/PageContainer.tsx` — shared centered max-width + padding wrapper (Tailwind layout).
- `src/components/shell/AppNavbar.tsx` — top navbar: `Conference **Flow**` wordmark (→ `/dashboard`), optional in-conference tab links (active via route), `UserAvatar` slot.

**Modified:**
- `package.json` / `package-lock.json` — add the two BlueprintJS deps.
- `src/main.tsx` — import BlueprintJS CSS; wrap app in `ThemeProvider`.
- `src/index.css` — add accent CSS variables to `:root` (do not remove existing tokens).
- `src/components/UserAvatar.tsx` — replace custom dropdown with BlueprintJS `Popover`+`Menu`; add dark-mode toggle and super-admin link; preserve behavior.
- `src/i18n/zh-CN.json`, `src/i18n/en-US.json` — add `nav.*` and `avatar.darkMode` / `avatar.adminPanel` keys.
- `src/components/Dashboard.tsx` — replace the inline header bar with `<AppNavbar/>`; wrap content in `<SectionAccentProvider accent="dash">`.

---

## Task 1: Install BlueprintJS, wire global CSS, add accent tokens

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/main.tsx` (top of file, before the existing `import "./index.css";` line)
- Modify: `src/index.css` (`:root` block, ends around line 104)

**Interfaces:**
- Produces (CSS): `--accent-dash`, `--accent-cal`, `--accent-report`, `--accent-admin` custom properties on `:root`, available to all later tasks.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @blueprintjs/core@^6.18.0 @blueprintjs/icons@^6.13.0
```
Expected: both packages added to `dependencies`; `package-lock.json` updated.

- [ ] **Step 2: Import BlueprintJS CSS**

In `src/main.tsx`, add these two imports **immediately before** the existing `import "./index.css";` line:

```ts
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
```

Rationale: BlueprintJS component styles use `.bp6-*` classes (higher specificity than Tailwind preflight's element selectors), so they win regardless of order; importing before `index.css` lets project tokens layer on top.

- [ ] **Step 3: Add accent tokens**

In `src/index.css`, inside the `:root { ... }` block (right after the existing `--brand-bg` line, ~line 67), add:

```css
  /* ── Section accent palette (BlueprintJS redesign) ── */
  --accent-dash: #4a7fb5;
  --accent-cal: #e8976b;
  --accent-report: #cf0a2c;
  --accent-admin: #5e8b7e;
```

Do not remove or rename any existing tokens.

- [ ] **Step 4: Verify build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both succeed (Vite resolves the BlueprintJS CSS from `node_modules`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/index.css
git commit -m "feat(ui): install BlueprintJS, wire base CSS and accent tokens"
```

---

## Task 2: ThemeProvider (dark mode)

**Files:**
- Create: `src/contexts/ThemeContext.tsx`
- Modify: `src/main.tsx` (wrap the app)

**Interfaces:**
- Produces: `ThemeProvider` component and `useTheme()` hook returning `{ dark: boolean; toggleDark: () => void }`. Consumed by Task 5 (`UserAvatar`).

- [ ] **Step 1: Create ThemeContext.tsx**

Create `src/contexts/ThemeContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ThemeContextValue {
  dark: boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "cf-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem(STORAGE_KEY) === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("bp6-dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggleDark = () => setDark((d) => !d);

  return <ThemeContext.Provider value={{ dark, toggleDark }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
```

- [ ] **Step 2: Wire ThemeProvider into the app**

In `src/main.tsx`: add the import `import { ThemeProvider } from "./contexts/ThemeContext";`, then wrap the existing `<AuthProvider>...</AuthProvider>` with `<ThemeProvider>` (place `ThemeProvider` inside `<BrowserRouter>`, outside `<AuthProvider>`):

```tsx
<BrowserRouter>
  <ThemeProvider>
    <AuthProvider>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* ...existing routes unchanged... */}
        </Routes>
      </Suspense>
    </AuthProvider>
  </ThemeProvider>
</BrowserRouter>
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/ThemeContext.tsx src/main.tsx
git commit -m "feat(ui): add ThemeProvider for BlueprintJS dark mode"
```

---

## Task 3: SectionAccent context + PageContainer

**Files:**
- Create: `src/components/shell/SectionAccent.tsx`
- Create: `src/components/shell/PageContainer.tsx`

**Interfaces:**
- Produces: `AccentKey` type (`"dash" | "cal" | "report" | "admin" | "none"`), `ACCENT_HEX` map, `SectionAccentProvider` (prop `accent: AccentKey`), `useSectionAccent()` → `{ accent: AccentKey; hex: string }`, and `PageContainer` (props `children`, optional `className`). Consumed by Tasks 4 and 6.

- [ ] **Step 1: Create SectionAccent.tsx**

Create `src/components/shell/SectionAccent.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";

export type AccentKey = "dash" | "cal" | "report" | "admin" | "none";

/** Area identity colors. Keep in sync with `--accent-*` in src/index.css. */
export const ACCENT_HEX: Record<AccentKey, string> = {
  dash: "#4A7FB5",
  cal: "#E8976B",
  report: "#cf0a2c",
  admin: "#5E8B7E",
  none: "#2D72D2",
};

interface SectionAccentValue {
  accent: AccentKey;
  hex: string;
}

const SectionAccentContext = createContext<SectionAccentValue>({
  accent: "none",
  hex: ACCENT_HEX.none,
});

export function SectionAccentProvider({
  accent,
  children,
}: {
  accent: AccentKey;
  children: ReactNode;
}) {
  return (
    <SectionAccentContext.Provider value={{ accent, hex: ACCENT_HEX[accent] }}>
      {children}
    </SectionAccentContext.Provider>
  );
}

export function useSectionAccent(): SectionAccentValue {
  return useContext(SectionAccentContext);
}
```

- [ ] **Step 2: Create PageContainer.tsx**

Create `src/components/shell/PageContainer.tsx`:

```tsx
import type { ReactNode } from "react";

export default function PageContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1280px] px-5 py-6 ${className}`}>{children}</div>
  );
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/SectionAccent.tsx src/components/shell/PageContainer.tsx
git commit -m "feat(ui): add SectionAccent context and PageContainer shell primitives"
```

---

## Task 4: AppNavbar

**Files:**
- Create: `src/components/shell/AppNavbar.tsx`
- Modify: `src/i18n/zh-CN.json` (add `nav` block)
- Modify: `src/i18n/en-US.json` (add `nav` block)

**Interfaces:**
- Consumes: `useSectionAccent()` (Task 3), `UserAvatar` (existing). Props: `showConfTabs?: boolean` (default `false`); uses `useParams` for `confId` and `useLocation` for active state.
- Produces: `AppNavbar` — used by Task 6 (Dashboard) and by later phases (conference screens pass `showConfTabs`).

- [ ] **Step 1: Add nav i18n keys**

In `src/i18n/zh-CN.json`, add a top-level `"nav"` block (e.g. after the `"common"` block):

```json
  "nav": {
    "calendar": "日程",
    "reports": "报告",
    "admin": "会议管理"
  },
```

In `src/i18n/en-US.json`, add the matching block:

```json
  "nav": {
    "calendar": "Schedule",
    "reports": "Reports",
    "admin": "Admin"
  },
```

- [ ] **Step 2: Create AppNavbar.tsx**

Create `src/components/shell/AppNavbar.tsx`:

```tsx
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import UserAvatar from "../UserAvatar";
import { useSectionAccent } from "./SectionAccent";

export default function AppNavbar({ showConfTabs = false }: { showConfTabs?: boolean }) {
  const { t } = useTranslation();
  const { hex } = useSectionAccent();
  const { confId } = useParams();
  const { pathname } = useLocation();

  const tabs = [
    { key: "cal", label: t("nav.calendar"), to: `/conference/${confId}` },
    { key: "reports", label: t("nav.reports"), to: `/conference/${confId}/reports` },
    { key: "admin", label: t("nav.admin"), to: `/conference/${confId}/admin` },
  ];
  const isActive = (to: string) =>
    to === `/conference/${confId}` ? pathname === to : pathname.startsWith(to);

  return (
    <nav
      className="bp6-navbar"
      style={{
        minHeight: 50,
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderBottom: "1px solid var(--border, #e8e8e8)",
      }}
    >
      <Link
        to="/dashboard"
        style={{
          textDecoration: "none",
          fontFamily: "'Work Sans', sans-serif",
          fontSize: 20,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "baseline",
          gap: 1,
        }}
      >
        <span style={{ fontWeight: 800, letterSpacing: "-0.035em", color: "var(--text-primary, #1a1c1c)" }}>
          Conference
        </span>
        <span style={{ fontWeight: 400, letterSpacing: "0.01em", color: "#4A7FB5" }}>Flow</span>
      </Link>

      {showConfTabs && confId && (
        <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {tabs.map((tb) => {
            const active = isActive(tb.to);
            return (
              <Link
                key={tb.key}
                to={tb.to}
                className={`bp6-button bp6-minimal bp6-small ${active ? "bp6-active" : ""}`}
                style={
                  active
                    ? { color: hex, boxShadow: `inset 0 -2px 0 ${hex}` }
                    : undefined
                }
              >
                {tb.label}
              </Link>
            );
          })}
        </div>
      )}

      <div style={{ marginLeft: "auto" }}>
        <UserAvatar size={30} />
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both succeed. (`AppNavbar` is unused until Task 6, which is fine.)

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/AppNavbar.tsx src/i18n/zh-CN.json src/i18n/en-US.json
git commit -m "feat(ui): add AppNavbar shell with conference tab navigation"
```

---

## Task 5: Rewrite UserAvatar to BlueprintJS Popover + Menu (add dark mode + admin link)

**Files:**
- Modify: `src/components/UserAvatar.tsx` (default export only — leave the exported `FirstTimeNameSetup` unchanged)
- Modify: `src/i18n/zh-CN.json` (add `avatar.darkMode`, `avatar.adminPanel`)
- Modify: `src/i18n/en-US.json` (add `avatar.darkMode`, `avatar.adminPanel`)

**Interfaces:**
- Consumes: `useTheme()` (Task 2), `useAuth()` (existing: `userProfile`, `updateDisplayName`, `signOut`, `isSuperAdmin`), `COLORS` from `../constants`, `LanguageSwitcher`. Props unchanged: `{ size?: number; onSignOut?: () => void }`.
- Produces: same default export `UserAvatar` (same props), now rendering BlueprintJS `Popover`+`Menu`, with a dark-mode `Switch` and a super-admin menu item.

- [ ] **Step 1: Add i18n keys**

In `src/i18n/zh-CN.json` `"avatar"` block, add:
```json
    "darkMode": "深色模式",
    "adminPanel": "管理员面板",
```
In `src/i18n/en-US.json` `"avatar"` block, add:
```json
    "darkMode": "Dark Mode",
    "adminPanel": "Admin Panel",
```

- [ ] **Step 2: Rewrite the UserAvatar default export**

Replace the entire default-export `UserAvatar` function in `src/components/UserAvatar.tsx` (keep `getAvatarColor`, `getInitial`, and the `FirstTimeNameSetup` export as-is) with:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Popover, Menu, MenuItem, MenuDivider, Switch, InputGroup, Button } from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { COLORS } from "../constants";
import LanguageSwitcher from "./LanguageSwitcher";

interface UserAvatarProps {
  size?: number;
  onSignOut?: () => void;
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length].hex;
}

function getInitial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

export default function UserAvatar({ size = 32, onSignOut }: UserAvatarProps) {
  const { userProfile, updateDisplayName, signOut, isSuperAdmin } = useAuth();
  const { dark, toggleDark } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName = userProfile?.displayName || "";
  const initial = getInitial(displayName);
  const color = getAvatarColor(displayName);

  const handleEdit = () => {
    setName(displayName);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateDisplayName(name.trim());
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    onSignOut?.();
  };

  const goAdmin = () => {
    setOpen(false);
    navigate("/super-admin");
  };

  return (
    <Popover
      isOpen={open}
      interactionKind="click"
      onInteraction={(next) => setOpen(next)}
      onClose={() => {
        setOpen(false);
        setEditing(false);
      }}
      placement="bottom-end"
      content={
        <div style={{ minWidth: 248, fontFamily: "'Inter', sans-serif" }}>
          {/* Profile header */}
          <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: color,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "'Work Sans', sans-serif",
                }}
              >
                {initial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary, #1a1c1c)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {displayName}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted, #888)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {userProfile?.email}
                </div>
              </div>
            </div>

            {editing ? (
              <div>
                <InputGroup
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  placeholder={t("avatar.enterDisplayName")}
                  autoFocus
                  small
                  fill
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <Button
                    intent="primary"
                    small
                    text={saving ? t("common.saving") : t("common.save")}
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                  />
                  <Button small text={t("common.cancel")} onClick={() => setEditing(false)} />
                </div>
              </div>
            ) : (
              <Button minimal small icon={IconNames.EDIT} text={t("avatar.editName")} onClick={handleEdit} />
            )}
          </div>

          {/* Setting rows (controls must stay interactive inside the popover) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px" }}>
            <span style={{ fontSize: 14 }}>{t("avatar.language")}</span>
            <LanguageSwitcher variant="badge" />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px" }}>
            <span style={{ fontSize: 14 }}>{t("avatar.darkMode")}</span>
            <Switch checked={dark} onChange={toggleDark} />
          </div>

          {/* Actions */}
          <Menu style={{ boxShadow: "none" }}>
            {isSuperAdmin && (
              <MenuItem icon={IconNames.CROWN} text={t("avatar.adminPanel")} onClick={goAdmin} />
            )}
            <MenuDivider />
            <MenuItem icon={IconNames.LOG_OUT} text={t("avatar.signOut")} intent="danger" onClick={handleSignOut} />
          </Menu>
        </div>
      }
    >
      <button
        type="button"
        title={displayName}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.45,
          fontFamily: "'Work Sans', sans-serif",
          fontWeight: 700,
        }}
      >
        {initial}
      </button>
    </Popover>
  );
}
```

Note: the existing file already imports `useState`, `useTranslation`, `useAuth`, `COLORS`, `LanguageSwitcher` and defines `getAvatarColor`/`getInitial`. Merge the new imports (`useNavigate`, `Popover`, `Menu`, `MenuItem`, `MenuDivider`, `Switch`, `InputGroup`, `Button`, `IconNames`, `useTheme`) and replace only the default export; do not duplicate the helper functions or touch `FirstTimeNameSetup`.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both succeed. Watch for any now-unused imports in `UserAvatar.tsx` (e.g. `useRef`, `useEffect` were used by the old click-outside logic and are no longer needed) — remove only the ones this change orphaned.

- [ ] **Step 4: Commit**

```bash
git add src/components/UserAvatar.tsx src/i18n/zh-CN.json src/i18n/en-US.json
git commit -m "feat(ui): rebuild UserAvatar with BlueprintJS Popover; add dark mode + admin link"
```

---

## Task 6: Wire AppNavbar into Dashboard (Phase 0 exit check)

**Files:**
- Modify: `src/components/Dashboard.tsx` (replace the inline header block at lines 248–274; wrap content)

**Interfaces:**
- Consumes: `AppNavbar` (Task 4), `SectionAccentProvider` (Task 3). The super-admin entry moves into the avatar menu (Task 5), so the header's separate admin link is removed here.

- [ ] **Step 1: Replace the Dashboard header with AppNavbar**

In `src/components/Dashboard.tsx`, the main return (line 245) currently looks like:

```tsx
  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <FirstTimeNameSetup />
      <div className="bg-gradient-to-r from-dash-blue-deep to-dash-blue px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 ...>ConferenceFlow</h1>
          <div className="flex items-center gap-2.5">
            {isSuperAdmin && ( <Link to="/super-admin" ...>{t("dashboard.adminPanel")}</Link> )}
            <UserAvatar size={28} onSignOut={() => navigate("/login")} />
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto p-8 pt-10">
        {/* ...conference cards... */}
```

Replace the header `<div className="bg-gradient-to-r ...">…</div>` block (lines 248–274) with:

```tsx
      <AppNavbar />
```

Add the imports at the top of the file:

```tsx
import AppNavbar from "./shell/AppNavbar";
import { SectionAccentProvider } from "./shell/SectionAccent";
```

- [ ] **Step 2: Wrap content in SectionAccentProvider**

Wrap the content `<div className="max-w-6xl mx-auto p-8 pt-10">…</div>` (and the `FirstTimeNameSetup`) so the dashboard area reports the `dash` accent. Concretely, change the outer structure to:

```tsx
  return (
    <SectionAccentProvider accent="dash">
      <div className="min-h-screen bg-[#F7F5F2]">
        <FirstTimeNameSetup />
        <AppNavbar />
        <div className="max-w-6xl mx-auto p-8 pt-10">
          {/* ...existing conference cards unchanged... */}
        </div>
      </div>
    </SectionAccentProvider>
  );
```

- [ ] **Step 3: Remove orphaned imports/vars**

After removing the inline header, `isSuperAdmin`, the `Link`/`navigate` used only for the header admin link, and the old `UserAvatar` import may become unused **if** they are not referenced elsewhere in `Dashboard.tsx`. Check each: keep the import/var if it is still used elsewhere in the file, otherwise remove it. (Do not remove `FirstTimeNameSetup`.)

- [ ] **Step 4: Verify build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: both succeed.

- [ ] **Step 5: Visual smoke (Phase 0 exit check)**

Run the dev server and verify against the prototype dashboard (screen 01):
```bash
npm run dev
```
Confirm in the browser (log in, go to `/dashboard`):
1. The new `AppNavbar` shows the `Conference **Flow**` wordmark (blue "Flow") on the left.
2. Clicking the avatar opens the BlueprintJS popover: profile header, "修改名称 / Edit Name" works (inline input + Save), language switcher renders, **Dark Mode switch toggles `.bp6-dark` on `<html>` and the navbar/avatar flip to dark**, and (for a super-admin account) an "管理员面板 / Admin Panel" item links to `/super-admin`.
3. Sign out returns to `/login`.
4. Existing conference cards below the navbar still render (old styling is expected and fine for Phase 0).

- [ ] **Step 6: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(ui): wire AppNavbar and dash accent into Dashboard (Phase 0 complete)"
```

---

## Self-Review

**1. Spec coverage (Phase 0 scope only):**
- Install BlueprintJS + base CSS → Task 1 ✓
- Accent tokens (`--accent-dash/cal/report/admin`) → Task 1 ✓ (admin `#5E8B7E` per spec clarification)
- `shell/` primitives (`AppNavbar`, `PageContainer`, `SectionAccent`) → Tasks 3, 4 ✓ (`PageContainer` created; first consumed in Phase B, but part of the foundation)
- UserAvatar as Popover+Menu with dark mode + admin link → Task 5 ✓
- Dark mode wired (`ThemeProvider` + `.bp6-dark`) → Task 2 ✓
- Icons via `@blueprintjs/icons` (`IconNames`) → Task 5 ✓ (full icon migration is per-screen in later phases)
- Dashboard renders in the new shell → Task 6 ✓
- Phase 0 exit (typecheck+build green; login/dashboard in shell; dark mode toggles) → Task 6 Step 5 ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling". Every code step contains real code. i18n keys given verbatim. The only intentional "unchanged" references are to existing code explicitly out of Phase 0 scope (`FirstTimeNameSetup`, conference cards, later-phase screens).

**3. Type/name consistency:**
- `useTheme()` → `{ dark, toggleDark }` — defined Task 2, consumed Task 5 ✓
- `useSectionAccent()` → `{ accent, hex }`; `ACCENT_HEX`; `AccentKey`; `SectionAccentProvider accent="dash"` — defined Task 3, consumed Tasks 4 & 6 ✓
- `AppNavbar({ showConfTabs })` — defined Task 4, consumed Task 6 (without prop) ✓
- `UserAvatar({ size, onSignOut })` — props unchanged from existing; consumed by `AppNavbar` with `size={30}` ✓
- BlueprintJS imports (`Popover`, `Menu`, `MenuItem`, `MenuDivider`, `Switch`, `InputGroup`, `Button`, `IconNames`) — all real exports of v6 ✓

**Risk note carried into tasks:** BlueprintJS CSS + Tailwind preflight coexistence. Task 1 Step 2 documents the import order and the specificity rationale; if the Task 6 smoke test shows a preflight clash on a BlueprintJS component, fix it locally (do **not** disable Tailwind preflight globally in Phase 0 — existing screens depend on it).
