## 0. Research Log

- **Exact reference:** `https://tweakcn.com/themes/cmdght103000n04lh3e2ae93r` (`Claude +`, theme id `cmdght103000n04lh3e2ae93r`, author Luis Llanes). Real Chrome was driven on 2026-09-01 at 375, 768, and 1280 CSS px in light and dark. The Tailwind v4 / OKLCH `index.css` export was read from the live Code dialog; runtime values and interaction states were read with `getComputedStyle`, never inferred from screenshots.
- **Source evidence:** `.omo/evidence/task-2-postpartum-medical-chat/tweakcn-export.css`, `.omo/evidence/task-2-postpartum-medical-chat/runtime-extraction.json`, and the six PNGs under `.omo/evidence/task-2-postpartum-medical-chat/screenshots/`. `tests/design/theme-contract.json` is the machine-readable parity contract.
- **Responsive finding:** the theme values do not change by width or color-scheme media query beyond the `.dark` overrides. All three widths had no document-level horizontal overflow. The reference uses a 16px page inset and progressively reveals wider navigation/content; product layout mechanics are defined in Section 4 without changing theme tokens.
- **Interaction finding:** the live outline control computes a 150ms `cubic-bezier(0.4, 0, 0.2, 1)` transition; hover uses `accent`/`accent-foreground`; keyboard focus adds a 3px, 50%-alpha `ring` halo; disabled controls use 50% opacity; the sampled active state adds no color delta beyond hover/focus.
- **Spatial reference:** StyleGallery `scroll-body-shell` (`https://github.com/changeroa/StyleGallery/blob/main/patterns/viewport-shell/scroll-body-shell.md`) was selected because the medical chat has fixed shell regions and exactly one scrolling conversation body. Its load-bearing `min-block-size: 0` and bounded dynamic-viewport shell are adopted; no StyleGallery prose or visual tokens are copied.
- **Interaction references:** beui.dev `otp-input` and `action-swap` source were read for bounded keypad error feedback, press physics, state swaps, and reduced-motion substitution. These supply mechanics only; tweakcn remains the sole palette, font, radius, spacing, and shadow source.
- **Restraint constraint:** Apple, Linear, and Stripe are named only as quality restraints from the assignment. No color, type, radius, spacing, shadow, or component token was imported from them.
- **Skipped greenfield lanes:** embedded Layer B selection, Lazyweb, and Imagen drafts are not applicable because the supplied live URL is the concrete reference contract. No product component or visual token was invented to replace it.

## 1. Atmosphere & Identity

A warm, private, clinically calm utility: cream and charcoal surfaces, muted clay interaction color, generous rounded geometry, and very shallow elevation. The signature is **quiet warmth under strict information hierarchy**—the interface should feel personal enough for family use without becoming decorative, playful, or falsely reassuring. Emergency guidance remains ordinary assistant text as required; color never dramatizes medical severity.

## 2. Color

The following declarations are the exact Tailwind v4 / OKLCH export shown by the live tweakcn Code dialog. They are immutable unless the user explicitly changes the reference. Dark mode inherits `--tracking-normal` and `--spacing` from `:root` because the source export does not repeat those two declarations.

### Exact light export

```css
:root {
  --background: oklch(0.9818 0.0054 95.0986);
  --foreground: oklch(0.3438 0.0269 95.7226);
  --card: oklch(0.9665 0.0067 97.3521);
  --card-foreground: oklch(0.1908 0.0020 106.5859);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0.2671 0.0196 98.9390);
  --primary: oklch(0.6171 0.1375 39.0427);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9245 0.0138 92.9892);
  --secondary-foreground: oklch(0.4334 0.0177 98.6048);
  --muted: oklch(0.9341 0.0153 90.2390);
  --muted-foreground: oklch(0.5341 0.0078 97.4503);
  --accent: oklch(0.9245 0.0138 92.9892);
  --accent-foreground: oklch(0.2671 0.0196 98.9390);
  --destructive: oklch(0.1908 0.0020 106.5859);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0.8847 0.0069 97.3627);
  --input: oklch(0.7621 0.0156 98.3528);
  --ring: oklch(0.6171 0.1375 39.0427);
  --chart-1: oklch(0.5583 0.1276 42.9956);
  --chart-2: oklch(0.6898 0.1581 290.4107);
  --chart-3: oklch(0.8816 0.0276 93.1280);
  --chart-4: oklch(0.8822 0.0403 298.1792);
  --chart-5: oklch(0.5608 0.1348 42.0584);
  --sidebar: oklch(0.9663 0.0080 98.8792);
  --sidebar-foreground: oklch(0.3590 0.0051 106.6524);
  --sidebar-primary: oklch(0.6171 0.1375 39.0427);
  --sidebar-primary-foreground: oklch(0.9881 0 0);
  --sidebar-accent: oklch(0.9245 0.0138 92.9892);
  --sidebar-accent-foreground: oklch(0.3250 0 0);
  --sidebar-border: oklch(0.9401 0 0);
  --sidebar-ring: oklch(0.7731 0 0);
  --font-sans: Outfit, sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: Geist Mono, ui-monospace, monospace;
  --radius: 1rem;
  --shadow-x: 0;
  --shadow-y: 1px;
  --shadow-blur: 3px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.1;
  --shadow-color: oklch(0 0 0);
  --shadow-2xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow-md: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10);
  --shadow-xl: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10);
  --shadow-2xl: 0 1px 3px 0px hsl(0 0% 0% / 0.25);
  --tracking-normal: 0em;
  --spacing: 0.25rem;
}
```

