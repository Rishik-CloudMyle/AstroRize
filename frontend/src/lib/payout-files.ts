// Files Finance downloads: a plain Excel sheet (text stays text, so account numbers keep every digit)
// and the bank upload file exactly as the API made it.

function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadTextFile = (name: string, content: string) => save(name, new Blob([content], { type: "text/csv;charset=utf-8" }));

export async function downloadSheet(name: string, title: string, headers: string[], rows: (string | number)[][], totals: (string | number)[][] = []) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title);
  const head = ws.addRow(headers);
  head.font = { bold: true };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E3B5" } }));
  for (const r of rows) ws.addRow(r);
  if (totals.length) {
    ws.addRow([]);
    for (const t of totals) ws.addRow(t).font = { bold: true };
  }
  headers.forEach((h, i) => (ws.getColumn(i + 1).width = Math.min(44, Math.max(h.length + 4, ...rows.map((r) => String(r[i] ?? "").length + 2)))));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  save(name, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
