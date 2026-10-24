# Mobile app look (< 1024px)

Below the desktop breakpoint (`lg`, 1024px) the website and the astrologer portal look like the
client's **customer mobile app prototype** (Part A, "Elegant" theme:
`astrorize-prototype-reference/part-a-mobile-app/styles.css` + `app.js`). Desktop (≥ 1024px) must not
change by a single pixel — run the desktop baseline diff after every change.

## Rules for page work

- Restyle a page for phones/tablets with `max-lg:` classes, or render a phone/tablet block with
  `lg:hidden` next to the untouched desktop block (`max-lg:hidden`). Never edit a desktop class in a way
  that changes its result at ≥ 1024px.
- The components in this folder render the app look at **every** width. Use them inside `lg:hidden`
  blocks (or on pages that are new, like `/me`), not in place of desktop markup.
- Page gutter is 16px (`px-4`); sections are 22px apart (`mt-[22px]`); rows/cards stack 8px apart.
- Gold is the identity, orange (`app-urgent`) is for urgency only (live, unread, urgent CTA).
- Prices, discounts, wallet rules, legal text: never invent — ask (see CLAUDE.md).

## Shell (already in place)

| Where | What |
| --- | --- |
| `components/site-chrome.tsx` | Desktop header/footer (`max-lg:hidden`) + `SiteAppHeader` + `SiteTabBar` (both `lg:hidden`). |
| `mobile/site-app-shell.tsx` | Website app header (logo, wallet chip → /wallet, bell; signed out: "Log in"; astrologer/staff: "My portal"/"Admin") with the "consultation in progress" strip, and the tab bar **Home · Live · Consult · Messages · Profile** (Messages shows the unread count from `GET /api/messages`). |
| `components/portal/portal-shell.tsx` | Portal app header (logo + "Astrologer portal", bell, photo → profile) and tab bar **Dashboard · Consultations · Live · Messages · More** ("More" = bottom sheet with Availability, Earnings, Profile, Compliance, Application, Log out). Desktop sidebar unchanged at ≥ 1024px. |
| `app/(site)/me` + `components/account/profile-hub.tsx` | The **Profile** tab: identity, wallet + Recharge, account rows, notifications, legal links and company line (the app look has no footer), Log out. |
| `components/ui/modal.tsx`, `components/portal/modal.tsx` | Every dialog is a **bottom sheet** below 1024px (full width, 20px top corners, grab handle, safe area, max 85% height, scrolls inside). |

### Tab bar and full-screen screens

- The tab bar is fixed at the bottom (`z-[90]`; dialogs are `z-[100]`+ and cover it) and leaves an
  equal spacer in the page flow, so the end of every page stays visible.
- Anything **you** pin to the bottom (sticky CTA, composer) must sit above it:
  `bottom-[var(--app-tabbar-space)]` (or hide the tab bar on that screen).
- Full-screen screens hide it: render `<HideTabBar />` (or call `useHideTabBar(true)`) from
  `mobile/tab-bar.tsx` while the screen is open. The website already hides it on `/messages/<thread>`,
  `/live?room=…`, `/login` and `/signup` (`isImmersive()` in `site-app-shell.tsx`).
- Toasts sit above the tab bar below 1024px.

## Tokens (`src/app/globals.css`, all prefixed `app-`)

Colours (`bg-` / `text-` / `border-` …):

| Token | Value | Use |
| --- | --- | --- |
| `app-bg` | #f7f4ee | page background |
| `app-elev` | #fffdf8 | sheets, modals, title bars |
| `app-surface` | #ffffff | cards, inputs, icon buttons, tab bar |
| `app-ink` / `app-ink-2` / `app-ink-3` | #1c1917 / #57534e / #78716c | text / secondary / hints, inactive tabs |
| `app-line` | #e7e0d6 | borders, dividers |
| `app-line-gold` | #ebcfa1 | filter-chip border |
| `app-line-gold-2` | #ebcb95 | title pill and "See all" border |
| `app-primary` / `app-on-primary` | #f59e0b / #1c1917 | primary button, selected choice |
| `app-selected` | #d97706 | selected card/chip border, input focus |
| `app-accent` | #b45309 | links, ghost buttons |
| `app-active` | #92400e | active tab, selected chip text |
| `app-tint` / `app-tint-2` / `app-tint-3` | #fffbeb / #fef3c7 / #fde68a | selected chip fill / tags, avatar placeholder / tinted-card border |
| `app-urgent` | #ea580c | badges, live, urgent only |
| `app-success(-bg)`, `app-error(-bg)`, `app-info(-bg)` | #047857/#ecfdf5, #be123c/#fff1f2, #1d4ed8/#eff6ff | status |
| `app-scrim` | rgba(28,25,23,.45) | sheet backdrop |