### Exact dark export

```css
.dark {
  --background: oklch(0.2679 0.0036 106.6427);
  --foreground: oklch(0.9576 0.0027 106.4494);
  --card: oklch(0.2928 0.0018 106.5092);
  --card-foreground: oklch(0.9818 0.0054 95.0986);
  --popover: oklch(0.3085 0.0035 106.6039);
  --popover-foreground: oklch(0.9211 0.0040 106.4781);
  --primary: oklch(0.6724 0.1308 38.7559);
  --primary-foreground: oklch(0.1908 0.0020 106.5859);
  --secondary: oklch(0.9818 0.0054 95.0986);
  --secondary-foreground: oklch(0.3085 0.0035 106.6039);
  --muted: oklch(0.2213 0.0038 106.7070);
  --muted-foreground: oklch(0.7713 0.0169 99.0657);
  --accent: oklch(0.2130 0.0078 95.4245);
  --accent-foreground: oklch(0.9663 0.0080 98.8792);
  --destructive: oklch(0.6368 0.2078 25.3313);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0.3618 0.0101 106.8928);
  --input: oklch(0.4336 0.0113 100.2195);
  --ring: oklch(0.6724 0.1308 38.7559);
  --chart-1: oklch(0.5583 0.1276 42.9956);
  --chart-2: oklch(0.6898 0.1581 290.4107);
  --chart-3: oklch(0.2130 0.0078 95.4245);
  --chart-4: oklch(0.3074 0.0516 289.3230);
  --chart-5: oklch(0.5608 0.1348 42.0584);
  --sidebar: oklch(0.2357 0.0024 67.7077);
  --sidebar-foreground: oklch(0.8074 0.0142 93.0137);
  --sidebar-primary: oklch(0.3250 0 0);
  --sidebar-primary-foreground: oklch(0.9881 0 0);
  --sidebar-accent: oklch(0.1680 0.0020 106.6177);
  --sidebar-accent-foreground: oklch(0.8074 0.0142 93.0137);
  --sidebar-border: oklch(0.9401 0 0);
  --sidebar-ring: oklch(0.7731 0 0);
  --font-sans: Outfit, sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: Geist Mono, ui-monospace, monospace;
  --radius: 1rem;
  --shadow-x: 0;
  --shadow-y: 1px;
  --shadow-blur: 3px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.1;
  --shadow-color: oklch(0 0 0);
  --shadow-2xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow-md: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10);
  --shadow-xl: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10);
  --shadow-2xl: 0 1px 3px 0px hsl(0 0% 0% / 0.25);
}
```

### Semantic rules and states

