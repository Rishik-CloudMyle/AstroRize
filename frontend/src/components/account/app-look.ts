// `max-lg:` class sets that give an existing desktop control the mobile app prototype's look below
// 1024px (desktop keeps its own classes untouched). Append them to the control's className.

/** The gold primary button (.btn-primary): flat gold fill, 12px radius, 44px tall, full width. */
export const APP_CTA =
  "max-lg:h-app-hit max-lg:w-full max-lg:rounded-app-btn max-lg:bg-none max-lg:bg-app-primary max-lg:text-app-on-primary max-lg:shadow-none";

/** The hairline secondary button (.btn-secondary), full width. */
export const APP_SECONDARY =
  "max-lg:h-app-hit max-lg:w-full max-lg:rounded-app-btn max-lg:border-app-line max-lg:bg-transparent max-lg:text-app-ink";

/** A text input (.input): 50px, white, hairline border, 12px radius, 16px text, gold focus. */
export const APP_INPUT =
  "max-lg:h-[50px] max-lg:rounded-app-input max-lg:bg-app-surface max-lg:text-[16px] max-lg:focus:border-app-selected";

/** A field label (.label): 12px, secondary colour. */
export const APP_LABEL = "max-lg:text-[12px] max-lg:font-medium max-lg:text-app-ink-2";

/** A white card (.card): hairline border, 16px radius, soft shadow. */
export const APP_CARD =
  "max-lg:rounded-app-card max-lg:border-app-line max-lg:bg-app-surface max-lg:shadow-app-card";
