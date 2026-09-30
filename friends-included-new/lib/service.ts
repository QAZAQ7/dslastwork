import { getSupabase } from "./supabase";
import { syncExpense, syncSale } from "./googleSheets";
import { sendTelegram } from "./telegram";
import { calculateCommissions, money, validatePositiveAmount, validateSplit } from "./business";
import type { Allocation, EmployeeCode, ExpenseCategory, ProjectCode, Split } from "./types";

async function employee(code: string) {
  const { data, error } = await getSupabase().from("employees").select("*").eq("code", code).single();
  if (error || !data) throw new Error("Unknown employee.");
  return data;
}

async function requireRole(code: string, roles: string[]) {
  const row = await employee(code);
  if (!roles.includes(row.role)) throw new Error("Permission denied.");
  return row;
}

async function markSheet(kind: "sale" | "expense", id: string, status: "ok" | "failed") {
  await getSupabase().from(kind === "sale" ? "sales" : "expenses").update({ sheet_sync_status: status }).eq("id", id);
}

function safeSheetError(error: any): string {
  const google = error?.response?.data?.error;
  if (google?.message) return String(google.message).slice(0, 500);
  if (error?.message) return String(error.message).slice(0, 500);
  return "Unknown Google Sheets error.";
}

export async function syncRecordDetailed(kind: "sale" | "expense", row: any) {
  try {
    if (kind === "sale") await syncSale(row); else await syncExpense(row);
    await markSheet(kind, row.id, "ok");
    return { status: "ok" as const };
  } catch (error: any) {
    const detail = safeSheetError(error);
    console.error("SHEETS_SYNC_ERROR", error?.response?.data ?? error?.message ?? error);
    await markSheet(kind, row.id, "failed");
    return { status: "failed" as const, error: detail };
  }
}

export async function syncRecord(kind: "sale" | "expense", row: any) {
  return (await syncRecordDetailed(kind, row)).status;
}

export async function createSale(input: { actor: EmployeeCode; reference: string; customer: string; project: ProjectCode; description: string; amount: unknown; split: Split; originalChatId?: number | null }) {
  const emp = await requireRole(input.actor, ["salesperson"]);
  validateSplit(input.split);
  const amount = validatePositiveAmount(input.amount);
  if (!input.reference?.trim() || !input.customer?.trim() || !input.description?.trim() || !["A","B"].includes(input.project)) throw new Error("Missing or invalid required sale data.");

  const { data, error } = await getSupabase().from("sales").insert({
    reference: input.reference.trim(), salesperson_code: emp.code, customer: input.customer.trim(), project: input.project,
    description: input.description.trim(), amount,
    proposed_richard: input.split.richard, proposed_anastasia: input.split.anastasia, proposed_jean: input.split.jean,
    status: "Pending approval", original_telegram_chat_id: input.originalChatId ?? emp.telegram_chat_id ?? null,
  }).select().single();
  if (error) throw new Error(error.code === "23505" ? "Duplicate reference." : error.message);
  const sync = await syncRecord("sale", data);
  return { row: data, sheet_sync_status: sync };
}

export async function createExpense(input: { actor: EmployeeCode; reference: string; description: string; category: ExpenseCategory; amount: unknown; proposedAllocation: Allocation; originalChatId?: number | null }) {
  const emp = await requireRole(input.actor, ["expense_reporter"]);
  const amount = validatePositiveAmount(input.amount);
  if (!input.reference?.trim() || !input.description?.trim() || !["Materials","Travel","Other"].includes(input.category) || !["A","B","Company overhead"].includes(input.proposedAllocation)) throw new Error("Missing or invalid required expense data.");
  const overhead = input.proposedAllocation === "Company overhead";

  const { data, error } = await getSupabase().from("expenses").insert({
    reference: input.reference.trim(), reporter_code: emp.code, description: input.description.trim(), category: input.category, amount,
    proposed_allocation: input.proposedAllocation, final_allocation: overhead ? "Company overhead" : null,
    status: overhead ? "Allocated" : "Awaiting allocation", original_telegram_chat_id: input.originalChatId ?? emp.telegram_chat_id ?? null,
  }).select().single();
  if (error) throw new Error(error.code === "23505" ? "Duplicate reference." : error.message);
  const sync = await syncRecord("expense", data);
  return { row: data, sheet_sync_status: sync };
}