- Use semantic variables, never raw color literals in product code. `background` owns the app canvas; `card` owns contained surfaces; `popover` owns floating controls; `muted` and `secondary` own low-emphasis regions; `primary` is reserved for interaction except the 2px inline-start rule on the Sources disclosure and the user-requested orange assistant marker. The fixed 10px streaming marker uses `primary`, absolutely positioned in the conversation's 16px inline-start gutter beside the assistant message's first line, shown only while pending or streaming. Full-opacity `primary` retains ≥3:1 against `background`/`muted` in light and dark; the visible pulse reaches opacity 0.6 and does not retain ≥3:1 throughout. This decorative status-feedback contrast exception is paired with readable pending status or answer text and recorded in Section 8.
- Prose links use `foreground` text with a `primary` underline (`text-decoration-color`). `primary` text at body size is prohibited: it measures ≈3.5:1 on `background` in light mode, below normal-text AA.
- Default outline control: `background` + `foreground`, `border`, and `shadow-xs`.
- Hover: `accent` + `accent-foreground`; do not introduce an opacity-derived accent.
- Keyboard focus: `ring` at 50% alpha, 3px halo, with `ring` border where a border exists. Focus must remain visible in both modes.
- Active/pressed: keep hover colors. The live reference has no separate active color; press feedback is transform-only per Section 6.
- Disabled: preserve the relevant semantic colors at 50% opacity, block activation, and retain readable state text. The empty or normalizing send action is the sole exception: it is natively disabled with `muted`/`muted-foreground` at full opacity. Loading must not masquerade as disabled if cancellation remains possible.
- Error: `destructive` + `destructive-foreground`; invalid fields use `destructive` border and a 20% ring in light / 40% ring in dark, matching the live class contract.
- Charts and sidebar variables remain pinned even though this product has no planned chart/sidebar. They are part of the exact export, not authorization to add those components.
- The light `primary` / `primary-foreground` pair measures 3.90:1. Standard-size text must not use that filled pair; use outline/secondary controls or an icon with an accessible name. This preserves the palette without knowingly shipping sub-AA normal text.

## 3. Typography

### Font stacks

- **Sans:** `var(--font-sans)` = Outfit, then generic sans-serif. This is the product UI face and must be loaded with swap behavior.
- **Mono:** `var(--font-mono)` = Geist Mono, then generic ui-monospace/monospace. Reserve for machine values only; do not use for medical prose.
- **Serif:** the exported `var(--font-serif)` is retained for parity but is not used by this product.
- Maximum active families: sans plus mono. Korean glyphs that Outfit lacks fall through through the exported generic family; no unapproved Korean face is inserted ahead of that fallback.

### Extracted scale

| Role | Size / line height | Weight | Tracking | Source and use |
| --- | --- | --- | --- | --- |
| Page title | 30px / 36px | 700 | `tracking-normal` | Live theme title; lock-screen title only |
| Section title | 18px / 28px | 600 | `tracking-normal` | Live card heading; compact app headings |
| Body | 16px / 24px | 400 | `tracking-normal` | Live body computed style; medical prose and composer input |
| Control | 14px / 20px | 500 | `tracking-normal` | Live button/tab; controls that do not use the low-contrast filled primary pair |
| Metadata | 14px / 20px | 400 | `tracking-normal` | Live card metadata; source metadata and disclaimer |
| Numeric emphasis | 30px / 36px | 600 | `tracking-normal` | Extracted metric style; permitted for keypad display only, not general headings |

Medical prose stays at Body or larger and uses a readable intrinsic measure. Korean headings must be phrase-tested at 375px; never solve wrapping by shrinking body text below 14px.

## 4. Spacing & Layout

### Spacing and radius derivation

The exact base spacing is `--spacing: 0.25rem` (4px). Product spacing uses only integer multiples of that base: 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px. The live page inset is 16px at 375/768/1280 and is the app-shell inline gutter.

The exact base radius is `--radius: 1rem` (16px). Tailwind mappings from the export are: small = 12px, medium = 14px, large = 16px, extra-large = 20px. Pills may use a fully rounded intrinsic radius only for compact selectors, not every surface.

### Mobile-first shell and scroll ownership

- Adopt StyleGallery’s named **scroll-body-shell**: `header / minmax(0, 1fr) body / footer`, bounded by `100dvb`; `100dvh` is the physical CSS equivalent where logical units are unavailable.
- **The conversation body is the only primary vertical scroll owner.** It has `min-block-size: 0`, `overflow-y: auto`, and `overflow-x: clip`. The page/body, header, and composer do not independently scroll.
- Header controls remain in the auto first row; model controls belong to the composer. After the first send, the composer and persistent medical disclaimer occupy the auto footer row. In the empty state, the same composer primitive is centered inside the body; DOM order and focus order remain stable during its visual move.
- Conversation content uses a centered intrinsic content limiter near 65ch and never exceeds the available inline size. URLs and source titles use `overflow-wrap: anywhere`; primary content never scrolls horizontally.
- Safe-area padding composes with the 16px gutter at the footer. Browser sizing functions, safe-area environment values, percentages, and intrinsic keywords are layout mechanics rather than visual tokens.

