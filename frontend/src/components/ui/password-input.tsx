"use client";

import { useLayoutEffect, useRef, useState } from "react";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * A password field with a show / hide (eye) button inside it.
 * - The button is a toggle (aria-pressed) labelled "Show password" / "Hide password".
 * - Clicking it leaves the cursor where it was in the field; from the keyboard,
 *   focus stays on the button so Space / Enter can toggle again.
 * - `className` styles the input exactly as before; room for the button is added on the right.
 */
export default function PasswordInput({
  className = "",
  wrapperClassName = "",
  defaultVisible = false,
  ref,
  ...props
}: InputProps & {
  /** Classes for the wrapper (e.g. flex-1 inside a row). */
  wrapperClassName?: string;
  /** Start with the text shown, e.g. a temporary password an admin just generated. */
  defaultVisible?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(defaultVisible);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Caret / selection to put back after the type switch (browsers may reset it). */
  const restore = useRef<{ start: number | null; end: number | null } | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const sel = restore.current;
    restore.current = null;
    if (!input || !sel || document.activeElement !== input) return;
    try {
      input.setSelectionRange(sel.start, sel.end);
    } catch {
      // Some input types don't support selection; nothing to restore.
    }
  }, [visible]);

  function setRefs(node: HTMLInputElement | null) {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  function toggle() {
    const input = inputRef.current;
    if (input && document.activeElement === input) restore.current = { start: input.selectionStart, end: input.selectionEnd };
    setVisible((v) => !v);
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...props}
        ref={setRefs}
        type={visible ? "text" : "password"}
        // Edge draws its own reveal button on password fields; ours replaces it.
        className={`${className} pr-12 [&::-ms-reveal]:hidden`}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? "Hide password" : "Show password"}
        disabled={props.disabled}
        // Mouse / touch: don't take focus away from the field, so typing carries on.
        onMouseDown={(e) => {
          if (document.activeElement === inputRef.current) e.preventDefault();
        }}
        onClick={toggle}
        className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-[10px] text-stone-500 hover:bg-cream hover:text-ink disabled:opacity-50"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
