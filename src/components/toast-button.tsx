"use client";

import { useAppUI } from "./app-provider";

/** A button that shows a toast message, for use inside server-rendered pages. */
export default function ToastButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { toast } = useAppUI();
  return (
    <button type="button" onClick={() => toast(message)} className={className}>
      {children}
    </button>
  );
}
