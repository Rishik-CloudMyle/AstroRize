// The contact-detail filter (lib/contact-filter.ts) against messages people really write.
// No database, no network:   node test/contact-filter.test.ts
// Exits 1 if any example is classified wrongly.

import { type ContactKind, type ContactPolicy, findContactDetails, maskContact } from "../src/lib/contact-filter.ts";

type Case = [text: string, expect: ContactKind[] | "none" | "any"];

// Blocked in free chat (Messages): every kind of personal detail.
const FREE_BLOCKED: Case[] = [
  ["9876543210", ["phone"]],
  ["call me 98765 43210", ["phone"]],
  ["+91 98765-43210", ["phone"]],
  ["+919876543210", ["phone"]],
  ["09876543210", ["phone"]],
  ["91 9876543210", ["phone"]],
  ["9 8 7 6 5 4 3 2 1 0", ["phone"]],
  ["9.8.7.6.5.4.3.2.1.0", ["phone"]],
  ["98-76-54-32-10", ["phone"]],
  ["(987) 654-3210", ["phone"]],
  ["987 654 3210", ["phone"]],
  ["nine eight seven six five four three two one zero", ["phone"]],
  ["Nine Eight Seven 6543210", ["phone"]],
  ["nine-eight-seven-six-five-four-three-two-one-zero", ["phone"]],
  ["double nine eight seven six five four three two one", ["phone"]],
  ["९८७६५४३२१०", ["phone"]],
  ["call 9876543210 at 5", ["phone"]],
  ["landline 011 2345 6789", ["phone"]],
  ["080-23456789", ["phone"]],
  ["+1 415 555 0100", ["phone"]],
  ["98765 •••••", ["phone"]],
  ["98765 xxxxx", ["phone"]],
  ["sneha.r@gmail.com", ["email"]],
  ["mail me: Sneha_R+astro@yahoo.co.in", ["email"]],
  ["sneha at gmail dot com", ["email"]],
  ["sneha [at] gmail [dot] com", ["email"]],
  ["sneha(at)gmail(dot)com", ["email"]],
  ["sneha @ gmail . com", ["email"]],
  ["sneha at gmail", ["email"]],
  ["https://example.com/page", ["link"]],
  ["www.mysite.in", ["link"]],
  ["visit astro-guru.com for more", ["link"]],
  ["bit.ly/abc123", ["link"]],
  ["mysite dot com", ["link"]],
  ["wa.me/919876543210", "any"],
  ["msg me on WhatsApp", ["social"]],
  ["whats app me", ["social"]],
  ["my insta is astro_sneha", ["social"]],
  ["follow me on instagram", ["social"]],
  ["Telegram pe aao", ["social"]],
  ["t.me/astro", "any"],
  ["find me on facebook", ["social"]],
  ["snapchat?", ["social"]],
  ["DM @astro.sneha", ["social"]],
  ["pay on gpay", ["social"]],
  ["send via PhonePe", ["social"]],
  ["call me on the number I gave", ["social"]],
  ["my number is below", ["social"]],
  ["my email id please", ["social"]],
  ["sneha@okaxis", ["upi"]],
  ["9876543210@ybl", "any"],
  ["pay to astro.guru@paytm", "any"],
  // Home / street addresses.
  ["Flat 302, Shanti Apartments, MG Road, Pune 411001", ["address"]],
  ["flat no 4B", ["address"]],
  ["Plot no. 12, Sector 5", ["address"]],
  ["door no: 4-B", ["address"]],
  ["H.No 12-3-456/7, Road No. 10, Banjara Hills", ["address"]],
  ["h no 221", ["address"]],
  ["House no. 45/2, Gandhi Nagar", ["address"]],
  ["house number 221B", ["address"]],
  ["House No 34 near Hanuman temple", ["address"]],
  ["12 MG Road", ["address"]],
  ["221B Baker Street, London", ["address"]],
  ["45, Linking Road, Bandra", ["address"]],
  ["I stay at 7 park street", ["address"]],
  ["3rd cross, 5th main, Malleshwaram", ["address"]],
  ["road no 12 jubilee hills", ["address"]],
  ["gali number 2, Chandni Chowk", ["address"]],
  ["Pune 411001", ["address"]],
  ["Pune-411001", ["address"]],
  ["Pin code area 411 001", ["address"]],
  ["PIN: 560034", ["address"]],
  ["pincode 110017", ["address"]],
  ["Kothrud, Pune - 411038.", ["address"]],
  ["Sai Krupa Society, near the bus stand", ["address"]],
  ["Shanti Nagar, opposite City Mall", ["address"]],
  ["Block B, 4th floor, Green Enclave", ["address"]],
  ["Sector 15, near Gurudwara, Chandigarh", ["address"]],
  ["Shop no 4, Laxmi Market", ["address"]],
  ["Apt #5, Palm Residency", ["address"]],
  ["my address is below", ["address"]],
  ["Address: Kothrud", ["address"]],
  ["come to my house tomorrow, I will explain", ["address"]],
  ["visit me at my office", ["address"]],
  ["mera ghar ka pata likh lo", ["address"]],
  ["#12, 2nd floor, HSR Layout", ["address"]],
  ["landmark: big water tank, Wakad", ["address"]],
  ["flat ३०२", ["address"]],
];