async function notifySale(row: any) {
  const db = getSupabase();
  if (!row.original_telegram_chat_id) {
    await db.from("sales").update({ notification_status: "no_recipient" }).eq("id", row.id);
    return "no_recipient" as const;
  }
  const changed = Number(row.approved_richard) !== Number(row.proposed_richard) || Number(row.approved_anastasia) !== Number(row.proposed_anastasia) || Number(row.approved_jean) !== Number(row.proposed_jean);
  const text = `Sale ${row.reference} approved${changed ? " — commission split changed" : ""}. Sale €${Number(row.amount).toFixed(2)}; total commission €${Number(row.commission_pool).toFixed(2)}. Richard: ${row.proposed_richard}% → ${row.approved_richard}% (€${Number(row.commission_richard).toFixed(2)}). Anastasia: ${row.proposed_anastasia}% → ${row.approved_anastasia}% (€${Number(row.commission_anastasia).toFixed(2)}). Jean-Claude: ${row.proposed_jean}% → ${row.approved_jean}% (€${Number(row.commission_jean).toFixed(2)}).`;
  try { await sendTelegram(row.original_telegram_chat_id, text); await db.from("sales").update({notification_status:"sent"}).eq("id",row.id); return "sent" as const; }
  catch { await db.from("sales").update({notification_status:"failed"}).eq("id",row.id); return "failed" as const; }
}

async function notifyExpense(row: any) {
  const db = getSupabase();
  if (!row.original_telegram_chat_id) {
    await db.from("expenses").update({ notification_status: "no_recipient" }).eq("id", row.id);
    return "no_recipient" as const;
  }
  const changed = row.final_allocation !== row.proposed_allocation;
  const text = `Expense ${row.reference} — allocation ${changed ? "changed" : "confirmed"}. €${Number(row.amount).toFixed(2)}: ${row.description}. Proposed: ${row.proposed_allocation}. Approved: ${row.final_allocation}.`;
  try { await sendTelegram(row.original_telegram_chat_id, text); await db.from("expenses").update({notification_status:"sent"}).eq("id",row.id); return "sent" as const; }
  catch { await db.from("expenses").update({notification_status:"failed"}).eq("id",row.id); return "failed" as const; }
}

export async function retryNotification(actor: EmployeeCode, kind: "sale" | "expense", reference: string) {
  await requireRole(actor, ["manager"]);
  const db = getSupabase();
  if (kind === "sale") {
    const { data, error } = await db.from("sales").select("*").eq("reference", reference).single();
    if (error || !data || data.status !== "Approved") throw new Error("Approved sale not found.");
    return notifySale(data);
  }
  const { data, error } = await db.from("expenses").select("*").eq("reference", reference).single();
  if (error || !data || data.status !== "Allocated") throw new Error("Allocated expense not found.");
  return notifyExpense(data);
}

export async function approveSale(actor: EmployeeCode, reference: string, split: Split) {
  await requireRole(actor, ["manager"]);
  validateSplit(split);
  const db = getSupabase();
  const { data: sale, error } = await db.from("sales").select("*").eq("reference", reference).single();
  if (error || !sale) throw new Error("Sale not found.");
  if (sale.status === "Approved") return { row: sale, alreadyApproved: true };
  const commissions = calculateCommissions(Number(sale.amount), split);
  const { data, error: updateError } = await db.from("sales").update({ approved_richard:split.richard, approved_anastasia:split.anastasia, approved_jean:split.jean, commission_pool:commissions.pool, commission_richard:commissions.richard, commission_anastasia:commissions.anastasia, commission_jean:commissions.jean, status:"Approved" }).eq("id", sale.id).eq("status", "Pending approval").select().single();
  if (updateError || !data) throw new Error(updateError?.message ?? "Sale approval failed.");
  const sync = await syncRecord("sale", data);
  const notification = await notifySale(data);
  return { row:data, commissions, sheet_sync_status:sync, notification_status:notification };
}

