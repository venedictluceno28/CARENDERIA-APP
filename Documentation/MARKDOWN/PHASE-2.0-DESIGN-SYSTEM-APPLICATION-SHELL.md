# CARENDERIA-APP — Phase 2.0

## Design System & Real Application Shell

## 1. Purpose

Phase 2.0 establishes the mobile-first visual language and application structure that later customer and admin features will use. It replaces the temporary Phase 1.3 screens with a real customer shell, branded admin login, protected admin action shell, and a compact shared component system.

The Phase 1 backend contracts remain unchanged. No schema, Edge Function, Storage, authentication, checkout, messaging, or business-rule implementation was expanded in this phase.

## 2. Design Principles

- Glassmorphism provides atmosphere and hierarchy; it is not the product purpose.
- Content, prices, touch clarity, and readable actions take priority over decoration.
- Critical actions use solid, high-contrast fills.
- Mobile is the source layout. Wider screens add space and columns without changing the task model.
- Admin controls are large and explicit for a non-technical owner using a phone.
- Motion is brief, optional, and removed when the operating system requests reduced motion.
- Unimplemented features are clearly identified and are not wired to fake behavior.

## 3. Target Users

The customer shell is optimized for guest customers who want to see food and delivery information quickly on a phone. It keeps the eventual menu, cart, and message regions easy to find without requiring an account.

The admin shell is optimized for a store owner using a phone during daily operations. It presents the seven confirmed modules as large, labeled actions rather than a dense desktop sidebar or icon-only dashboard.

## 4. Visual Direction

The primary atmosphere moves from deep navy through royal blue and violet, with cyan used as a controlled highlight. Light customer surfaces preserve a friendly food-ordering tone. The admin shell uses a darker version of the same system to distinguish the private workspace without creating a separate visual language.

No animated background, neon glow system, parallax, or nested full-page blur was introduced.

## 5. Color Tokens

Central semantic CSS variables live in `src/styles/index.css`:

- `--background`, `--foreground`
- `--surface`, `--surface-elevated`
- `--glass`, `--glass-subtle`, `--glass-strong`, `--glass-border`
- `--primary`, `--primary-hover`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`, `--accent`, `--accent-soft`
- `--destructive`, `--muted`, `--muted-foreground`
- `--success`, `--warning`, `--info` and their soft surface colors
- `--border`, `--input`, `--ring`

Feature components consume semantic classes instead of scattering palette values.

## 6. Gradient and Background System

Three centralized gradients define the shell:

- `--gradient-page`: quiet blue/violet/cyan customer atmosphere.
- `--gradient-brand`: stronger brand surface for promotional or identity areas.
- `--gradient-admin`: deep blue-to-violet private workspace background.

Two fixed ambient color fields add depth behind content. They are non-animated, low-opacity, non-interactive, and clipped by the application background.

## 7. Glassmorphism System

`GlassSurface` exposes only three variants:

- `default`: primary cards and sections.
- `subtle`: supporting content and preferences.
- `strong`: login and modal surfaces that require greater separation.

The system controls translucency, border, shadow, and blur in one place. A no-`backdrop-filter` fallback supplies opaque surfaces. Critical buttons remain solid. Blur is not nested inside menu/action cards on the customer shell.

## 8. Typography

The font stack uses the local system UI stack, avoiding webfont download cost while retaining strong Android, Filipino/English, price, and numeral legibility.

The restrained type roles are:

- Display/customer hero
- Page heading
- Section heading
- Body
- Supporting text
- Form label
- Small metadata/eyebrow
- Price emphasis with tabular numerals

Headings use tighter tracking while body text retains comfortable line height. Text may wrap safely and is not truncated in transactional content.

## 9. Font-Size Preference Support

`FontPreferenceProvider` supports exactly three choices: Normal, Large, and Extra large. The chosen value updates `data-font-size` on the root element and is persisted in `localStorage` under `tindahan.font-size.v1`.

Storage failure falls back safely and does not block the app. The control is present in the admin shell and the component showcase. Backend `store_settings` synchronization is intentionally deferred until the Settings UI phase; the current preference is device-local and documented as such.

## 10. Spacing and Layout

Central spacing, radius, shadow, control-height, touch-target, page-gutter, and content-width tokens are defined with CSS variables. `PageContainer` supplies consistent responsive gutters and a maximum readable width. Layouts use `minmax(0, 1fr)` where needed to permit safe wrapping.

The shell uses `100dvh`/`100svh` where viewport height matters and safe-area environment values around top bars, sticky actions, footers, dialogs, and bottom controls.

## 11. Touch Targets

The shared minimum is 48 CSS pixels (`3rem`). Large actions are 56 CSS pixels. Icon buttons retain a 48-by-48 hit area and require an accessible label. Admin module actions are substantially taller than the minimum and retain their text labels.

Important behavior does not depend on hover.

## 12. Buttons

`Button` supports:

- Primary
- Secondary
- Destructive
- Ghost
- Glass
- Default, large, and icon sizing
- Loading, disabled, active, hover, and visible focus states
- Leading/trailing icons

Primary actions use the high-contrast brand gradient. The loading state preserves the label and exposes `aria-busy`.

## 13. Forms

Shared form presentation includes:

- `Field` with label, helper text, and safe validation message
- `Input` for text, password, number, and money presentation
- `Textarea`
- Native `Select`
- `ChoiceCard` for radio and checkbox decisions

Inputs have readable opaque backgrounds, 48-pixel minimum height, visible focus, disabled and invalid states, and mobile-friendly native behavior. React Hook Form remains the form-state layer; the admin login continues to use it without changing its authentication contract.

The showcase demonstrates an accessible four-option delivery-area selector suitable for Marycris Complex, Wellington Place, Elliston Place, and outside areas. Delivery calculations remain outside the design component.

## 14. Cards and Surfaces

`Card`, `GlassSurface`, and representative compositions support later menu items, order summaries, admin actions, messages, statistics, and settings groups. The Phase 2.0 showcase demonstrates structure only; it does not introduce final feature behavior.

The customer shell gives the future food/menu region clear visual priority while leaving its current state explicitly empty.

## 15. Dialog and Mobile Overlay Behavior

`Dialog` uses the native HTML dialog element for modal focus, Escape handling, semantics, and a real modal backdrop. It includes labeled title/description relationships, a 48-pixel close button, backdrop dismissal, scrollable content, and safe-area-aware actions.

On narrow phones the dialog becomes a bottom sheet with a full-width surface and rounded top corners. On larger screens it becomes a centered modal. An exact 390-pixel Chrome emulation confirmed the bottom-sheet layout with no horizontal overflow.

## 16. Status System

`Badge` provides semantic variants for:

- Available
- SOLD OUT
- Verified
- Not verified
- Cancelled
- FREE Delivery
- Cash
- Online payment
- General information

Each badge pairs color with text and an icon, so status is not communicated by color alone.

## 17. Money and Delivery Display

`formatPeso` accepts integer centavos and produces a compact Philippine peso value. Whole-peso amounts omit unnecessary `.00`; meaningful centavos remain visible. `formatDeliveryCharge` renders zero as `FREE Delivery` and nonzero values as a peso delivery amount.

These utilities format already-authoritative values only. They do not calculate customer delivery fees or expose Internal DF.

## 18. Loading, Empty, and Error States

The shared feedback layer provides:

- `Skeleton` for known content shapes
- `LoadingState` for simple page/section progress
- Inline button loading
- `EmptyState` with optional action
- `ErrorState` with an optional retry action
- Form-level and recoverable alert presentation

Raw backend/database errors are not rendered. Existing safe API error contracts remain the frontend boundary.

## 19. Customer Shell

The public `/` route now contains:

- Configurable-ready store identity with a neutral `Tindahan` fallback
- Default store-logo placeholder
- Future cart/message access region
- Clear guest-ordering introduction
- High-contrast menu call to action
- Menu content region with an honest empty/preparation state
- Delivery/support trust cues
- Owner-login link outside the primary customer flow

No ordering, cart, address, checkout, receipt, or messaging behavior was implemented.

## 20. Admin Shell

The protected `/admin` route retains the Phase 1.3 `AdminRouteGuard` and active-admin profile verification. The real shell now includes:

- Store/admin header
- Clearly labeled logout control
- Admin display name and account context
- Large phone-friendly actions for all seven confirmed modules
- Readability/font-size control
- Responsive single-, two-, and three-column layouts
- Safe-area bottom spacing

Modules are currently disabled and labeled “Coming in a future phase.” No incomplete module behavior is exposed.

## 21. Admin Login Integration

`/admin/login` keeps the existing email/password Supabase sign-in behavior and public-signup prohibition. It now uses the shared identity, form, button, alert, icon, glass, and background systems. Configuration and credential errors remain sanitized. No forgot-password or signup flow was added.

## 22. Logo and Store Identity

`StoreIdentity` accepts a future configured store name and currently uses the neutral fallback `Tindahan`. The logo placeholder is a simple store glyph in the brand gradient; it is not presented as a permanent identity and can later be replaced with a configured private/public logo policy.

## 23. Responsive and Mobile Rules

- Narrow phones are a single readable column.
- Customer actions stack at phone widths and become inline when space allows.
- At the smallest breakpoint, a secondary future header action is removed to protect the store identity and cart touch target.
- Admin modules remain a large vertical list on phones and expand to columns only when content fits.
- Desktop adds whitespace and composition without introducing a different navigation model.
- Sticky bottom actions use safe-area padding and are demonstrated only in the internal showcase.

## 24. Accessibility

Implemented basics include:

- Semantic landmarks, headings, fields, buttons, links, fieldsets, and dialog
- Associated form labels and described validation errors
- Visible high-contrast focus rings
- 48-pixel minimum touch targets
- Text/icon/shape status redundancy
- Readable foreground/surface contrast
- Reduced-motion support
- Native control and dialog behavior
- No hover-only action
- Larger root-font preference
- No raw user HTML rendering

Automated color-contrast tooling is not installed in this phase; contrast was reviewed against the rendered primary surfaces. A browser accessibility/E2E suite is recommended once real customer controls are present.

## 25. Performance Considerations

- No webfont or new component-library dependency was added.
- Background fields are static rather than animated.
- Blur is limited to top-level glass surfaces, the sticky header/action area, and modal backdrop.
- Lower-cost opaque fallbacks apply when backdrop filtering is unsupported.
- Development-only showcase routes are removed by the production `import.meta.env.DEV` condition.

## 26. Components Created or Changed

Shared UI:

- `Badge`
- `Button`
- `Dialog`
- `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`
- `Field`, `Input`, `Textarea`, `Select`, `ChoiceCard`
- `Icon`
- `Card`, `GlassSurface`, `SectionHeading`

Shared layout and utilities:

- `AppBackground`, `PageContainer`, `MobileStickyAction`
- `AppHeader`, `StoreIdentity`
- `FontPreferenceProvider`, `FontSizeControl`
- `formatPeso`, `formatDeliveryCharge`

Feature UI changed:

- `AdminLoginPage`
- `AdminRouteGuard` states
- `AdminShellPage`

## 27. Routes and Shell Changes

| Route              | Status           | Purpose                            |
| ------------------ | ---------------- | ---------------------------------- |
| `/`                | Public           | Real customer application shell    |
| `/admin/login`     | Public           | Admin email/password login         |
| `/admin`           | Protected        | Real admin structural shell        |
| `/__design-system` | Development only | Internal component showcase        |
| `/__admin-shell`   | Development only | Guard-free visual shell inspection |

Unknown production paths continue to redirect to `/`. Auth session restoration and database-backed active-admin authorization remain unchanged.

## 28. Visual Review

Rendered pages were captured with local Vite and headless Chrome. Chrome DevTools mobile emulation was used for exact CSS viewport checks rather than relying on the host display scale.

Reviewed widths:

- 320px public shell
- 360px public shell
- 390px public shell, admin login, admin shell, showcase, and open dialog
- 430px public shell
- 1440px public shell, admin login, and admin shell

The first screenshot pass exposed crowded 320-pixel header actions. The smallest breakpoint was corrected by keeping the primary future cart target and suppressing the secondary future message shortcut in the header; messaging remains represented in the page shell. The exact mobile-emulation rerun showed readable wrapping, intact 48-pixel controls, no visible horizontal clipping, and matching 360/390/430 content widths. The 390-pixel dialog correctly rendered as a bottom sheet. Desktop retained a restrained content width and useful whitespace.

Temporary screenshots were used for review and were not added to the repository.

## 29. Validation

Completed checks:

- ESLint: passed with no warnings
- TypeScript project build: passed
- Vite production build: passed
- Frontend Node tests: 8/8 passed
- Prettier check for `src` and frontend tests: passed
- Exact-width Chrome overflow probes: passed at 360, 390, and 430 pixels; 320-pixel body content remained within the 320-pixel target and rendered without visible clipping
- Manual rendered review: public shell, admin login, admin shell, component showcase, and mobile dialog

The new frontend tests cover peso/delivery formatting, allowed font-size values, and safe font-preference persistence failure. Existing guest-session tests continue to pass.

Backend/database/security suites were not rerun because Phase 2.0 did not change backend logic, migrations, Edge Functions, Storage, Supabase configuration, typed API behavior, or authentication behavior.

## 30. Deferred Feature UI

This phase intentionally does not implement:

- ULAM POST
- ULAM PHOTOS
- MESSAGE
- ADDRESS BOOK
- MANUAL ORDER
- TOTAL ORDERS FOR TODAY
- SETTINGS persistence/backend integration
- Customer menu ordering and cart
- Address, delivery calculation, checkout, and confirmation
- Receipt and guest messaging

Representative components are presentation contracts, not hidden partial implementations.

## 31. Phase 2.0 Checklist Result

- Mobile-first system: complete
- Approved blue/violet/cyan direction: complete
- Restrained readable glass system: complete
- Solid critical actions: complete
- Centralized semantic tokens: complete
- Readable typography and three-size preference: complete
- Appropriate touch targets: complete
- Customer shell: complete
- Protected admin shell: complete
- Design-system admin login: complete
- Existing authentication behavior/no public signup: preserved
- Neutral logo and configurable-ready store identity: complete
- Safe areas and modern mobile viewport units: complete
- Mobile dialog/bottom sheet: complete
- Accessibility foundation: complete
- Narrow/desktop rendered review: complete
- Lint, TypeScript/build, tests, and formatting: passed
- Backend contracts: unchanged
- Final business screens: not started

## 32. Recommended Next Phase

Proceed to **Phase 2.1 — Customer Menu & Cart**.

That phase should integrate the active published-menu read model into the customer shell, implement category grouping and transactional food cards, create cart state and quantity behavior, identify sold-out/expired-menu conflicts clearly, and preserve authoritative server revalidation for checkout. Address, checkout, receipt, and customer messaging should remain for Phase 2.2.