### Required width behavior

| Width | Contract |
| --- | --- |
| 375px | One readable column; 16px inline gutters; controls wrap; keypad remains 3 columns; attachment previews use an overflow-safe intrinsic grid; every interactive target is at least 44x44px. |
| 768px | Same single conversation column and scroll owner; control clusters may remain on one row when content fits; no split-pane UI. |
| 1280px | Center the content limiter within the fluid shell; extra width becomes calm canvas, not extra message measure or a speculative sidebar. |

All three widths must survive empty content, long Korean clauses, a long unbroken source URL, four attachments, 200% zoom, and the on-screen keyboard without losing composer access.

## 5. Components

Only the following task-required primitives are authorized. Their implementations must be real DOM/components and must pass the primitive showcase before product screens are composed.

### App Shell
- **Structure:** semantic header, main conversation body, and footer/composer in the Section 4 scroll-body-shell.
- **Variants:** locked; empty authenticated chat; active chat; streaming; bounded error.
- **States:** body empty/loading/error; header controls default/hover/focus/active/disabled.
- **Accessibility:** landmarks, stable DOM/focus order, skip-to-composer path, one named scroll region.
- **Motion:** lock-to-chat and empty-to-active transitions from Section 6. Only ChatShell's conversation scroll handler may track upward user scrolling and manual bottom return; it must not drive decorative motion. ResizeObserver watches the growing inner content, including timed grapheme reveal, independently of sentinel visibility. Auto-follow is instant while attached; only the explicit latest-message button scrolls smoothly. New send reattaches; completion never reattaches a detached reader.

### Door Lock, Masked Slots, and Keypad
- **Structure:** labelled masked value/slots, one semantic keypad grid, generic status text, submit semantics on `#`, delete semantics on `*`.
- **Variants:** idle, partially entered, pending, error, success.
- **Spacing:** 4px-base scale; 3 equal overflow-safe columns; each key at least 44x44px.
- **States:** default uses `card`; hover uses `accent`; focus uses the ring contract; active uses press transform; pending disables mutation; error uses ordinary destructive text plus one bounded shake.
- **Accessibility:** one accessible numeric input model, digit keyboard support, Enter/Backspace parity, status announced without exposing the password.
- **Motion:** digit entry and bounded error tokens from Section 6; reduced motion removes roll and shake.

### Button and Icon Control
- **Variants:** outline, secondary, ghost, destructive, and primary icon-only. A normal 14px filled-primary text button is prohibited by the measured light-mode contrast.
- **Sizing:** no interactive target below 44x44px even when its visible icon is smaller.
- **States:** exact default/hover/focus/active/disabled/loading/error rules from Section 2. Active color equals hover; transform supplies press feedback.
- **Accessibility:** semantic button/link choice, accessible name for icon-only controls, no color-only state.

### Conversation
- **Structure:** viewport/list body plus optional pinned-to-bottom affordance; this primitive is the shell’s sole scroll owner.
- **Variants:** empty, populated, streaming, user-scrolled-away.
- **States:** only auto-follow while already pinned; preserve user position otherwise; empty/error remain reachable. Loading or ready attachment previews in the centered composer replace the decorative empty-state prompt so the two layers never overlap.
- **Accessibility:** ordered message semantics and labelled scroll region.

### Message
- **Structure:** user text/images align right inside a `secondary` bubble with interior newlines preserved; assistant Markdown renders without a bubble at full content width, flush with the composer's inline-start edge; the streaming variant floats the orange `primary` marker in the gutter outside that edge and the completed variant removes it without shifting text; the pending status is plain `muted-foreground` text in the same slot, and only the error status keeps a bordered box; sources align under the assistant text; no reasoning region and no dedicated emergency card.
- **Variants:** user, assistant, streaming, error.
- **States:** streaming text updates are unanimated; a newly committed message uses one fade-slide; links use exact interaction states. The 10px `data-assistant-marker` is present only while its caller supplies `streaming`; completion, error, and cancellation remove it without a component-owned lifecycle.
- **Accessibility:** natural Korean line breaking, safe Markdown landmarks, useful image alternatives, source relationships announced.

