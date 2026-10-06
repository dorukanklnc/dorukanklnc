# Design system

> Status: implemented in `@repo/ui` (tokens and primitives) and `apps/web/src/components`
> (application patterns). This document is the reference for new screens; when code and document
> disagree, fix one of them in the same change.

## 1. Principles

1. **Calm density.** Staff spend whole days in the product. Default text is 13 px, tables are
   compact, and whitespace separates groups rather than padding every element.
2. **Color carries meaning.** Neutrals do the structure; the single brand accent marks the primary
   action and selection; status colors appear only when they say something (overdue, paid,
   reversed). Nothing is colored for decoration.
3. **Numbers first.** Amounts, counts and dates are what users compare: tabular figures, right
   alignment, exact formatting, no rounding surprises.
4. **Every state is designed.** Loading, empty, error, no access and not found are part of the
   screen, not afterthoughts.
5. **Hide what you cannot use.** Navigation, actions and tabs the member is not permitted to use
   are not rendered, rather than shown disabled. The server is still the authority; hiding is a UX
   decision, not a security control.
6. **Turkish first, never Turkish only.** Every string lives in a message catalog; layouts
   tolerate longer English or German labels.

## 2. Tokens

Tokens are CSS custom properties declared with Tailwind 4 `@theme` in
`packages/ui/src/styles/tokens.css`, so every token is also a utility class (`bg-surface`,
`text-fg-muted`, `border-line`, `shadow-sm`, `rounded-md` …).

Two layers:

- **Palette** (`--color-gray-*`, `--color-brand-*`): raw values. Components do not use them
  directly, except the brand ramp for charts and selection.
- **Semantic** (`--color-surface`, `--color-fg-muted`, `--color-primary`, `--color-danger-bg` …):
  what components use. A tenant brand color or a dark theme becomes an override of the semantic
  layer only (planned, §14).

### 2.1 Color semantics

| Token group                                                     | Use                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `canvas`                                                        | Page background behind panels                                                 |
| `surface`, `surface-muted`, `surface-hover`, `surface-selected` | Panels, table headers, hover rows, selected items                             |
| `sidebar`                                                       | Navigation rail                                                               |
| `line`, `line-strong`, `line-subtle`                            | Panel borders, input borders, row dividers                                    |
| `fg`, `fg-muted`, `fg-subtle`, `fg-inverse`                     | Primary text, secondary text, hints and placeholders, text on solid fills     |
| `primary`, `primary-hover`, `primary-subtle(-fg)`, `ring`       | The one primary action per view, links, selection, focus ring                 |
| `success-*`                                                     | Paid, completed, active                                                       |
| `warning-*`                                                     | Partially paid, needs attention soon, withdrawn                               |
| `danger-*`                                                      | Overdue, reversed, destructive actions, errors                                |
| `info-*`                                                        | Neutral information, pending online payment, graduated                        |
| `neutral-*`                                                     | Open, cancelled, archived, inactive                                           |
| `chart-1…3`                                                     | Sequential series (brand ramp); status colors only for meaning-bearing series |

Each status group has four tokens: solid (`danger`, icons and bars), `-bg` (badge fill), `-fg`
(text on the fill) and `-border`. Text tokens (`fg`, `fg-muted`, `fg-subtle`, `-fg` on their
fills, white on `primary`/`danger`) reach at least 4.5:1 on every surface they are used on; solid
status colors are for icons and bars (3:1 non-text contrast), not for text.

### 2.2 Typography

- **IBM Plex Sans** (variable) for UI and **IBM Plex Mono** for codes and identifiers, both
  self-hosted through Fontsource — no requests to third-party font servers (privacy, CSP).
- Scale (rem at a 16 px root): `2xs` 11 px · `xs` 12 · **`sm` 13 (UI default)** · `base` 14
  (reading text) · `md` 16 · `lg` 18 · `xl` 22 (page titles) · `2xl` 28 (KPI values).
- Weights: 400 body, 500 labels and table headers, 600 titles and KPI values. No bold paragraphs.
- `.tabular` enables tabular figures; use it for every amount, count and date column. The `Money`
  component applies it automatically.

### 2.3 Shape, depth, motion

- Radius: `xs` 3 px (badges), `sm` 4, `md` 6 (inputs, buttons), `lg` 8 (panels, menus), `xl` 12
  (dialogs).
- Shadows: `xs` on buttons and inputs, `sm` on panels, `md` on menus and popovers, `lg` on dialogs
  and sheets. Borders, not shadows, separate content inside a panel.
- Motion: 140–200 ms with `--ease-standard`; fades and short slides only. `prefers-reduced-motion`
  disables animation globally.
