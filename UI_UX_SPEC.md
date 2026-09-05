# UI_UX_SPEC.md

The product should feel like a modern enterprise SaaS application that happens
to run inside the customer's own datacentre. Two screens carry that impression:
the **Post Editor** and the **Approval Review**. Everything else is competent
and quiet.

---

## 1. Design principles

1. **The next action is obvious.** Every screen answers "what am I supposed to
   do here?" before it answers anything else.
2. **Status is never ambiguous.** Colour plus icon plus text — never colour
   alone. A monochrome print-out must still be readable.
3. **Scan before read.** Lists lead with what the user filters on: status,
   priority, age, owner.
4. **Density with air.** Enterprise users work in these tables all day; rows are
   compact, but never cramped.
5. **Server truth.** Buttons are rendered from the server-computed capability
   set. If the server would refuse, the button is not there.
6. **No surprises.** Destructive and irreversible actions confirm; approval
   confirms and states exactly which version it applies to.

---

## 2. Design system

Built on **shadcn/ui** (Radix primitives, locally generated into
`components/ui`) with a project layer in `components/app`. Tailwind CSS with a
token layer in CSS custom properties. Zero external asset loading — fonts are
self-hosted (Inter, bundled) with a system fallback stack.

### Tokens
```
--background --foreground --card --popover --muted --border --input --ring
--primary --primary-foreground        brand blue
--secondary --accent
--destructive --warning --success --info
--radius: 0.5rem
```
Light and dark palettes both defined; dark is available but not the default.
All pairs meet WCAG 2.2 AA contrast (4.5:1 for body, 3:1 for large text and UI
boundaries).

### Status colour map
| Status | Colour role | Icon | Label |
| --- | --- | --- | --- |
| DRAFT | muted / grey | `PencilLine` | Draft |
| SUBMITTED | info / blue | `Send` | Submitted |
| IN_REVIEW | primary / indigo | `Eye` | In review |
| CHANGES_REQUESTED | warning / amber | `Undo2` | Changes requested |
| APPROVED | success / green | `CheckCircle2` | Approved |
| REJECTED | destructive / red | `XCircle` | Rejected |
| CANCELLED | muted | `Ban` | Cancelled |
| ARCHIVED | muted | `Archive` | Archived |

Priority: LOW (grey, `ChevronDown`), NORMAL (slate, `Minus`), HIGH (amber,
`ChevronUp`), URGENT (red, `ChevronsUp`).

SLA: on-track (green, `Clock`), warning ≥75% elapsed (amber, `AlertTriangle`),
overdue (red, `AlertOctagon`) — each with a text remainder such as "Due in 6h"
or "Overdue by 2h".

### Typography and spacing
Type scale 12 / 14 / 16 / 20 / 24 / 30 px; body 14px, page titles 24px semibold.
Spacing on a 4px grid. Max content width 1440px; the two hero screens use the
full width available.

### Component inventory
`Button` `IconButton` `Input` `Textarea` `Select` `Combobox` `Checkbox`
`RadioGroup` `Switch` `DatePicker` `Modal` `Drawer` `Dropdown` `Tabs`
`Accordion` `Tooltip` `Badge` `StatusBadge` `PriorityBadge` `VersionBadge`
`SLAIndicator` `Avatar` `DataTable` `Pagination` `FilterBar` `SearchInput`
`EmptyState` `LoadingState` `SkeletonRow` `ErrorState` `Toast`
`ConfirmationDialog` `Timeline` `ApprovalTimeline` `CommentThread`
`CommentComposer` `MentionAutocomplete` `FileUploader` `MediaPreview`
`MediaGallery` `RichTextEditor` `PostPreview` `VersionComparison`
`DecisionPanel` `SubmissionConfirmation` `ReadinessChecklist` `StatCard`
`PageHeader` `Breadcrumbs` `NotificationBell` `UserMenu`.

Every one of these lives in `components/app` or `components/ui` and is used
everywhere the pattern appears. A one-off variant is a bug.

---

## 3. Application shell

```
┌────────────────────────────────────────────────────────────────────┐
│ ▤  Content Approval        [ global search ]        🔔 3   ⟨JD⟩ ▾ │
├───────────┬────────────────────────────────────────────────────────┤
│ Dashboard │  Posts ›  Introducing Kron PAM 4.0                     │
│ My Posts  │  ─────────────────────────────────────────────────────  │
│ Create    │                                                        │
│ Approvals⁵│   page content                                         │
│ Notif.   ³│                                                        │
│ Reports   │                                                        │
│ Admin     │                                                        │
│           │                                                        │
│ ‹ collapse│                                                        │
└───────────┴────────────────────────────────────────────────────────┘
```

