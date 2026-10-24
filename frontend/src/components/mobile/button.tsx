// Buttons of the mobile app prototype (.btn …): 44px tall (36px "sm"), 12px radius, 15px bold.
//
// <AppButton variant="primary" onClick={…}>Recharge</AppButton>
// <AppButton href="/wallet" variant="secondary" block>View transactions</AppButton>
//   variant  "primary"   gold fill, dark text (the main action)
//            "secondary" transparent with a hairline border
//            "ghost"     text only, gold-brown (a quiet third action)
//            "danger"    rose tint, red text (Delete account)
//            "urgent"    orange fill, white text — only for genuinely urgent actions (orange = urgency)
//   size     "md" (44px, default) | "sm" (36px)
//   block    full width
//   href     render a Link styled as the button (no `disabled` on links)
//   loading  shows the prototype spinner and disables the button (keeps its width)
//   type, disabled, onClick, aria-* … are passed to the <button>
//   className extra classes (spacing)

import Link from "next/link";

const VARIANTS = {
  primary: "bg-app-primary text-app-on-primary hover:text-app-on-primary",
  secondary: "border border-app-line bg-transparent text-app-ink hover:text-app-ink",
  ghost: "bg-transparent text-app-accent hover:text-app-active",
  danger: "bg-app-error-bg text-app-error hover:text-app-error",
  urgent: "bg-app-urgent text-white hover:text-white",
} as const;

export type AppButtonVariant = keyof typeof VARIANTS;

export function appButtonClass({
  variant = "primary",
  size = "md",
  block = false,
}: {
  variant?: AppButtonVariant;
  size?: "md" | "sm";
  block?: boolean;
} = {}): string {
  return `inline-flex items-center justify-center gap-2 rounded-app-btn font-bold hover:no-underline disabled:cursor-not-allowed disabled:opacity-40 ${
    size === "sm" ? "min-h-9 px-3 text-[13px]" : "min-h-app-hit px-4 text-[15px]"
  } ${block ? "w-full" : ""} ${VARIANTS[variant]}`;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: "md" | "sm";
  block?: boolean;
  loading?: boolean;
  href?: undefined;
};

type LinkProps = {
  href: string;
  variant?: AppButtonVariant;
  size?: "md" | "sm";
  block?: boolean;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
};

export default function AppButton(props: ButtonProps | LinkProps) {
  if (props.href !== undefined) {
    const { href, variant, size, block, className = "", children, ...rest } = props;
    return (
      <Link href={href} {...rest} className={`${appButtonClass({ variant, size, block })} ${className}`}>
        {children}
      </Link>
    );
  }
  const { variant, size, block, loading = false, className = "", children, type = "button", disabled, ...rest } = props;
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${appButtonClass({ variant, size, block })} ${className}`}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-[rgba(28,25,23,.25)] border-t-app-ink"
        />
      )}
      {children}
    </button>
  );
}