### Prompt Input
- **Structure:** attachment previews above the multiline text input; a single footer row with a bottom-left + opening a shadcn `DropdownMenu` for `사진 촬영` and `사진 선택`, and model plus send on the right; both menus prefer below the centered empty-state composer and above the active footer composer, retaining Radix collision flipping and the effort submenu's left/right behavior. Both existing file inputs stay mounted, with environment capture only on the camera input. The compact model/effort pill sits immediately left of send, uses the 14px control size and reduced padding with a 44px minimum target, and retains full labels such as `GPT-5.6 Sol · 보통`. Send/stop is the filled `primary` icon-only control; it is the one filled-primary surface in the product.
- **Variants:** centered empty-state and fixed-footer active-state; idle, composing, normalizing, submitted, streaming, error.
- **States:** every control uses the shared state contract; submitted and streaming expose the enabled Square stop action with the accessible name `응답 중지`, while enabled send remains submit. The icon wrapper stays mounted and fixed-size; send/stop swaps immediately, and disabled/enabled transitions change colors only over 150ms without blur or opacity animation.
- **Accessibility:** labelled textarea, 44px targets, persistent Korean disclaimer, error/status live region. Coarse-pointer/no-hover Enter inserts a newline and the button sends; desktop Enter sends and Shift+Enter inserts a newline. IME composition never submits.
- **Layout:** cluster + stack composition; wraps before overflow. The empty copy is exactly “산후 회복·아기 돌봄, 무엇이 궁금하세요?” with no secondary description. The persistent medical copy is exactly “AI는 틀릴 수 있어요. 의료 판단은 의료진과 확인하세요.” At 375px these copies target their approved one-line composition; at 319px and 200% zoom they wrap naturally without clipping, shrinking, or content loss.

### Sources
- **Structure:** disclosure trigger and list of sanitized `http`/`https` source links.
- **Variants:** absent, collapsed, expanded, unavailable/conflicting evidence.
- **States:** default/hover/focus/active; source entry fade-slide only when first committed.
- **Accessibility:** native disclosure semantics or equivalent ARIA, full keyboard operation, long URL wrapping.

### Attachments
- **Structure:** overflow-safe preview grid, thumbnail frame, filename/status, remove control.
- **Variants:** selected, normalizing, ready, rejected, sent-read-only.
- **States:** remove control has all shared states; errors are textual; four-item maximum is represented without horizontal primary scroll.
- **Accessibility:** useful preview name/status, 44px remove target, camera and gallery remain separate labelled controls.

## 6. Motion & Interaction

Motion communicates input, state, and spatial continuity only. It may animate `transform`, `opacity`, and `filter`; color/background/border/box-shadow transitions are allowed as paint-state feedback. Never animate layout properties, never add parallax/magnetic/ripple/loops, and never animate streaming text updates. The marker loop is opacity-only: 1.4s ease-in-out, floor 0.6, fixed 10px size. Pending decoration rotates every 4s with a 200ms opacity-only crossfade through “말씀해 주신 내용을 바탕으로 답변을 준비하고 있어요.”, “기다리시는 동안 잠시 편하게 계셔 주세요.”, and “이해하기 쉽게 안내해 드릴게요.” Its overlapping grid reserves the tallest wrapped phrase. It remains through streaming without current answer text, disappears on first answer text, stop, or error, and restarts at the first phrase for each request/new chat. Screen readers receive one stable pending status, not each decorative rotation.

### Named motion tokens

| Token | Exact value | Use |
| --- | --- | --- |
| `motion-color` | 150ms, `cubic-bezier(0.4, 0, 0.2, 1)` | Live tweakcn control hover/focus/disabled color and shadow feedback; list only the intended paint properties, not `all`. |
| `motion-state` | 200ms, `cubic-bezier(0.16, 1, 0.3, 1)` | Opacity/filter state swap and lock/chat crossfade. |
| `motion-digit` | 220ms, `cubic-bezier(0.16, 1, 0.3, 1)` | Masked digit from translateY(14px), opacity 0, blur(4px) to rest. |
| `motion-error` | 450ms, `cubic-bezier(0.16, 1, 0.3, 1)` | One replayable keypad/input shake sequence: x = 0, -5, 5, -3, 3, -1, 0px. |
| `spring-press` | spring, stiffness 500, damping 30, mass 0.6 | Interruptible key/button press to scale 0.97 and back. |
| `spring-layout` | spring, stiffness 360, damping 32, mass 0.6 | Lock-to-chat screen continuity and centered-to-footer composer movement. |
| `motion-stagger` | 25ms per item, capped at four attachment/source items | Ordered message/source/thumbnail first-entry only; no recurring stagger. |

