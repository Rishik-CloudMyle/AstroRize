// Contact-detail filter for messages (client, Nov 2026) — a copy of backend/src/lib/contact-filter.ts
// (keep the two identical). The website checks a message with it before sending, so the person
// sees what is wrong at once; the API runs the same rules and is the authority.
//
// Two policies:
//   FREE — the free Messages chat between a customer and an astrologer (text and photo/video
//          captions) and public live-room chat: NO personal details at all — phone numbers, email
//          addresses, links, social media / messaging apps and @handles, UPI IDs, "call me on…",
//          and home / street addresses.
//   PAID — the chat inside a paid consultation: only phone numbers are blocked; emails, links,
//          names and everything else may be shared.
//
// Written to catch the usual tricks (spaces, dots or dashes between digits, +91 / 0 prefixes,
// numbers written in words, "name at gmail dot com") without stopping ordinary astrology talk:
// birth dates ("14 May 1994", "14-05-1994"), times ("06:42 PM"), prices ("₹500") and durations,
// birth places ("born in Kothrud, Pune") and houses of the chart ("Saturn in the 10th house").

export type ContactPolicy = "FREE" | "PAID";
export type ContactKind = "phone" | "email" | "link" | "social" | "upi" | "address";

const WORD_DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/** The text with other scripts' digits (Devanagari ०-९, Arabic-Indic, full-width) as 0-9. */
function latinDigits(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * The text with digits made plain for the phone check: other scripts' digits (Devanagari ०-९,
 * Arabic-Indic, full-width) become 0-9, number words become digits ("nine eight" → "9 8"), and
 * "double 9" / "triple 0" are spelled out.
 */
function plainDigits(text: string): string {
  let s = latinDigits(text).toLowerCase();
  s = s.replace(/(?<![a-z])(zero|oh|one|two|three|four|five|six|seven|eight|nine)(?![a-z])/g, (w) => WORD_DIGITS[w] ?? w);
  s = s.replace(/(?<![a-z])(double|triple)[\s-]*(\d)/g, (_, n: string, d: string) => d.repeat(n === "double" ? 2 : 3));
  return s;
}