- Sidebar is collapsible (icon-only at 64px) and remembers its state per user.
- Navigation is role-aware: Approvals appears with `APPROVAL_READ`, Reports with
  `REPORT_READ`, Administration with any admin permission. Badges show open
  counts.
- Breadcrumbs on every page below the top level.
- Global search (`/` focuses it) searches posts by title and body, plus users
  for administrators.
- User menu: Profile, Preferences, **Change Password (LOCAL users only)**,
  Sessions, Logout. Entra users never see password UI.
- On tablet/mobile the sidebar becomes a slide-over drawer; the top bar keeps
  search, notifications and the user menu.

---

## 4. HERO SCREEN A — Post Editor

`/posts/new`, `/posts/:id/edit`. The flow is **CREATE → PREVIEW → VALIDATE →
SUBMIT** and the screen must make all four states legible without documentation.

### Layout (desktop ≥1280px)
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ My Posts   Introducing Kron PAM 4.0        ✓ Saved 12:04              │
│                                  [Preview]  [Save draft]  [Submit ▸]    │
├───────────────────────────────────────────┬──────────────────────────────┤
│  ⚠ Changes requested on version 2         │  SUBMISSION READINESS        │
│    "Tighten the second paragraph and      │  ✓ Title provided            │
│     add the release date." — Jane M.      │  ✓ Content provided (412 ch) │
│    You are now creating version 3.        │  ✓ 2 attachments valid       │
│                                           │  ✓ Approval route selected   │
│  ┌─────────────────────────────────────┐  │  ✗ Department required       │
│  │ Title                               │  │  ─────────────────────────── │
│  └─────────────────────────────────────┘  │  Submit is enabled when all  │
│  ┌─────────────────────────────────────┐  │  items pass.                 │
│  │ B I U ≡ • 1. 🔗 " ⌫                 │  │                              │
│  │                                     │  │  POST SETTINGS               │
│  │  Rich text (Tiptap)                 │  │  Priority     [ HIGH    ▾ ]  │
│  │                                     │  │  Department   [ Marketing ▾] │
│  │                                     │  │  Approval route              │
│  │                              412/2200│  │   ● Automatic (rule)        │
│  └─────────────────────────────────────┘  │     Marketing Approvers      │
│  MEDIA                                    │   ○ Choose approver          │
│  ┌────┐ ┌────┐  ┌ drag & drop or browse ┐ │  Change summary              │
│  │IMG │ │VID │  └───────────────────────┘ │  [ what changed…           ] │
│  └────┘ └────┘                            │                              │
└───────────────────────────────────────────┴──────────────────────────────┘
```

### Behaviour
- **Autosave** every 3 seconds of idle typing and on blur, to
  `POST /posts/:id/autosave`. The status chip cycles
  `Saving… → ✓ Saved HH:MM → ⚠ Save failed — retrying`. It is never silent.
- **Draft recovery**: if the browser closed with unsaved local changes, offer
  "Restore unsaved changes from 14:22?" on reopen.
- **Unsaved changes guard** on navigate-away and tab close.
- **Media**: drag-and-drop or browse, multi-file, per-file progress bar,
  client-side pre-check for size/extension (a courtesy — the server decides),
  thumbnail as soon as processing finishes, remove, and drag-to-reorder.
  Rejections state the actual reason ("SVG files are not accepted").
- **Readiness checklist** is deterministic and rule-based: title present, body
  non-empty and within limits, every attachment `ATTACHED` and valid, approval
  route resolvable, required metadata filled. Each failing item is a link that
  focuses the offending field. There is no content scoring, no suggestion
  engine, no automated judgement of the writing — by design.
- **Preview** opens a modal rendering the sanitized HTML exactly as the approver
  will see it, with the media gallery.
- **CHANGES_REQUESTED banner** (as drawn above) shows the reviewer's comment,
  who wrote it, when, which version it referred to, and states plainly that a
  new version is being created. A link opens the version comparison.
- **Submit** opens a confirmation dialog naming the approval route, the version
  that will be created and the SLA that will start. After success, a full-width
  `SubmissionConfirmation`:
  > **Your post has been submitted for approval.**
  > `POST-2026-000412` · Version 3 · Assigned to Jane Manager · Status:
  > Submitted · Due in 6 hours
  with actions *View post* and *Back to My Posts*.

### Responsive
Tablet: the settings column collapses into a bottom sheet opened by a
"Settings & readiness" button; the toolbar sticks to the top. Mobile: single
column, sticky action bar with Save draft / Submit, readiness shown as an
expandable summary ("4 of 5 ready").

### Accessibility
Editor toolbar is a proper toolbar widget with arrow-key navigation and
announced button states; the editor exposes a labelled `textbox`; autosave
status is an `aria-live="polite"` region; the readiness list is a real list with
`aria-invalid` on failing items; drag-and-drop always has a keyboard-reachable
file input and keyboard reordering via the item menu.

---

## 5. HERO SCREEN B — Approval Review

`/approvals/:postId`. The flow is **UNDERSTAND → COMPARE → DISCUSS → DECIDE**,
and an approver must grasp the situation in about five seconds.

### Layout (desktop ≥1280px)
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ Approvals    Introducing Kron PAM 4.0                    ‹ Prev  Next › │
│ ● IN REVIEW  ⌃ HIGH  v3  ⏱ Due in 6h  ⌛ Waiting 18h                     │
│ John Doe · Marketing · Submitted 5 Sep 08:12 · Assigned to you            │
├────────────────────────────────────────────┬─────────────────────────────┤
│ [ Preview | Compare v2 → v3 | Attachments ]│  DECISION                   │
│                                            │  Reviewing version 3        │
│  Rendered content, images, video player,   │  ┌───────────────────────┐  │
│  post metadata.                            │  │ ✓ Approve             │  │
│                                            │  │ ↩ Request changes     │  │
│  Compare tab: side-by-side (stacked on     │  │ ✕ Reject              │  │
│  narrow screens) with inline highlighting  │  └───────────────────────┘  │
│  of added / removed text and an attachment │  Comment (required for      │
│  delta list.                               │  changes and rejection)     │
│                                            │  ─────────────────────────  │
│                                            │  SLA  ▓▓▓▓▓▓▓░░░ 72%        │
│                                            │  Due 15:00 · Warning at 75% │
│                                            │  ─────────────────────────  │
│                                            │  HISTORY                    │
│                                            │  ● v3 submitted 08:12       │
│                                            │  ● Changes requested v2     │
│                                            │    Jane M. — "Tighten…"     │
│                                            │  ● v2 submitted 4 Sep       │
│                                            │  ● v1 submitted 3 Sep       │
│                                            │  ─────────────────────────  │
│                                            │  COMMENTS (2)               │
└────────────────────────────────────────────┴─────────────────────────────┘
```