- Icons: `lucide-react`, 16 px (`size-4`) in controls, stroke icons only; icons accompany labels
  and are never the only carrier of meaning (icon-only buttons have an accessible label from the
  catalog).

## 3. Layout

- **App shell** (`components/shell`): collapsible sidebar (state remembered in the
  `sidebar_collapsed` cookie, so the server renders the right width), top bar with the search
  trigger, organization switcher and user menu. Below the `lg` breakpoint the sidebar becomes a
  left sheet. A "skip to content" link targets `<main id="main">`.
- **Page header** (`PageHeader`): optional breadcrumb, a title (`text-xl`, one per page, the
  `<h1>`), one line of supporting text, metadata badges and the actions on the right — at most one
  primary button.
- **Panels** (`Panel`, `PanelHeader`, `PanelBody`) group related content on the canvas. Dashboards
  use a responsive grid of panels; detail pages use tabs (`Tabs`) whose state is in the URL
  (`?tab=finance`), so links and the back button work.
- Content width is fluid; forms in sheets and dialogs have fixed maximum widths (§7).
- Print: the shell hides itself (`print:hidden`), so receipts and lists print cleanly.

## 4. Component inventory

**Primitives (`@repo/ui`)** — built on Radix primitives, styled with tokens:

| Component                                                                           | Notes                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                            | Variants `primary`, `secondary` (default), `ghost`, `subtle`, `danger`, `danger-ghost`, `link`; sizes `xs`–`lg`, `icon`, `icon-sm`; `loading` shows a spinner and disables; `asChild` for links |
| `Badge`                                                                             | Tones `neutral`, `info`, `success`, `warning`, `danger`; optional status dot                                                                                                                    |
| `Input`, `SearchInput`, `Select`, `Textarea`, `Checkbox`                            | Native elements where possible (mobile keyboards, autofill, accessibility)                                                                                                                      |
| `Field`                                                                             | Label, hint, error and required/optional marker wired with `aria-describedby`                                                                                                                   |
| `Dialog`                                                                            | Sizes `sm`, `md`, `lg`; header, body, footer slots                                                                                                                                              |
| `Sheet`                                                                             | Side panel, `right` (default) or `left`; sizes `sm` 280 px, `md` 480, `lg` 600, `xl` 760                                                                                                        |
| `DropdownMenu`, `Popover`, `Tooltip`, `Tabs`                                        | Radix behavior (focus management, keyboard, dismissal)                                                                                                                                          |
| `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`, `TableContainer`                       | Styling only; behavior lives in `DataTable`                                                                                                                                                     |
| `Panel*`, `Stat`, `EmptyState`, `Skeleton`, `Avatar`, `Kbd`, `Separator`, `Spinner` | Layout and display helpers                                                                                                                                                                      |

**Application patterns (`apps/web/src/components`)**: `DataTable` and `filters`, `states`
(`QueryContent`, `ErrorState`, `ForbiddenState`, `NotFoundState`, `PanelSkeleton`), `PageHeader`,
`Money`, `DescriptionList`, `ConfirmDialog`, `form-bits` (`PasswordInput`, `Alert`, `AuthCard`),
and the shell with the command palette.

## 5. Tables

`DataTable` (TanStack Table) is the standard for every list.

- **Server-side** pagination, sorting and filtering. Page, page size, sort and filters live in the
  URL (`useListParams`), so a filtered list can be bookmarked or shared and survives reloads.
- Sortable columns declare `meta.sortKey`; the header shows the direction and announces it.
- **Column picker** for optional columns; the choice is remembered per table (`tableId`) in local
  storage. Columns with `meta.required` cannot be hidden.
- **Numbers** right-aligned (`meta.align: 'right'`) with tabular figures; amounts with `Money`;
  zero amounts may be muted (`muteZero`). Calendar dates are shown in the short Turkish format;
  instants in the organization's time zone.
- **Row navigation** via `rowHref`: clicking a row opens the record and ⌘/Ctrl-click opens it in a
  new tab; clicks on links, buttons or selected text are left alone. The primary cell is also a
  real link, so keyboard, screen-reader and middle-click users get standard link behavior.
- **States**: skeleton rows while loading, a quiet "refreshing" indicator when refetching with data
  on screen (no layout jump), an empty state that says what to do next, and an error state with a
  retry button and the request id.
- Search inputs are debounced and accent/case-insensitive for Turkish ("isik" finds "Işık").
- Pagination shows the total count and page; page size is selectable where lists are long.

## 6. Forms

- React Hook Form with Zod schemas shared from `@repo/contracts`, so client and server validate
  with the same rules. Zod messages are localized (`z.locales.tr`); field-specific messages come
  from the catalog.
