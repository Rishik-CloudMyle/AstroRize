// Bottom sheets of the mobile app prototype (.sheet-scrim / .sheet / .handle).
//
// Most dialogs need nothing from here: components/ui/modal.tsx (website) and
// components/portal/modal.tsx (portal) already render as bottom sheets below 1024px and as the
// centred desktop dialog at ≥ 1024px. Use these pieces only for an overlay that draws its own
// markup (consult sheet, filter panel…):
//
//   SHEET_SCRIM  classes for the fixed backdrop that pins the sheet to the bottom
//                (add your own z-index: modals use z-[100]+, the tab bar is z-[90])
//   SHEET_PANEL  classes for the sheet itself: full width, cream (#fffdf8), 20px top corners,
//                12px/16px padding + bottom safe area, max 85% of the screen, scrolls inside
//   <SheetHandle />  the 36×4 grab handle at the top of a sheet
//   <SheetTitle id>  the sheet heading (18px bold, as in the prototype's sort/consult sheets)
//
// These classes apply at every width. If the same overlay must look different on desktop, write
// both sets literally with max-lg: / lg: prefixes (Tailwind can't prefix a class string at runtime),
// or use the Modal, which already switches at 1024px.

export const SHEET_SCRIM = "fixed inset-0 flex items-end bg-app-scrim";

export const SHEET_PANEL =
  "w-full max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-app-modal bg-app-elev px-4 pt-3 pb-[calc(24px+var(--app-safe-bottom))] text-app-ink shadow-app-modal outline-none";

export function SheetHandle() {
  return <div aria-hidden="true" className="mx-auto mt-1 mb-3 h-1 w-9 rounded-full bg-app-line" />;
}

export function SheetTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="m-0 mb-3 text-[18px] font-bold text-app-ink">
      {children}
    </h2>
  );
}