The header line is the five-second summary: status, priority, version, SLA,
waiting time, creator, department, submission time, assignee.

### Version comparison
- Default tab when a previous version exists.
- Text: word-level diff over the extracted plain text, rendered as
  additions (green, underlined) and removals (red, struck through) — with a
  legend, because colour alone is not a signal.
- Attachments: added / removed / reordered, each with a thumbnail.
- Metadata changes (title, priority, department) listed above the body diff.
- A version selector allows comparing any two versions, defaulting to
  "previous → current".

### Decision panel
- **Sticky** on scroll; on mobile it is a bottom sheet whose collapsed state
  still shows the three actions.
- Every action opens a confirmation that restates the version:
  *"Approve version 3 of POST-2026-000412? This approval will reference version
  3 only."*
- Approve: optional comment. Request changes: comment mandatory, minimum length
  enforced. Reject: reason mandatory.
- Buttons are disabled with an explanatory tooltip when the viewer is not the
  assignee, is the creator, or the post has already been decided.
- **Concurrency**: the screen polls the post's `lockVersion`/status; if either
  moves, a banner appears — *"This post changed while you were reviewing.
  Reload to see version 4."* — and the decision buttons disable. A stale
  decision that slips through is refused server-side with `ALREADY_DECIDED`.
- **Keyboard**: `A` approve, `C` request changes, `R` reject, `J`/`K` previous
  and next queue item, `?` shortcut help. Each opens the confirmation dialog —
  no shortcut ever decides directly.
- After a decision, an inline result replaces the panel:
  > **APPROVED** · Version 3 · Approved by Jane Manager · 5 Sep 2026 09:41
  with *Next in queue* as the primary action.

The word "AI" appears nowhere on this screen, in any status, label or tooltip.

---

## 6. Other screens

### Dashboard (role-aware)
- **Employee**: stat cards (Drafts, Pending approval, Changes requested,
  Approved, Rejected), a recent-activity timeline, and a prominent *Create post*
  action. Empty state for a brand-new user explains the flow in one sentence.
- **Approver**: Pending approvals, Due soon, Overdue, Recently completed, and an
  SLA compliance summary; the first card links straight into the queue filtered
  the same way.
- **Admin**: users total/active, content volume over time, pending and overdue
  approvals, average approval time, and health tiles for database, storage,
  worker and email — each linking to the relevant admin page.

### My Posts `/posts`
Tabs All / Drafts / Pending approval / Changes requested / Approved / Rejected /
Archived, over a `DataTable` (TanStack Table) with search, filters (status,
priority, department, date range), sorting, pagination and column visibility.
Columns: Title · Status · Priority · Version · Submitted · Approver · SLA ·
Last updated · Actions.
Row actions follow state: DRAFT → Edit, Submit, Delete; CHANGES_REQUESTED →
Edit, View feedback, Resubmit; SUBMITTED/IN_REVIEW → View; APPROVED → View,
Duplicate; REJECTED → View, Duplicate.

