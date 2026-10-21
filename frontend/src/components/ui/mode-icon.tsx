// One set of line icons for the ways to consult: chat, voice, video and Instant Call. They draw
// in the current text colour, so each button sets the colour (amber, blue, or grey when blocked).

export type ModeIconKind = "chat" | "voice" | "video" | "instant";

const PATHS: Record<ModeIconKind, React.ReactNode> = {
  chat: (
    <>
      <path d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V16A2.5 2.5 0 0 1 4 13.5v-7A2.5 2.5 0 0 1 6.5 4Z" />
      <path d="M8 8.8h8M8 12h5" />
    </>
  ),
  voice: (
    <path d="M6.6 3.5h2.3a1 1 0 0 1 .94.66l1.2 3.3a1 1 0 0 1-.38 1.17l-1.6 1.1a11 11 0 0 0 5.2 5.2l1.1-1.6a1 1 0 0 1 1.17-.38l3.3 1.2a1 1 0 0 1 .66.94v2.3a2.2 2.2 0 0 1-2.4 2.2A16.4 16.4 0 0 1 4.4 5.9a2.2 2.2 0 0 1 2.2-2.4Z" />
  ),
  video: (
    <>
      <rect x="2.75" y="6" width="12.75" height="12" rx="3" />
      <path d="m15.5 10.6 4.6-2.9a.6.6 0 0 1 .9.5v7.6a.6.6 0 0 1-.9.5l-4.6-2.9Z" />
    </>
  ),
  instant: <path d="M13.2 2.8 5.4 13.2a.5.5 0 0 0 .4.8h5.4l-.9 7.2 7.9-10.6a.5.5 0 0 0-.4-.8h-5.4l.8-7Z" />,
};

/** A consultation mode's icon, `size` px square (decorative: the button's text names the mode). */
export default function ModeIcon({ mode, size = 20, className = "" }: { mode: ModeIconKind; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[mode]}
    </svg>
  );
}