Radii: `rounded-app-chip` (999px), `rounded-app-btn` (12), `rounded-app-input` (12), `rounded-app-card`
(16), `rounded-app-modal` (20). Shadows: `shadow-app-card`, `shadow-app-float`, `shadow-app-modal`.
Sizes: `h-app-hit` / `size-app-hit` (44px touch target), `h-app-nav` (64px tab bar).
CSS variables: `--app-tabbar-space` (64px + home-indicator inset), `--app-safe-bottom`.
Fonts: `font-sans` (Figtree, UI), `font-display` (Cormorant Garamond — brand, big titles),
`font-name` (Playfair — astrologer names), `font-card` (Inter — card details), as in the prototype.

Type scale used by the prototype: titles 16px bold; rows 13.3px; body 13–14px; hints 12px; chips 12px
bold; tags 11px bold; tab labels 9px (650); buttons 15px bold (13px small).

## Components (props are documented at the top of each file)

| File | Exports | Prototype |
| --- | --- | --- |
| `app-header.tsx` | `AppHeader`, `WalletChip`, `HeaderPill`, `HeaderIconButton` | `.home-head`, `.wallet-chip`, `.icon-btn` |
| `tab-bar.tsx` | `TabBar` (default), `HideTabBar`, `useHideTabBar`, `useTabBarHidden`, `TabBadge` | `.tabbar`, `.tab` |
| `section-header.tsx` | `SectionHeader` (`variant` pill / chip / link) | `.section-h`, `.home-see`, `.az-go` |
| `search-pill.tsx` | `SearchPill` (input, or `href` link that looks like one) | `.search`, `.home-search-btn` |
| `chips.tsx` | `ChipRow`, `Chip`, `Segmented` (radio group), `Tag` | `.discover-chips`/`.dchip`, `.choice`, `.chip` |
| `list-row.tsx` | `ListRow` (default), `ListRows` | `.card.acc-row` |
| `app-card.tsx` | `AppCard` | `.card`, `.money-hero` (tone "tint") |
| `button.tsx` | `AppButton` (default), `appButtonClass()` | `.btn-primary/-secondary/-ghost/-danger/-urgent` |
| `page-title.tsx` | `AppPageTitle` (title pill), `AppTopbar` (back + centred title) | `.topbar > b.az-sec`, `.topbar` + `.back` |
| `sheet.tsx` | `SHEET_SCRIM`, `SHEET_PANEL`, `SheetHandle`, `SheetTitle` | `.sheet-scrim`, `.sheet`, `.handle` |
| `empty-state.tsx` | `EmptyState` | `.empty` |
| `skeleton.tsx` | `Skeleton`, `SkeletonRows` | `.skel` |
| `icons.tsx` | `IconHome`, `IconLive`, `IconPeople`, `IconMessage`, `IconUser`, `IconBell`, `IconSearch`, `IconFilter`, `IconBack`, `IconChevron`, `IconWallet`, `IconClock`, `IconMore`, `IconGift`, `IconBook`, `IconPhone`, `IconDoc`, `IconCalendar`, `IconRupee`, `IconShield`, `IconLogout`, `IconSparkle`, `IconDashboard` | `icons` in app.js |

`components/notification-bell.tsx` has `variant="app"` (44px header button) and `variant="row"`
(a list row that opens the same panel); the default stays the desktop bell.

## Checking your page

1. Phone/tablet: 360, 390, 430, 768, 900 widths — no horizontal scroll, nothing under the tab bar,
   focus visible, compare with `scratchpad/e2e/overview/screens/m-*.png` / `t-*.png`.
2. Desktop: `scratchpad/e2e/desktop-baseline` → `node shoot.mjs <dir>` then `python -I diff.py before <dir>`
   must print `0 changed of 93`.