- Server validation errors (`VALIDATION_FAILED` with `fieldErrors`) are mapped back onto the fields
  (`useApplyFieldErrors`); other errors appear in an `Alert` at the top of the form with the request
  id.
- Labels above inputs (`Field`). Required fields show an asterisk (visual only; the control
  carries `aria-required`); optional fields may say "isteğe bağlı" where the distinction matters.
- **Money input** (`MoneyInput`): accepts `12.500`, `12500,50`, `12.500,50`; normalizes to the
  locale format on blur; converts to minor units with string arithmetic (never floating point).
  Percentages are entered as `10` or `12,5` and stored as basis points.
- The submit button shows `loading` and is disabled while the request runs; edit forms keep "Save"
  disabled until something changed. Recording a payment also sends an idempotency key, so a retry
  after a timeout can never record it twice.
- After success: close the sheet or dialog, show a short toast ("Tahsilat kaydedildi · TAH-2026-000124"),
  and refresh affected queries (balances, lists, dashboard).
- Destructive or irreversible actions (archiving a student, suspending a member, deleting a role,
  signing out everywhere) ask for confirmation with a button that repeats the specific verb, never
  "Tamam". Reversing a payment additionally requires a reason, which is stored and audited.

## 7. Sheets, dialogs or pages

| Use a…     | When                                                                | Examples                                                                               |
| ---------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Page**   | The object has its own identity, URL and several sections           | Student profile, payment receipt, collections dashboard                                |
| **Sheet**  | Creating or editing a record with many fields while keeping context | New student, edit student, payment plan wizard, role editor, member access, new branch |
| **Dialog** | A focused action with few inputs, or a confirmation                 | Record payment, add charge, payment link, reverse payment, confirmations               |

Sheets slide in from the right (navigation uses the left sheet on mobile); dialogs are centered.
Both trap focus, close on <kbd>Esc</kbd> and return focus to the trigger. A "discard unsaved
changes?" guard for dirty forms is planned.

## 8. Feedback and states

| State           | Pattern                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| Loading         | Skeletons shaped like the content; spinners only inside buttons                              |
| Refreshing      | Keep the current data visible; subtle indicator                                              |
| Empty           | `EmptyState`: what is missing and the next action ("İlk öğrenciyi ekleyin")                  |
| No results      | Explains that filters hide results, offers "Filtreleri temizle"                              |
| Error           | `ErrorState`/`QueryError`: plain-language message, "Tekrar dene", the request id for support |
| No access       | `ForbiddenState`: neutral wording, no hint about what exists behind the page                 |
| Not found       | `NotFoundState`; also used for records of other tenants or outside the member's scope        |
| Success         | Toast (sonner) for completed actions; never for errors that need reading                     |
| Offline/network | `NETWORK_ERROR` message ("Sunucuya ulaşılamadı")                                             |

Unexpected client errors are caught by route error boundaries with a retry; stack traces are never
shown.

## 9. Navigation and search

- Sidebar groups: Genel, Öğrenci işlemleri, Finans, Yönetim, Platform. Items and empty groups the
  member cannot use are not rendered (`visibleNavigation`); the active item is the longest
  matching prefix.
- **Command palette** (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>, or the search field in the top
  bar): pages and quick actions the member is permitted to use, recent records (per user and
  organization, kept in session storage, cleared on sign-out), and server search across students,
  guardians and receipts — only within the member's scope. Picking "Tahsilat al" asks for the
  student first, then opens the payment dialog on the student's finance tab.
- Organization switching and sign-out perform a full page load, so no cached data of the previous
  organization survives in memory.

## 10. Data display

- **Money**: always from minor units, `Intl.NumberFormat` with the currency (`₺12.500,00`). KPI
  cards show exact amounts; the compact form (`₺1,2 Mn`) is reserved for chart axes. Overpayments
  appear as a separate, labelled amount ("Hesap alacağı"), never as a negative balance.
- **Dates**: calendar dates (due dates, birth dates) are never shifted by time zones; instants
  (recorded at, audit entries) are shown in the organization's time zone, with relative time
  ("3 dk önce") only where recency matters, and the absolute value in a tooltip.
- **Status badges** map one status to one tone everywhere:

  | Domain       | Status → tone                                                                                             |
  | ------------ | --------------------------------------------------------------------------------------------------------- |
  | Receivable   | paid → success · partially paid → warning · overdue → danger (dot) · open → neutral · cancelled → neutral |
  | Payment      | completed → success · reversed → danger                                                                   |
  | Payment link | succeeded → success · created → info · other → neutral                                                    |
  | Student      | active → success · graduated → info · withdrawn → warning · inactive, transferred, archived → neutral     |