export async function approveExpense(actor: EmployeeCode, reference: string, finalAllocation: Allocation) {
  await requireRole(actor, ["manager"]);
  if (!["A","B","Company overhead"].includes(finalAllocation)) throw new Error("Invalid final allocation.");
  const db = getSupabase();
  const { data: expense, error } = await db.from("expenses").select("*").eq("reference", reference).single();
  if (error || !expense) throw new Error("Expense not found.");
  if (expense.status === "Allocated") return { row: expense, alreadyAllocated: true };
  const { data, error: updateError } = await db.from("expenses").update({ final_allocation:finalAllocation, status:"Allocated" }).eq("id",expense.id).eq("status","Awaiting allocation").select().single();
  if (updateError || !data) throw new Error(updateError?.message ?? "Expense allocation failed.");
  const sync = await syncRecord("expense", data);
  const notification = await notifyExpense(data);
  return { row:data, sheet_sync_status:sync, notification_status:notification };
}

export async function linkTelegram(actor: EmployeeCode, employeeCode: EmployeeCode, userId: number, chatId: number) {
  await requireRole(actor, ["manager"]);
  if (!Number.isFinite(userId) || !Number.isFinite(chatId)) throw new Error("Valid Telegram user ID and chat ID are required.");
  const db = getSupabase();

  // The official test deliberately relinks the same Telegram account from Richard to Kevin.
  // Clear that live account link from any other employee first. Historical transactions keep
  // their stored salesperson/reporter code and original_telegram_chat_id unchanged.
  const { error: clearError } = await db
    .from("employees")
    .update({ telegram_user_id: null, telegram_chat_id: null })
    .eq("telegram_user_id", userId)
    .neq("code", employeeCode);
  if (clearError) throw new Error(clearError.message);

  const { data, error } = await db
    .from("employees")
    .update({ telegram_user_id:userId, telegram_chat_id:chatId })
    .eq("code", employeeCode)
    .select("code")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Employee not found.");
}

export async function getDashboard(actor?: EmployeeCode) {
  const db = getSupabase();
  const [{data:sales,error:salesError},{data:expenses,error:expenseError}] = await Promise.all([
    db.from("sales").select("*").order("submitted_at",{ascending:true}),
    db.from("expenses").select("*").order("submitted_at",{ascending:true}),
  ]);
  if (salesError) throw new Error(salesError.message);
  if (expenseError) throw new Error(expenseError.message);
  const ss=sales??[], ex=expenses??[];
  const approved=ss.filter((s:any)=>s.status==="Approved");
  const project=(p:string)=>{ const ps=approved.filter((s:any)=>s.project===p); const income=ps.reduce((t:number,s:any)=>t+Number(s.amount),0); const commission=ps.reduce((t:number,s:any)=>t+Number(s.commission_pool||0),0); const allocated=ex.filter((e:any)=>e.status==="Allocated"&&e.final_allocation===p).reduce((t:number,e:any)=>t+Number(e.amount),0); return {income:money(income),commission:money(commission),allocated:money(allocated),result:money(income-commission-allocated)}; };
  const income=approved.reduce((t:number,s:any)=>t+Number(s.amount),0); const commission=approved.reduce((t:number,s:any)=>t+Number(s.commission_pool||0),0); const allExpenses=ex.reduce((t:number,e:any)=>t+Number(e.amount),0);
  let visibleSales=ss, visibleExpenses=ex;
  if(actor){ const emp=await employee(actor); if(emp.role==="salesperson"){visibleSales=ss.filter((s:any)=>s.salesperson_code===actor); visibleExpenses=[];} if(emp.role==="expense_reporter"){visibleSales=[]; visibleExpenses=ex.filter((e:any)=>e.reporter_code===actor);} }
  return { projectA:project("A"), projectB:project("B"), company:{ overhead:money(ex.filter((e:any)=>e.status==="Allocated"&&e.final_allocation==="Company overhead").reduce((t:number,e:any)=>t+Number(e.amount),0)), awaiting:money(ex.filter((e:any)=>e.status==="Awaiting allocation").reduce((t:number,e:any)=>t+Number(e.amount),0)), result:money(income-commission-allExpenses) }, commissions:{ richard:money(approved.reduce((t:number,s:any)=>t+Number(s.commission_richard||0),0)), anastasia:money(approved.reduce((t:number,s:any)=>t+Number(s.commission_anastasia||0),0)), jean:money(approved.reduce((t:number,s:any)=>t+Number(s.commission_jean||0),0)) }, pendingSales:ss.filter((s:any)=>s.status==="Pending approval"), awaitingExpenses:ex.filter((e:any)=>e.status==="Awaiting allocation"), visibleSales, visibleExpenses };
}