### Post Details `/posts/:id`
Tabs Overview · Preview · Versions · Approval history · Comments · Activity.
The overview states creator, department, status, priority, current version,
approved version, approver, timestamps and SLA. When current ≠ approved, that
difference is called out explicitly rather than implied.

### Approval Queue `/approvals`
Same table machinery, default sort by due date ascending, with quick filters
Overdue / Due today / Unassigned / My group, and bulk **assign** (never bulk
approve — approval is always one deliberate decision on one version).

### Notifications `/notifications`
Tabs All / Unread / Mentions; grouped by day; each row links to the entity and
marks itself read; "Mark all as read"; preferences for in-app and email per
notification type.

### Reports `/reports`
Filter bar (date range, department, priority, creator, approver) over a set of
report cards with a table and chart each: submitted / approved / rejected /
changes requested volume, average approval time, SLA compliance, overdue
approvals, volume over time, breakdowns by department, creator and approver, and
rejection reasons. Every report exports to CSV. Charts are rendered locally, are
readable in greyscale, and always accompany a data table — never a chart alone.

### Administration `/admin`
Sections: Users · Roles · Groups · Departments · Approval rules · Workflow ·
SLA policies · Email configuration · Email templates · Notifications ·
Retention · Background jobs · Audit logs · System settings.
Consistent pattern: list → detail drawer → form with Zod validation → confirm →
toast. Approval rules include a "test this rule" preview that shows which route
a hypothetical post would take. Retention always defaults to **dry run** and
shows what *would* be deleted before anything is. Audit logs are read-only, with
no edit or delete affordance anywhere in the UI.

---

## 7. States, feedback, and errors

- **Loading**: skeletons that match the final layout, never a centred spinner on
  a full page. Route-level `loading.tsx` for each section.
- **Empty**: icon, one-line explanation, and the action that resolves it
  ("No posts yet — create your first post").
- **Error**: what happened, what to do, and a Retry action. `traceId` shown in
  small type so a user can quote it to support. No stack traces, no SQL.
- **Toasts** for successful mutations, top-right, auto-dismiss 5s, with Undo
  where an undo genuinely exists.
- **Confirmations** for submit, approve, request changes, reject, delete,
  disable user, retention run, and session revocation.

---

## 8. Responsive behaviour

| Breakpoint | Behaviour |
| --- | --- |
| ≥1280px | Full two-column hero layouts, persistent sidebar |
| 1024–1279px | Sidebar collapses to icons; hero right column narrows |
| 768–1023px (tablet) | Single column; editor settings and review decision move to bottom sheets; tables scroll horizontally with a pinned first column |
| <768px (mobile) | Drawer navigation; tables become card lists; **decision actions stay reachable in a sticky bar** with a confirmation step that prevents accidental approval |

Approval Review on a phone is treated as a first-class case, not a fallback:
the header summary, the content, the diff and the three decisions must all work
with one thumb.

---

## 9. Accessibility — target WCAG 2.2 AA

- Full keyboard operability; visible, high-contrast focus rings everywhere.
- Semantic landmarks (`header`, `nav`, `main`, `aside`), one `h1` per page, no
  heading-level skips.
- Radix primitives supply correct dialog, menu, tab and tooltip semantics with
  focus trapping and restoration.
- Every input has a real `<label>`; errors are tied via `aria-describedby` and
  `aria-invalid`.
- Live regions for autosave status, toasts, upload progress and decision
  results.
- Status is never colour-only — icon and text accompany every badge.
- Contrast checked in both themes; target sizes ≥24×24px; no motion-only
  feedback, and animation respects `prefers-reduced-motion`.
- Automated axe checks run in the Playwright suite on the shell, both hero
  screens, the queue and the tables.

---

## 10. Content and tone

Plain, calm, specific. "Submit for approval", not "Send it off!".
Errors say what to do next. Turkish localisation is not in scope for the first
release, but all user-facing strings live in a single module so it can be added
without touching components.

---

## 11. References

- shadcn/ui — https://ui.shadcn.com/docs
- Radix UI primitives — https://www.radix-ui.com/primitives/docs/overview/introduction
- Tailwind CSS — https://tailwindcss.com/docs
- Lucide icons — https://lucide.dev/
- Tiptap — https://tiptap.dev/docs/editor/getting-started/overview
- TanStack Table — https://tanstack.com/table/latest/docs/introduction
- WCAG 2.2 — https://www.w3.org/TR/WCAG22/
- WAI-ARIA Authoring Practices — https://www.w3.org/WAI/ARIA/apg/
- axe-core — https://github.com/dequelabs/axe-core
