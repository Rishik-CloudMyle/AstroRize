// The mobile app prototype's empty state (.empty): centred, 28px/12px padding, secondary text,
// optionally a small icon above and one action below.
//
// <EmptyState title="No rooms on air right now." body="…" action={<AppButton …/>} />
//   title   main line (14px, ink, semibold)
//   body    optional explanation (13px, secondary)
//   icon    optional element above (e.g. an icon from ./icons, shown 28px in a soft gold circle)
//   action  optional button/link below
//   role    pass "status" when it replaces content that was loading (announced politely)
//   className spacing

export default function EmptyState({
  title,
  body,
  icon,
  action,
  role,
  className = "",
}: {
  title: React.ReactNode;
  body?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  role?: "status";
  className?: string;
}) {
  return (
    <div role={role} className={`px-3 py-7 text-center text-app-ink-2 ${className}`}>
      {icon && (
        <span aria-hidden="true" className="mx-auto mb-2.5 grid size-12 place-items-center rounded-full bg-app-tint-2 text-app-accent [&>svg]:size-6">
          {icon}
        </span>
      )}
      <p className="m-0 text-[14px] font-semibold text-app-ink">{title}</p>
      {body && <p className="mx-auto mt-1 mb-0 max-w-[36ch] text-[13px] leading-[1.45]">{body}</p>}
      {action && <div className="mt-2.5 flex justify-center">{action}</div>}
    </div>
  );
}