// Fine in free chat: ordinary astrology talk.
const FREE_OK: string[] = [
  "Hello, I want to ask about my career",
  "I was born on 14 May 1994 at 06:42 PM in Pune",
  "DOB 14-05-1994, TOB 06:42 pm, POB Mumbai",
  "My DOB is 14/05/1994 and my husband's is 23/07/1993",
  "12-08-1996, 23-07-1993",
  "14.05.1994 10.30",
  "1994-05-14 at 18:42",
  "Born 5th June 2001 around 10 30 in the morning",
  "Your fee is ₹500 for 5 minutes",
  "I paid ₹1,00,000 last year for remedies",
  "I have 3 questions about 2025 and 2026",
  "Will I get a job in the next 6 months?",
  "Is Saturn in the 7th house bad for marriage?",
  "Thank you so much! See you at the next session.",
  "Someone told me my Mangal dosha is strong",
  "Oh, one more thing — what about my brother?",
  "I'm at home now",
  "Session ref SES-482913 had an issue",
  "Rahu Ketu transit in 2025 — what changes?",
  "My lucky numbers are 3, 6 and 9",
  "Can we talk on a voice call instead?",
  "I emailed AstroRize support yesterday",
  "Signal from the universe?",
  "Please zoom into the chart photo",
  "e.g. Venus in Taurus",
  "Mr.Sharma said hi",
  "Time 7:45 am, 21.03.1990",
  "Heights 5.6 ft, weight 60 kg",
  "I am 34 years old, my wife is 31, kids are 6 and 9",
  "Can you message me on Monday?",
  "Talk to me at 5 pm",
  "I will call you at 7 tomorrow",
  "I am at home.In the evening I will ask again",
  "Thank you.In my chart, is Jupiter strong?",
  "Mercury is the messenger planet",
  "imo the reading was accurate",
  "See you at the live session",
  "Looking at outlook for 2026",
  "My time of birth is 05 30, 1994",
  "My birth time 10.30 am, date 21.03.1990, place Delhi",
  "Married on 12-08-2016 and my son was born on 23-07-2019",
  "He was born at 4:15 and she at 6:20",
  // Places, houses of the chart and numbers that are not addresses.
  "I was born in Kothrud, Pune",
  "Born in Mumbai, Maharashtra",
  "Place of birth Bengaluru, Karnataka",
  "Birth place: Shivaji Nagar, Pune",
  "I was born in Sector 17, Chandigarh",
  "Born in a village near Nashik",
  "Born near Varanasi in 1992",
  "Saturn in 10th house",
  "Lagna in 1st house, Moon in 7th house",
  "What does Jupiter in house number 7 mean?",
  "house no 10 is my career house, right?",
  "Mars and Rahu in the 8th house",
  "Is my 5th house strong? 3rd house?",
  "My Sun is at 23°45' Leo",
  "Ascendant 12 degrees Scorpio, Moon 4°10′ Pisces",
  "My salary is 600000 per year",
  "I paid 150000 for the puja",
  "Rs 100000 is my budget",
  "₹ 250000",
  "It took 2 hours on the road",
  "Planning 2 road trips in 2026",
  "Will Saturn cross my Moon in 2026?",
  "What is my career path in 2027?",
  "Is 2026 a landmark year? What is the road ahead?",
  "I have a mental block about exams",
  "Moon phase 2 of my life",
  "Rohini nakshatra pada 2",
  "In society people judge me",
  "I live with my parents",
  "I feel flat and low these days",
  "I have 3 flats and 2 shops, which to sell?",
  "My 1st main concern is marriage",
  "Order 482913 failed",
  "I will come to the live session",
  "The door is open for new chances",
  "Address my question about health please",
  "Which direction should my house entrance face?",
  "Should I buy a house in 2026 or 2027?",
  "My house is near the temple, is that good vastu?",
  "Wait 5 minutes, I am on the road",
  "Will I move to a new house near my office?",
];