// Digits with at most a few separators between them: "98765 43210", "9.8.7.6…", "(987) 654-3210".
// Not "/" or ":" — dates and times use those.
const DIGIT_RUN = /\+?\d(?:[\s.\-–—_()*,'"|]{0,3}\d)*/g;

// Calendar dates ("14-05-1994", "14.5.94", "1994-05-14"), taken out first so two dates side by
// side never read as one long number. Only real day/month values count, so "98-76-…" stays.
const DATE = /(?<!\d)(?:(?:0?[1-9]|[12]\d|3[01])[-./](?:0?[1-9]|1[0-2])[-./](?:19|20)?\d{2}|(?:19|20)\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\d|3[01]))(?!\d)/g;

/** A phone number somewhere in the text (Indian mobile, landline or an international number). */
function hasPhone(text: string): boolean {
  const s = plainDigits(text).replace(DATE, " ; ");
  for (const m of s.matchAll(DIGIT_RUN)) {
    const run = m[0];
    const digits = run.replace(/\D/g, "");
    if (digits.length < 8) continue;
    // An Indian mobile (10 digits from 6-9, maybe after +91 / 0) anywhere in the run — padding it
    // with other digits ("call 9876543210 at 5") doesn't hide it.
    if (/[6-9]\d{9}/.test(digits)) return true;
    // A landline with its STD code ("080-2345 6789", "011 23456789"): 0 + 10 digits.
    if (/^0\d{10}$/.test(digits)) return true;
    // An international number written with "+" ("+1 415 555 0100", "+971 50 123 4567").
    if (run.startsWith("+") && digits.length <= 15) return true;
  }
  // Partly masked numbers: "98765 •••••", "98765 *****", "98765 xxxxx".
  if (/\d{4,5}[\s-]?(?:•{3,}|\*{4,}|x{4,6}(?![a-z]))/i.test(s)) return true;
  return false;
}

// Top-level domains a bare "name.tld" is read as a link with (not ".in" / ".me" alone: "home.In the
// evening" typed without a space is ordinary text; www./http links and wa.me / t.me are caught anyway).
const LINK_TLDS = "com|net|org|io|xyz|ly|gl|co\\.in|org\\.in|net\\.in|app|site|online|store|shop|link|info|biz";
const EMAIL_TLDS = "com|in|net|org|co|io|me|info|biz|xyz|app|us|uk|ai";
// "@" written out: [at] (at) {at} <at>.
const AT_SIGN = String.raw`(?:@|[\[({<]\s*at\s*[\])}>])`;
const DOT_WORD = String.raw`(?:[\[({<]\s*dot\s*[\])}>]|\s+dot\s+)`;

const EMAIL = new RegExp(
  [
    // name@example.com
    String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.(?:[a-z]{2,})\b`,
    // name [at] gmail [dot] com, name(at)gmail.com, name @ gmail . com
    String.raw`\b[\w.+-]+\s*${AT_SIGN}\s*[\w-]+\s*(?:\.|${DOT_WORD})\s*(?:${EMAIL_TLDS})\b`,
    // name at gmail dot com (both words written out)
    String.raw`\b[\w.+-]+\s+at\s+[\w-]+\s*${DOT_WORD}\s*(?:${EMAIL_TLDS})\b`,
    // name at gmail, name@gmail (no ".com")
    String.raw`\b[\w.+-]+\s*(?:${AT_SIGN}|\s+at\s+)\s*(?:gmail|g\s?mail|yahoo|ymail|hotmail|rediffmail|icloud|protonmail)\b`,
  ].join("|"),
  "i",
);

const LINK = new RegExp(
  [
    String.raw`\b(?:https?:\/\/|www\.)\S+`,
    // example.com, bit.ly/abc, example.co.in/page
    String.raw`\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:${LINK_TLDS})\b(?:\/\S*)?`,
    // example dot com, example (dot) com
    String.raw`\b[a-z0-9-]+\s*${DOT_WORD}\s*(?:com|net|org|io|in)\b`,
  ].join("|"),
  "i",
);

// Messaging / social apps and payment apps (moving the chat or the money off the platform).
const SOCIAL = new RegExp(
  [
    String.raw`\b(?:whats\s?app|whatsap+|watsapp|watsup|whtsapp|wtsp|wtsapp|wa\.me)\b`,
    String.raw`\b(?:telegram|t\.me|instagram|insta|snapchat|snap\s?chat|facebook|fb|skype|viber|wechat|discord|twitter|linkedin|signal\s+app|google\s+meet|gmeet|zoom\s+(?:call|meeting|link|id))\b`,
    String.raw`\b(?:gpay|google\s?pay|phone\s?pe|paytm|bhim)\b`,
    // "call me on my number", "message me at this…", "my number is…", "my insta id is…"
    String.raw`\b(?:call|ring|text|sms|message|msg|ping|mail|email|e-mail|dm|contact|reach)\s+me\s+(?:on|at|@|via|through)\s+(?:my\s+|this\s+|the\s+)?(?:number|no\b|mobile|phone|cell|mail|e-?mail|id|\d|\+)`,
    String.raw`\bmy\s+(?:phone|mobile|cell|contact|whatsapp|personal)\s*(?:number|no\.?|num|details?|is)\b`,
    String.raw`\bmy\s+(?:e-?mail|mail|gmail)\s*(?:id|address|is)\b`,
    String.raw`\bmy\s+(?:number|no\.|num|insta(?:gram)?\s+id)\s+(?:is|=|:)`,
    // @handle (not part of an email address)
    String.raw`(?<![\w.+-])@[a-z0-9_.]{3,}`,
  ].join("|"),
  "i",
);

// UPI IDs: name@okaxis, 98765@ybl — an "@" with no dot after it (an email has one).
const UPI = /\b[\w.-]{2,}@[a-z]{2,}\b(?!\.[a-z])/i;

// ── Home / street addresses (FREE policy) ──
// A place name on its own is astrology talk (a birth place: "born in Kothrud, Pune", "Bengaluru,
// Karnataka"); what gives an address away is the street-level part. A strong sign is enough on its
// own; weak signs need a second one, so "Shivaji Nagar" passes but "Flat 302", "12 MG Road",
// "Pune 411001" or "Shanti Society, near Hanuman temple" don't.

// A house / flat / plot number: 302, 12B, 4-B, 12/3, 12-3-456.
const UNIT_NO = String.raw`[a-z]?-?\d{1,5}[a-z]?(?:\s?[/-]\s?\d{1,5}[a-z]?)*\b`;
const NO_MARK = String.raw`(?:no\b\.?|nos?\.|number|num\b|#)`;
// What follows a number that makes it an amount, a duration or a count, not a door number.
const NOT_A_UNIT = String.raw`(?!\s*(?:minutes?|mins?|hours?|hrs?|seconds?|secs?|days?|weeks?|months?|years?|yrs?|times?|%|percent|rs\b|rupees|km|kms|kg)\b)`;
// Street words that follow a number ("12 MG Road") — not "st" / "rd" (they are in "1st", "3rd"),
// nor words astrology uses on their own ("path", "cross", "avenue").
const STREET = String.raw`(?:road|street|lane|gali|marg|highway|main\s+road|cross\s+road)\b(?!\s*(?:trips?|accidents?|safety|journey|travel|food|smart|dogs?|show|map|tax)\b)`;
// Words that never sit between a number and a street name ("2 hours on the road").
const NOT_A_NAME = String.raw`(?:the|a|an|on|in|at|to|of|my|your|his|her|our|their|and|or|for|by|from|with|this|that|is|was|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?|yrs?|times?|km|kms|kilometres?|kilometers?|metres?|meters?|steps?|people|cars?)\b`;

const ADDRESS_STRONG: RegExp[] = [
  // Flat / plot / door / apartment numbers: "flat 302", "Plot no. 12", "door no: 4-B", "Apt #5", "H.No 12-3-456".
  new RegExp(
    String.raw`\b(?:flat|plot|door|apartment|apt|bungalow|villa|h\s?\.\s?no\b\.?|h\s?no\b\.?|d\s?\.\s?no\b\.?)\s*${NO_MARK}?\s*[:.\-]?\s*${UNIT_NO}${NOT_A_UNIT}`,
    "i",
  ),
  // Shop / room / ward / survey numbers, only with "no." ("shop no 4", "survey no. 12/3").
  new RegExp(String.raw`\b(?:shop|room|ward|survey|khasra|quarters?|qtrs?|gala)\s*${NO_MARK}\s*[:.\-]?\s*${UNIT_NO}`, "i"),
  // "House no. 45/2", "house number 221B" — but not a house of the chart ("house number 7"):
  // only numbers past 12, or with a slash, dash or letter.
  /\bhouse\s*(?:no\b\.?|nos?\.|number|#)\s*[:.\-]?\s*(?:\d{1,5}\s?[/-]\s?\d|\d{1,5}[a-z]\b|(?:1[3-9]|[2-9]\d|\d{3,5})\b)/i,
  // A number before a street: "12 MG Road", "221B Baker Street", "45, Linking Road". Not a year.
  new RegExp(
    String.raw`(?<![\d.,:/])(?!(?:19|20)\d\d\b)\d{1,5}(?:st|nd|rd|th)?[a-z]?(?:\s?[/-]\s?\d{1,5}[a-z]?)?\s*,?\s+(?:(?!${NOT_A_NAME})[a-z][a-z.']*\s+){0,2}${STREET}`,
    "i",
  ),
  // Bengaluru style: "5th cross", "3rd main road".
  /\b\d{1,2}(?:st|nd|rd|th)\s+(?:cross|main)\b(?!\s+(?:house|sign|planet|concern|question|problem|issue)s?\b)/i,
  // A street with its number: "Road No. 10", "street 4", "lane no 3", "gali number 2".
  new RegExp(String.raw`\b(?:road|street|lane|gali)\s*${NO_MARK}?\s*[:.\-]?\s*\d{1,4}\b${NOT_A_UNIT}`, "i"),
  // Saying it outright: "my address is…", "address:", "come to my house", "mera ghar ka pata".
  /\b(?:my|our|home|house|residential|delivery|postal)\s+address\b(?!\s+(?:book|bar)\b)|\baddress\s*[:\-]\s*\S|\blandmark\s*(?:[:\-]|is\b)|\b(?:come|visit|drop\s+by|meet)\s+(?:me\s+)?(?:to\s+|at\s+)?(?:my|our)\s+(?:house|home|place|flat|residence|office|shop)\b|\bghar\s+ka\s+pata\b|\b(?:mera|hamara)\s+pata\b/i,
];

const ADDRESS_WEAK: RegExp[] = [
  // Locality words: "Shanti Nagar", "Green Park Colony", "HSR Layout", "Sai Krupa Society".
  /\b(?:nagar|colony|layout|society|enclave|vihar|residency|apartments?|chs|chawl|mohalla|basti|wadi)\b/i,
  // "Sector 15", "Block 4", "Phase 2", "Block B", "Wing C".
  /\b(?:sector|block|phase|pocket|wing)\s*(?:no\b\.?|number)?\s*[:\-]?\s*\d{1,3}\b/i,
  /\b(?:[Ss]ector|[Bb]lock|[Pp]ocket|[Ww]ing)\s+[A-H]\b(?![\w-])/,
  // A floor: "2nd floor", "ground floor".
  /\b(?:\d{1,2}(?:st|nd|rd|th)?|ground|first|second|third|fourth|fifth|top)\s+floor\b/i,
  // A street name without a number: "MG Road", "Park Street", "Linking Road".
  new RegExp(String.raw`\b(?!${NOT_A_NAME})[a-z][a-z.']*\s+(?:road|street|lane|marg|avenue|main\s+road|cross\s+road)\b`, "i"),
  // "near <landmark>": "near Hanuman temple", "opposite the bus stand", "behind City Mall".
  /\b(?:near|opp\.?|opposite|behind|next\s+to|beside|in\s+front\s+of)\s+(?:the\s+|a\s+)?(?:[\w'.-]+\s+){0,3}(?:temple|mandir|masjid|mosque|church|gurudwara|school|college|hospital|clinic|station|bus\s+stop|bus\s+stand|depot|mall|market|bazaar|metro|signal|circle|chowk|petrol\s+pump|bank|atm|post\s+office|police\s+station|park|garden|hotel|theatre|cinema|bridge|water\s+tank|flyover|junction|naka|gate)\b/i,
  // "#12," / "No. 12," at the start of an address.
  /(?:^|[\s,(])(?:#\s?\d{1,5}[a-z]?|no\.\s?\d{1,5}[a-z]?)\s*,/i,
];

// A 6-digit Indian PIN code ("411001", "411 001", "Pune-411001", "PIN: 560034").
const PIN = /(?<![\w,/₹$]|\d\.)[1-9]\d{2}\s?\d{3}(?![\w,/]|\.\d)/g;
/** Words just before a 6-digit number that make it an amount or a reference, not a PIN code. */
const PIN_NOT_BEFORE =
  /(?:₹|\$|\brs\.?|\binr|\brupees|\bref|\bid|\border|\btxn|\botp|\bcode|\bsalary|\bincome|\bctc|\bpackage|\bpaid|\bpay|\bearn\w*|\bloan|\bbudget|\bfees?|\bprice|\bcost|\bamount|\bworth|\bspent|\binvest\w*|\bsav(?:e|ed|ing|ings)|\blakhs?|\bscore|\brank|\broll\s+no\.?)\s*(?:is|of|was|=|:|#|-)?\s*$/i;
const PIN_NOT_AFTER =
  /^\s*(?:rs\b|rupees|₹|inr\b|\/-|lakhs?|minutes?|mins?|seconds?|hours?|km|kms|kg|followers|views|steps|people|times|years?|per\b|pa\b|p\.a|annually|a\s+(?:year|month)|salary)/i;

function hasPinCode(s: string): boolean {
  for (const m of s.matchAll(PIN)) {
    const before = s.slice(Math.max(0, m.index - 30), m.index);
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 20);
    if (/\b(?:pin|zip|postal)\s*(?:code|no\.?)?\s*[:.\-]?\s*$/i.test(before)) return true;
    // A reference such as "SES-482913".
    if (/\b[A-Z]{2,}\d*-$/.test(before)) continue;
    if (PIN_NOT_BEFORE.test(before) || PIN_NOT_AFTER.test(after)) continue;
    return true;
  }
  return false;
}

/** A home or street address in the text (the street-level part, not a city or a birth place). */
function hasAddress(text: string): boolean {
  const s = latinDigits(text);
  if (hasPinCode(s) || ADDRESS_STRONG.some((re) => re.test(s))) return true;
  return ADDRESS_WEAK.filter((re) => re.test(s)).length >= 2;
}

/** Which kinds of personal detail the text contains under this policy (empty = fine to send). */
export function findContactDetails(text: string, policy: ContactPolicy = "FREE"): ContactKind[] {
  const found: ContactKind[] = [];
  if (hasPhone(text)) found.push("phone");
  if (policy === "PAID") return found;
  const email = EMAIL.test(text);
  if (email) found.push("email");
  if (!email && UPI.test(text)) found.push("upi");
  if (LINK.test(text) && !email) found.push("link");
  if (SOCIAL.test(text)) found.push("social");
  if (hasAddress(text)) found.push("address");
  return found;
}

export function containsContactDetails(text: string, policy: ContactPolicy = "FREE"): boolean {
  return findContactDetails(text, policy).length > 0;
}

const KIND_NAME: Record<ContactKind, string> = {
  phone: "a phone number",
  email: "an email address",
  link: "a link",
  social: "a social media or messaging app detail",
  upi: "a UPI ID",
  address: "a home or street address",
};

/** The sentence the sender sees instead of their message: what was found and why it isn't sent. */
export function contactBlockedNotice(kinds: ContactKind[], policy: ContactPolicy = "FREE", place = "free chat"): string {
  const what = kinds.length ? kinds.map((k) => KIND_NAME[k]).join(" and ") : "contact details";
  if (policy === "PAID") {
    return `This message contains ${what}. Phone numbers can't be shared in a consultation; everything else is fine. Keep calls on AstroRize so both of you stay protected.`;
  }
  return `This message contains ${what}. Phone numbers, email addresses, links, social media handles, UPI IDs and home addresses can't be shared in ${place}, so everyone stays protected.`;
}

const SNIPPET_MAX = 140;

/**
 * What staff see of a blocked attempt (the API keeps only this): the message with the personal
 * detail hidden. Digits become • (a phone-length number keeps its first two, so "98••••••••" still
 * reads as a phone number), emails / UPI IDs / handles / links keep only their first letter, and
 * numbers written in words are hidden. Cut to 140 characters.
 */
export function maskContact(text: string): string {
  let s = latinDigits(text).replace(/\s+/g, " ").trim();
  // name@example.com, name@okaxis, name @ gmail → n•••@e•••
  s = s.replace(/([\w+-])[\w.+-]*@([\w-])[\w.-]*/g, "$1•••@$2•••");
  s = s.replace(/\b([\w+-])[\w.+-]*\s+@\s*(?:g\s?mail|yahoo|ymail|hotmail|rediffmail|icloud|protonmail|outlook)\b[\w.\s]*?(?=\s|$)/gi, "$1•••@•••");
  // @handle → @h•••
  s = s.replace(/(^|[^\w•])@([a-z0-9_])[a-z0-9_.]*/gi, "$1@$2•••");
  // Links: https://…, www.…, name.com/…
  s = s.replace(/\b(?:https?:\/\/|www\.)(\S)\S*/gi, "$1•••");
  s = s.replace(/\b([a-z0-9])[a-z0-9-]*(?:\.[a-z0-9-]+)*\.(com|net|org|io|xyz|ly|gl|in|me|app|site|online|store|shop|link|info|biz)\b\S*/gi, "$1•••.$2");
  // "name at gmail dot com", "name [at] gmail"
  s = s.replace(/\b([a-z0-9])[\w.]*\s*(?:\[at\]|\(at\)|\{at\}|<at>|\sat\s)\s*(?:g\s?mail|yahoo|ymail|hotmail|rediffmail|icloud|protonmail|outlook)\b(?:\s*(?:\.|\[dot\]|\(dot\)|\sdot\s)\s*\w+)?/gi, "$1••• at •••");
  // Numbers written in words, three or more in a row ("nine eight seven …").
  s = s.replace(/\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple)[\s,.-]*){3,}/gi, "••• ");
  // Digits: a phone-length run keeps its first two, everything else is hidden.
  s = s.replace(/\+?\d(?:[\s.\-–_()]{0,3}\d)*/g, (run) => {
    const digits = run.replace(/\D/g, "").length;
    let kept = digits >= 8 ? 2 : 0;
    return run.replace(/\d/g, (d) => (kept-- > 0 ? d : "•"));
  });
  s = s.trim();
  return s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX - 1)}…` : s;
}
