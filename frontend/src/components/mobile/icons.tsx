// The phone/tablet app's line icons, copied from the client's mobile app prototype
// (part-a-mobile-app/app.js `icons`): 24×24 viewBox, 1.75 stroke, currentColor.
//
// Props (every icon): `className` (size it with Tailwind, e.g. "size-5"; default 1em-ish via the
// parent) and any other SVG attribute. Icons are decorative (aria-hidden) — label the button/link.
//
//   <IconHome className="size-5" />   <IconBell />   <IconChevron className="size-4" />

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, strokeWidth = 1.75, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
  </Svg>
);

/** "Live" (a sun with rays), as on the prototype's Live tab. */
export const IconLive = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 5v2M12 17v2M5 12H3M21 12h-2M7 7l-1.4-1.4M18.4 18.4 17 17M7 17l-1.4 1.4M18.4 5.6 17 7" />
  </Svg>
);

/** Two people: "Consult". */
export const IconPeople = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 19a6 6 0 0 1 12 0" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M21 19a5 5 0 0 0-6-4.6" />
  </Svg>
);

/** Speech bubble: messages. */
export const IconMessage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6h14v9H8l-3 3V6z" />
    <path d="M8 10h8M8 13h5" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 19a7 7 0 0 1 14 0" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5 8 12l7 7" />
  </Svg>
);

export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <circle cx="16" cy="14.5" r="1.2" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5l3 2" />
  </Svg>
);

export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="18" cy="12" r="1.2" />
  </Svg>
);

export const IconGift = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="9" rx="1.5" />
    <path d="M4 11h16V8H4zM12 8v12M12 8c0-2.2-1.6-4-3.4-4C6.8 4 6 5.4 7.2 7.2 8.6 8 10.4 8 12 8c1.6 0 3.4 0 4.8-.8C18 5.4 17.2 4 15.4 4 13.6 4 12 5.8 12 8z" />
  </Svg>
);

export const IconBook = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5.5A3.5 3.5 0 0 1 8.5 4H19v15H8.5A3.5 3.5 0 0 0 5 22.5z" />
    <path d="M5 5.5v17" />
    <path d="M9 8h6" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3.8h3.2l1 3.2-2 1.4a11 11 0 0 0 6.4 6.4l1.4-2 3.2 1V17a1.8 1.8 0 0 1-1.8 1.8A14.2 14.2 0 0 1 5.2 7.6 1.8 1.8 0 0 1 7 5.8Z" />
  </Svg>
);

export const IconDoc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);

export const IconRupee = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5h10M7 9h10M7 5h3a4 4 0 0 1 0 8H7l7 6" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9z" />
  </Svg>
);

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="8" rx="1.5" />
    <rect x="13" y="4" width="7" height="5" rx="1.5" />
    <rect x="4" y="14" width="7" height="6" rx="1.5" />
    <rect x="13" y="11" width="7" height="9" rx="1.5" />
  </Svg>
);
