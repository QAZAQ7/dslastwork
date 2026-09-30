import { google } from "googleapis";

function normalizedGoogleKey(raw: string) {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  if (!key.includes("-----BEGIN PRIVATE KEY-----") || !key.includes("-----END PRIVATE KEY-----")) {
    throw new Error("GOOGLE_PRIVATE_KEY format is invalid.");
  }
  return key;
}

export function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Google Sheets credentials are missing.");

  const auth = new google.auth.JWT({
    email,
    key: normalizedGoogleKey(rawKey),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function upsert(tab: "Sales" | "Expenses", reference: string, headers: string[], values: unknown[]) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_ID is missing.");
  const sheets = getSheetsClient();
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:Z` });
  let rows = existing.data.values ?? [];

  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    rows = [headers];
  }

  const index = rows.findIndex((row, i) => i > 0 && row?.[0] === reference);
  if (index >= 1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A${index + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [values] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:Z`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [values] },
    });
  }
}

export async function syncSale(row: any) {
  const headers = ["Reference","Submission time","Salesperson","Customer","Project","Description","Amount","Proposed Richard %","Proposed Anastasia %","Proposed Jean-Claude %","Approved Richard %","Approved Anastasia %","Approved Jean-Claude %","Richard commission","Anastasia commission","Jean-Claude commission","Status"];
  const values = [row.reference,row.submitted_at,row.salesperson_code,row.customer,row.project,row.description,Number(row.amount),Number(row.proposed_richard),Number(row.proposed_anastasia),Number(row.proposed_jean),row.approved_richard ?? "",row.approved_anastasia ?? "",row.approved_jean ?? "",Number(row.commission_richard ?? 0),Number(row.commission_anastasia ?? 0),Number(row.commission_jean ?? 0),row.status];
  await upsert("Sales", row.reference, headers, values);
}

export async function syncExpense(row: any) {
  const headers = ["Reference","Submission time","Reporter","Description","Category","Amount","Proposed allocation","Final allocation","Status"];
  const values = [row.reference,row.submitted_at,row.reporter_code,row.description,row.category,Number(row.amount),row.proposed_allocation,row.final_allocation ?? "",row.status];
  await upsert("Expenses", row.reference, headers, values);
}
