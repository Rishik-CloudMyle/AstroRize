// The HDFC bulk-payment upload file: comma-separated, no header row, one transfer per line, in the
// commonly used HDFC ENet column order. ⚠ Banks set this per corporate account: check it against the
// template HDFC gives AstroRize and change HDFC_COLUMNS here if it differs (nothing else changes).

export interface BankRow {
  /** Our reference for the transfer; comes back on the bank statement. */
  reference: string;
  beneficiaryCode: string;
  holderName: string;
  accountNumber: string;
  ifsc: string;
  amount: number;
  /** "DD/MM/YYYY" */
  date: string;
}

/** No commas, quotes or line breaks (they break the file), and nothing a spreadsheet would run as a formula. */
const clean = (v: string, max: number) => v.replace(/[",\r\n\t]+/g, " ").replace(/^[\s=+\-@]+/, "").trim().slice(0, max);
const withinHdfc = (r: BankRow) => r.ifsc.startsWith("HDFC");
const blank = () => "";

export const HDFC_COLUMNS: ((r: BankRow) => string)[] = [
  // 1 Transaction type: I = within HDFC, R = RTGS (₹2,00,000 and above), N = NEFT
  (r) => (withinHdfc(r) ? "I" : r.amount >= 200_000 ? "R" : "N"),
  // 2 Beneficiary code (needed within HDFC)
  (r) => (withinHdfc(r) ? clean(r.beneficiaryCode, 32) : ""),
  // 3 Account number, 4 amount, 5 beneficiary name
  (r) => r.accountNumber,
  (r) => r.amount.toFixed(2),
  (r) => clean(r.holderName, 40),
  // 6 drawee location, 7 print location, 8–12 beneficiary address
  blank, blank, blank, blank, blank, blank, blank,
  // 13 instruction reference, 14 customer reference
  (r) => r.reference,
  (r) => r.reference,
  // 15–21 payment details
  () => "AstroRize payout",
  blank, blank, blank, blank, blank, blank,
  // 22 cheque number, 23 transaction date, 24 MICR
  blank,
  (r) => r.date,
  blank,
  // 25 IFSC, 26 bank name, 27 branch, 28 e-mail
  (r) => r.ifsc,
  blank, blank, blank,
];

export const hdfcFile = (rows: BankRow[]) => rows.map((r) => HDFC_COLUMNS.map((c) => c(r)).join(",")).join("\r\n") + "\r\n";