Message, source, and thumbnail entry uses opacity 0 plus translateY(12px) to rest under `motion-state`; no motion runs merely because content is visible. Screen/composer spatial transitions use `spring-layout` and remain interruptible. Exit/cancel controls are never blocked while motion settles.

### Reduced-motion substitutions

Under `prefers-reduced-motion: reduce` and Motion’s `useReducedMotion`:

- `spring-press`, `spring-layout`, digit translation/blur, shake, and stagger become 0ms with no transform/filter displacement.
- Screen, message, source, and attachment state changes may use opacity-only `motion-color` where continuity helps; streaming updates remain instant. `data-assistant-marker` is static at opacity 1 under reduced motion; pending phrases switch without a fade.
- Error, pending, success, and focus retain identical text, semantics, color tokens, and reachable controls. Removing motion may never remove feedback.

## 7. Depth & Surface

The source uses a **mixed tonal + shallow-shadow** strategy:

- Canvas uses `background`; grouped content uses `card`; floating content uses `popover`. These tonal shifts establish the first depth layer.
- Inputs and cards use `border`/`input` where their boundary must remain legible. Do not border every nested region.
- Resting compact controls may use `shadow-2xs` or `shadow-xs`; ordinary contained surfaces may use `shadow-sm` or `shadow`; elevated menus use `shadow-md` or `shadow-lg`; `shadow-xl` and `shadow-2xl` are reserved for true overlays.
- Never compose an undeclared shadow, glow, gradient, blur-glass material, or colored shadow. Dark mode retains the exact exported shadow values; tonal separation does most of the work.
- Radius follows component hierarchy: 12/14px controls, 16px cards/panels, 20px overlays. Fully rounded geometry is restricted to compact selectors and status pills.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text and non-text UI, visible focus, complete keyboard operation, semantic landmarks, and no keyboard trap.
- No target below 44x44 CSS px at 375px, including keypad keys, send/stop, attachment removal, source disclosure, theme/effort controls, and camera/gallery controls.
- Korean content must render without tofu, clipped baselines, detached particles/endings, one-character orphan lines, or a subject separated from its predicate. Source/citation strings wrap as units where practical and otherwise use `overflow-wrap: anywhere`.
- At 200% zoom and all required widths, the app retains one primary vertical scroll owner, no primary horizontal scrolling, and reachable composer/actions.
- Focus is never represented by color alone. Errors and pending/success states have textual and screen-reader output. Images have useful alternatives; decorative SVGs are hidden from assistive technology.
- Reduced motion follows Section 6. Color scheme follows explicit user/system preference without changing token values. Touch, keyboard, pointer, and screen-reader flows must reach equivalent outcomes.
- The exact light filled-primary text pairing is restricted as described in Sections 2 and 5 because its measured 3.90:1 contrast does not satisfy normal-text AA.

### Accepted debt

| Item | Affected users / location | Why accepted now | Owner / exit condition |
| --- | --- | --- | --- |
| Outfit export does not pin a Korean-specific webfont | Korean readers; every Korean text surface | Adding a face would violate the exact supplied font export. Generic sans fallback remains functional but may vary by OS. | Product owner + design; exit only with explicit approval to extend the theme, followed by CJK visual QA on target platforms. |
| Light `primary` / `primary-foreground` is 3.90:1 | Low-vision users; potential filled text controls | Exact palette fidelity is required. The implementation mitigation is mandatory: no normal-size text on this pair. | Component owners; exit if the user approves a palette revision. Until then, primitive QA must reject violating use. |
| Decorative orange assistant marker falls below 3:1 during its pulse | Low-vision users; pending/streaming marker only | The user explicitly requires theme `primary` with a noticeable 1 → 0.6 → 1 opacity pulse. This temporary, `aria-hidden` decoration accompanies readable pending status or answer text; full opacity remains ≥3:1 and reduced motion stays static at opacity 1. No trough-contrast guarantee is claimed. | Component owners; keep the exception limited to this decoration. Reassess if the marker becomes the sole status cue or the user changes the pulse requirement. |
| Live source promotion obscured initial reference captures | Evidence consumers only; first extraction screenshots | Third-party promotion is not part of the theme and appeared after load. Attempt logs remain preserved; final parity captures dismiss it and replace the obscured PNGs. | Task 2 evidence; closed by the fresh final six-capture Playwright pass. |
