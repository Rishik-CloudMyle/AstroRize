"use client";

// The rounded search field of the mobile app prototype (.search / .search-compact /
// .home-search-btn): 36px white pill, hairline border, 16px search icon, 13–14px text.
//
// Two forms:
//   <SearchPill href="/astrologers?focus=search" placeholder="Search astrologers" />
//       a link that only LOOKS like the field (Home: tapping it opens the search screen)
//   <SearchPill value={q} onValueChange={setQ} onSubmit={run} placeholder="Search astrologers" label="Search astrologers" />
//       a real search input
// Props:
//   placeholder    placeholder / link text (default "Search astrologers")
//   href           render as a link to this address instead of an input
//   value, onValueChange  controlled input value
//   onSubmit       called with the value on Enter
//   label          accessible name (default = placeholder)
//   autoFocus, inputRef, name — passed to the input
//   trailing       optional element at the right end (e.g. a clear button)
//   className      spacing for the pill

import Link from "next/link";
import { IconSearch } from "./icons";

const PILL =
  "flex min-h-9 w-full items-center gap-2 rounded-app-chip border border-app-line bg-app-surface px-3 text-app-ink-3 focus-within:border-app-selected focus-within:shadow-[0_0_0_3px_rgba(245,158,11,.18)]";

export default function SearchPill({
  placeholder = "Search astrologers",
  href,
  value,
  onValueChange,
  onSubmit,
  label,
  autoFocus,
  inputRef,
  name,
  trailing,
  className = "",
}: {
  placeholder?: string;
  href?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  name?: string;
  trailing?: React.ReactNode;
  className?: string;
}) {
  if (href) {
    return (
      <Link href={href} className={`${PILL} text-[13px] hover:text-app-ink-3 hover:no-underline ${className}`}>
        <IconSearch className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate py-2">{placeholder}</span>
      </Link>
    );
  }
  return (
    <form
      role="search"
      className={`${PILL} ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value ?? "");
      }}
    >
      <IconSearch className="size-4 shrink-0" />
      <input
        ref={inputRef}
        type="search"
        name={name}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[14px] text-app-ink outline-none placeholder:text-app-ink-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {trailing}
    </form>
  );
}
