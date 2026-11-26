import { api } from "@/lib/api/client";

// The earnings statement as an Excel file, for the astrologer (their own earnings) and for staff (one
// astrologer's, from Astrologer payouts). Every column says what it is, the Mode column is wide enough to
// read, and the totals (gross, earnings, TDS, net payable) are at the bottom and in the header block.
// The sheet is locked so the figures can't be edited by accident.

export interface ExportRow {
  /** "23 Nov 2026" */
  date: string;
  /** "14:05" (IST) */
  time?: string;
  session: string;
  kind: string;
  mode: string;
  minutes: number;
  /** What customers paid for it before the split (₹); free-call compensation: free minutes at the astrologer's rate. */
  gross: number;
  sharePct: number | null;
  /** The astrologer's earnings from the line (₹). */
  amount: number;
  fundedBy: "CUSTOMER" | "PLATFORM";
  /** Staff export only: where the line is in the payout process. */
  payoutStatus?: string | null;
}

export interface ExportPayout {
  cycle: string;
  earned: number;
  tds: number;
  sent: number;
  state: string;
  utr: string | null;
  on: string;
}

export interface ExportInput {
  astrologer: string;
  periodLabel: string;
  /** "Daily" | "Weekly" | "15 days" | "Monthly" */
  rangeLabel: string;
  tdsPct: number;
  rows: ExportRow[];
  payouts?: ExportPayout[];
  /** Staff export: adds a "Payout status" column. */
  withStatus?: boolean;
  /** Payout statements: the TDS actually applied (thresholds can make it differ from the rate), extra header lines and, for free-call batches, totals over AstroRize-paid lines. */
  tdsAmount?: number;
  details?: [string, string][];
  includePlatform?: boolean;
}

const TYPE: Record<string, string> = {
  voice: "Consultation",
  chat: "Consultation",
  video: "Consultation",
  emergency: "Consultation (Instant Call)",
  gift: "Gift",
  free_call: "Free-call compensation",
  welcome: "Free welcome call",
  adjustment: "Adjustment",
  refund_adjustment: "Refund adjustment",
  incentive: "Incentive",
  deduction: "Deduction",
};

/** Totals the file (and the on-screen summaries) use: customer-paid lines only, free-call compensation apart. */
export function statementTotals(rows: ExportRow[], tdsPct: number, includePlatform = false) {
  const paid = rows.filter((r) => includePlatform || r.fundedBy === "CUSTOMER");
  // Incentives and deductions Finance added: part of the earnings, not of what customers paid.
  const adjustments = paid.filter((r) => r.kind === "incentive" || r.kind === "deduction").reduce((s, r) => s + r.amount, 0);
  const gross = paid.reduce((s, r) => s + r.gross, 0);
  const earned = paid.reduce((s, r) => s + r.amount, 0);
  const tds = Math.round((Math.max(0, earned) * tdsPct) / 100);
  return {
    gross,
    commission: gross - (earned - adjustments),
    adjustments,
    earned,
    tds,
    net: earned - tds,
    freeCompensation: rows.filter((r) => !includePlatform && r.fundedBy === "PLATFORM").reduce((s, r) => s + r.amount, 0),
    minutes: paid.reduce((s, r) => s + r.minutes, 0),
  };
}

const slug = (s: string) => s.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");

export async function downloadStatementXlsx(input: ExportInput): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const base = statementTotals(input.rows, input.tdsPct, input.includePlatform);
  const t = input.tdsAmount === undefined ? base : { ...base, tds: input.tdsAmount, net: base.earned - input.tdsAmount };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Statement");
  const cols = input.withStatus ? 11 : 10;
  const money = "#,##0";

  const title = ws.addRow(["AstroRize — earnings statement"]);
  title.font = { bold: true, size: 14 };
  ws.addRow(["Astrologer", input.astrologer]);
  ws.addRow(["Period", `${input.periodLabel} (${input.rangeLabel})`]);
  ws.addRow(["Generated", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST"]);
  for (const d of input.details ?? []) ws.addRow(d);
  ws.addRow([]);

  const head = ws.addRow([
    "Date",
    "Time (IST)",
    "Session ID",
    "Type",
    "Mode",
    "Duration (minutes)",
    "Gross before GST (₹)",
    "Your share (%)",
    "Your earnings (₹)",
    "Paid by",
    ...(input.withStatus ? ["Payout status"] : []),
  ]);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 34;
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E3B5" } };
    c.border = { bottom: { style: "thin" } };
  });
  const headerRow = head.number;

  for (const r of input.rows) {
    const row = ws.addRow([
      r.date,
      r.time ?? "",
      r.session,
      TYPE[r.kind] ?? r.kind,
      r.mode,
      r.minutes,
      r.gross,
      r.sharePct ?? "",
      r.amount,
      r.fundedBy === "PLATFORM" ? "AstroRize (free-call compensation)" : "Customer",
      ...(input.withStatus ? [r.payoutStatus ?? "Not prepared yet"] : []),
    ]);
    row.getCell(7).numFmt = money;
    row.getCell(9).numFmt = money;
  }
  if (input.rows.length === 0) ws.addRow(["No sessions in this period."]);

  ws.addRow([]);
  const sum = (label: string, value: number, note = "") => {
    const row = ws.addRow(["", "", "", "", label, "", "", "", value, note]);
    row.getCell(5).font = { bold: true };
    row.getCell(9).font = { bold: true };
    row.getCell(9).numFmt = money;
    row.getCell(5).alignment = { horizontal: "right" };
    return row;
  };
  sum("Total gross (before GST)", t.gross, "customers' charge without GST, before the split").getCell(9).value = t.gross;
  sum("Platform commission", t.commission, "AstroRize's share");
  if (t.adjustments) sum("Incentives and deductions", t.adjustments, "added by AstroRize Finance");
  sum("Total earnings (your share)", t.earned, "what you earned in the period");
  sum(`TDS at ${input.tdsPct}%`, -t.tds, "withheld when paid");
  const net = sum("Net payable after TDS", t.net, "what is sent to you");
  net.eachCell({ includeEmpty: false }, (c) => {
    c.border = { top: { style: "thin" }, bottom: { style: "double" } };
  });
  if (t.freeCompensation) sum("Free-call compensation", t.freeCompensation, "paid separately by AstroRize; not in the totals above");

  [14, 11, 16, 26, 36, 12, 24, 10, 18, 34, 22].slice(0, cols).forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: headerRow }];

  if (input.payouts?.length) {
    const pw = wb.addWorksheet("Payouts");
    const ph = pw.addRow(["Payout cycle", "Earned (₹)", "TDS (₹)", "Sent (₹)", "Status", "Bank reference (UTR)", "Date"]);
    ph.font = { bold: true };
    ph.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E3B5" } }));
    for (const p of input.payouts) pw.addRow([p.cycle, p.earned, p.tds, p.sent, p.state, p.utr ?? "", p.on]);
    [44, 12, 10, 12, 14, 24, 14].forEach((w, i) => (pw.getColumn(i + 1).width = w));
    await pw.protect(crypto.randomUUID(), { selectLockedCells: true, selectUnlockedCells: true });
  }

  await ws.protect(crypto.randomUUID(), { selectLockedCells: true, selectUnlockedCells: true, sort: false, autoFilter: false });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `astrorize-statement-${slug(input.astrologer)}-${slug(input.periodLabel)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fetches one astrologer's statement for a payout batch and downloads it as Excel. */
export async function downloadPayoutStatement(path: string): Promise<void> {
  const { statement } = await api.get<{ statement: ExportInput }>(path);
  await downloadStatementXlsx(statement);
}