// Paid chat: only phone numbers are blocked.
const PAID_BLOCKED: string[] = [
  "9876543210",
  "+91 98765 43210",
  "nine eight seven six five four three two one zero",
  "9.8.7.6.5.4.3.2.1.0",
  "call me at 080-23456789",
];
const PAID_OK: string[] = [
  "sneha.r@gmail.com",
  "https://example.com/my-chart.pdf",
  "my insta is astro_sneha",
  "find me on WhatsApp",
  "sneha@okaxis",
  "I was born on 14 May 1994 at 06:42 PM",
  "DOB 14-05-1994, 06:42 pm",
  "₹500 for 5 minutes",
  // Addresses are a FREE-chat rule only.
  "Flat 302, Shanti Apartments, MG Road, Pune 411001",
  "my address is below",
];

let failed = 0;
let passed = 0;
function check(text: string, policy: ContactPolicy, expect: ContactKind[] | "none" | "any") {
  const got = findContactDetails(text, policy);
  const ok =
    expect === "none" ? got.length === 0 : expect === "any" ? got.length > 0 : expect.every((k) => got.includes(k)) && got.length > 0;
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL [${policy}] ${JSON.stringify(text)} → got [${got.join(", ")}], expected ${Array.isArray(expect) ? `[${expect.join(", ")}]` : expect}`);
  }
}

for (const [text, expect] of FREE_BLOCKED) check(text, "FREE", expect);
for (const text of FREE_OK) check(text, "FREE", "none");
for (const text of PAID_BLOCKED) check(text, "PAID", ["phone"]);
for (const text of PAID_OK) check(text, "PAID", "none");

// What staff see of a flagged attempt: the detail itself never shows.
const MASKED: [text: string, mustNotContain: string[]][] = [
  ["call me 98765 43210 tonight", ["98765", "43210", "765"]],
  ["sneha.r@gmail.com is my mail", ["sneha", "gmail"]],
  ["sneha @ gmail . com", ["sneha", "gmail"]],
  ["sneha at gmail dot com", ["sneha", "gmail"]],
  ["pay astro.guru@okaxis", ["astro.guru", "okaxis"]],
  ["DM @astro.sneha", ["astro.sneha"]],
  ["visit www.astro-guru.com/x", ["astro-guru"]],
  ["Flat 302, MG Road, Pune 411001", ["302", "411001"]],
  ["nine eight seven six five four three two one zero", ["nine", "seven"]],
  ["९८७६५४३२१०", ["९८७", "76543"]],
];
for (const [text, hidden] of MASKED) {
  const masked = maskContact(text);
  const leaked = hidden.filter((h) => masked.toLowerCase().includes(h.toLowerCase()));
  if (!leaked.length && masked.length <= 140) passed++;
  else {
    failed++;
    console.log(`FAIL [mask] ${JSON.stringify(text)} → ${JSON.stringify(masked)} still shows ${leaked.join(", ")}`);
  }
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
