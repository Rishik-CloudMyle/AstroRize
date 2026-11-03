import { rupee } from "./format";
import type { ApplicationKnown, WizardStep } from "./types";

// The 13-step application wizard (logic.js → WIZ). The step layout is fixed here;
// the values come from what the platform already knows about the astrologer
// (GET /portal/application → known) with the astrologer's saved edits on top.
//
// Steps 5, 8 and 10 are file uploads. There is no file-upload API yet, so those steps say HR
// collects the files during review instead of showing sample files. What must be filled before
// the application can be submitted is decided by the API (backend/src/lib/application.ts).

/** "+91 98765 43242" from a 10-digit mobile number. */
function phoneLabel(phone: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

/** "Age 44 ✓" from a "DD / MM / YYYY" date of birth, or nothing while it is incomplete. */
export function ageChip(dob: string, today = new Date()): string | undefined {
  const m = dob.match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/);
  if (!m) return undefined;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  if (age < 0 || age > 120) return undefined;
  return age >= 18 ? `Age ${age} ✓` : `Age ${age} — under 18`;
}

export function buildWizardSteps(known: ApplicationKnown): WizardStep[] {
  const skills = known.skills.join(", ");
  return [
    {
      short: "Basics",
      title: "Account basics",
      blurb: "Your mobile number is fixed from registration. Email is optional but speeds up payout verification.",
      typable: true,
      fields: [
        { label: "Mobile number", value: phoneLabel(known.phone), chip: "Read-only", readOnly: true },
        { label: "Email (optional)", value: known.email ?? "" },
        { label: "Preferred languages", value: known.languages.join(", "), chip: "min 1" },
      ],
      note: "Choose from the languages we support. At least one is required before you can continue.",
    },
    {
      short: "Personal",
      title: "Personal details",
      blurb: "Legal name as it appears on your KYC document. Applicants must be 18 or older.",
      typable: true,
      fields: [
        { label: "Full name", value: "", placeholder: "As on your KYC document" },
        { label: "Date of birth", value: "", placeholder: "DD / MM / YYYY" },
        { label: "City", value: "" },
        { label: "State", value: "", chip: "From list" },
      ],
      note: "No photograph is needed here — you add your photo at step 10, Media.",
    },
    {
      short: "Education",
      title: "Education",
      blurb: "At least one row is required before submission. Add as many as apply.",
      typable: true,
      fields: [
        { label: "Degree", value: "" },
        { label: "Institution", value: "" },
        { label: "Year", value: "", placeholder: "YYYY" },
      ],
      note: "Add every qualification that applies. You can add more rows any time before you submit.",
    },
    {
      short: "Experience",
      title: "Experience",
      blurb: "Years practising, prior platforms and the areas you actually want to be routed for.",
      typable: true,
      fields: [
        { label: "Years of experience", value: String(known.years), chip: "0–60" },
        { label: "Prior platforms", value: "" },
        { label: "Specialties", value: skills },
      ],
      note: "Specialties help customers find you. Your skills are chosen separately, at step 6.",
    },
    {
      short: "Certifications",
      title: "Certifications",
      blurb: "PDF, JPG or PNG. Each file is scanned for safety before it is attached to your application.",
      typable: false,
      fields: [{ label: "Certificates", value: "HR collects these during review", chip: "Later" }],
      note: "Uploading files here isn't available yet. HR will ask you for your certificates while reviewing your application.",
    },
    {
      short: "Skills",
      title: "Skills",
      blurb: "Pick from the skills list. At least one is required.",
      typable: false,
      fields: [{ label: "Selected", value: skills, chip: `${known.skills.length} selected` }],
      note: "New skills are added to the list from time to time — check back if yours is missing.",
    },
    {
      short: "Bank",
      title: "Bank & payout",
      blurb: "Your account number is masked as soon as you save it and is stored securely.",
      typable: true,
      fields: [
        { label: "Account holder", value: "" },
        { label: "Account number", value: "", chip: "Masked" },
        { label: "IFSC", value: "", placeholder: "e.g. HDFC0001234" },
      ],
      note: "Entering your IFSC fills in the bank name automatically, so typos show up before you submit.",
    },
    {
      short: "KYC",
      title: "KYC documents",
      blurb: "Choose your document type. Status badges update as verification progresses.",
      typable: false,
      fields: [{ label: "KYC documents (Aadhaar, PAN)", value: "HR collects these during review", chip: "Later" }],
      note: "Uploading documents here isn't available yet. HR will ask you for your KYC documents while reviewing your application.",
    },
    {
      short: "Bio",
      title: "Resume & bio",
      blurb: "A word counter and a claims check run as you type. Warnings do not block you until you submit.",
      typable: true,
      fields: [
        // Value and chip are filled in live from the bio being edited on the Profile page.
        { label: "Bio", value: "", chip: "" },
        { label: "Resume (optional)", value: "", placeholder: "File name" },
      ],
      note: "The claims check flags guaranteed-outcome language such as “100% accurate” before your bio goes for review.",
    },
    {
      short: "Media",
      title: "Photo, gallery & intro video",
      blurb: "Primary photo goes through a cropper. Intro video must run 60–90 seconds.",
      typable: false,
      fields: [
        { label: "Primary photo", value: "HR collects this during review", chip: "Later" },
        { label: "Intro video", value: "HR collects this during review", chip: "Later" },
      ],
      note: "Uploading photos and videos here isn't available yet. HR will ask you for them while reviewing your application.",
    },
    {
      short: "Pricing",
      title: "Pricing request",
      blurb: "Request a per-minute rate for each modality you want to offer. Emergency pricing is never set here.",
      typable: true,
      fields: [
        { label: "Voice ₹/min", value: rupee(known.price) },
        { label: "Chat ₹/min", value: rupee(known.chatPrice) },
        { label: "Video ₹/min", value: rupee(known.videoRate) },
        { label: "Fixed Session interest", value: "", placeholder: "e.g. Yes — 15, 30, 45, 60 min" },
      ],
      note: "Rates go live only after approval. Emergency pricing is configured later, from the dashboard, with Finance notified.",
    },
    {
      short: "Readiness",
      title: "Readiness declaration",
      blurb: "Self-declaration about your equipment and connection. Every box must be ticked to submit.",
      typable: true,
      fields: [
        { label: "Quiet room, no interruptions", value: "", check: true },
        { label: "Headset with microphone", value: "", check: true },
        { label: "Broadband ≥ 5 Mbps up", value: "", check: true },
        { label: "Backup connection", value: "", check: true },
      ],
      note: "You can submit once every declaration is ticked — if one is missing, we tell you which.",
    },
    {
      short: "Review",
      title: "Review & submit",
      blurb: "Check that every step is complete, confirm your details are accurate, then submit.",
      typable: true,
      fields: [
        // Filled in by the wizard from what the API says is still missing.
        { label: "Steps complete", value: "", readOnly: true },
        { label: "Accuracy confirmation", value: "", check: true },
      ],
      note: "Once you submit, your application goes to our team for review and the banner at the top of the portal updates straight away.",
    },
  ];
}