- **Personal data**: national IDs are masked by default and revealed only through an explicit,
  audited action by members with the permission.

## 11. Accessibility

Target: WCAG 2.2 AA.

- Semantic HTML first (`button`, `a`, `table`, `nav`, headings in order), Radix primitives for
  menus, dialogs, tabs and tooltips.
- Visible focus everywhere (`:focus-visible` ring); no focus traps outside modals; skip link.
- Every icon-only control has an `aria-label` from the catalog; decorative icons are
  `aria-hidden`.
- Color is never the only signal: badges have text, overdue rows have a label, charts have values.
- Form errors are linked to their fields (`aria-describedby`, `aria-invalid`) and announced
  (`role="alert"`); on submit the first invalid field receives focus.
- Controls are at least 24 px high; layouts are built for widths from 360 px and for 200 % zoom.
- Reduced motion respected globally.
- Not yet done: an automated accessibility check (axe) in the end-to-end suite and a manual
  screen-reader pass; input borders are lighter than the 3:1 non-text contrast guideline and rely
  on labels and focus styles.

## 12. Internationalization

- `next-intl` with ICU messages in `apps/web/messages/{tr,en}.json`. Turkish is the default; the
  language is stored in a cookie and switched from the user menu. A unit test enforces identical
  keys and ICU arguments across locales and that every API error code and permission has a label.
- No string concatenation for sentences; use ICU arguments, plurals and selects.
- Keys are nested objects (next-intl does not allow dots inside keys); dynamic labels (permission
  keys, audit actions) are looked up with the `useDynamicLabel` helpers.
- Formatting only through `useFormat()` (money, numbers, dates, relative time) with the
  organization's currency and time zone.
- Turkish casing rules: use locale-aware `toLocaleUpperCase('tr')`/`toLocaleLowerCase('tr')`
  (`i → İ`, `ı → I`); search folds Turkish characters on both client and server.
- The API never sends user-facing prose for errors; it sends stable codes that the client
  translates. E-mails are rendered on the server in the user's language (the organization's
  language for invitations, since the invitee may not have an account yet).

## 13. Writing guidelines (Turkish UI)

- Address users with "siz"; polite, short and direct. No exclamation marks, no jargon
  ("Tahsilat kaydedildi", not "İşlem başarıyla gerçekleştirilmiştir!").
- **Buttons are verbs** describing the result: "Tahsilat al", "Ödeme planı oluştur", "Daveti
  gönder". Confirmation buttons repeat the verb; "Vazgeç" cancels.
- Sentence case for titles and labels ("Ödeme planı", not "Ödeme Planı").
- Domain vocabulary is consistent: _tahsilat_ (payment received), _taksit_ (installment), _ücret_
  (charge), _vade_ (due date), _vadesi geçmiş_ (overdue), _makbuz_ (receipt), _ters kayıt_
  (reversal), _hesap alacağı_ (credit), _şube_ (branch), _kurum_ (organization), _veli_ (guardian).
- Error messages say what happened and what to do next; they never blame the user and never reveal
  whether an e-mail address or a record exists.
- Avoid putting the product name in sentences where Turkish suffixes would attach to it (the name
  is temporary; vowel harmony would break on rename).
- Numbers and dates are never written into catalog strings by hand; pass them as formatted
  arguments.

## 14. Branding and renaming

"CampusOS" is a working codename. User-visible occurrences are centralized:

| Where                                                                 | What to change                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/web/messages/*.json` → `app.name`                               | Name in the UI, page titles and metadata                                               |
| `apps/api/src/platform/brand.ts` → `PRODUCT_NAME`                     | E-mail subjects and bodies, OpenAPI title, default `MAIL_FROM`                         |
| `apps/web/src/components/brand.tsx`, `app/icon.svg`                   | Logo mark and favicon                                                                  |
| `packages/ui/src/styles/tokens.css` → brand ramp and `primary` tokens | Brand color                                                                            |
| `.env` → `MAIL_FROM`                                                  | Sender address per environment                                                         |
| `apps/api/src/platform/http/problem-details.filter.ts`                | Problem `type` URIs use a placeholder documentation domain; point them at the real one |

Internal identifiers (`campusos` package and Compose project names, database name, local-storage
key prefixes, Postgres `application_name`s, `*.test` demo e-mail domains) are not user-visible and
can stay or be renamed mechanically later.

**Planned:** per-tenant branding (logo and accent color on the semantic layer, contrast-checked)
and a dark theme as a second set of semantic tokens.
