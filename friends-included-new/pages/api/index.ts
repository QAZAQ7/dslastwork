import type { NextApiRequest, NextApiResponse } from "next";
import { approveExpense, approveSale, createExpense, createSale, getDashboard, linkTelegram, unlinkTelegram, retryNotification, syncRecordDetailed } from "../../lib/service";
import { getSupabase } from "../../lib/supabase";
import type { EmployeeCode } from "../../lib/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      if (req.query.action === "dashboard") return res.status(200).json(await getDashboard(String(req.query.actor || "") as EmployeeCode));
      return res.status(405).json({ ok:false, error:"Method not allowed" });
    }
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const b=req.body??{};
    if(b.action==="sale"){ const result=await createSale({actor:b.actor,reference:b.reference,customer:b.customer,project:b.project,description:b.description,amount:b.amount,split:{richard:Number(b.proposed_richard),anastasia:Number(b.proposed_anastasia),jean:Number(b.proposed_jean)}}); return res.status(200).json({ok:true,reference:result.row.reference,status:result.row.status,sheet_sync_status:result.sheet_sync_status}); }
    if(b.action==="expense"){ const result=await createExpense({actor:b.actor,reference:b.reference,description:b.description,category:b.category,amount:b.amount,proposedAllocation:b.proposed_allocation}); return res.status(200).json({ok:true,reference:result.row.reference,status:result.row.status,sheet_sync_status:result.sheet_sync_status}); }
    if(b.action==="approveSale"){ const result=await approveSale(b.actor,b.reference,{richard:Number(b.approved_richard),anastasia:Number(b.approved_anastasia),jean:Number(b.approved_jean)}); return res.status(200).json({ok:true,...result}); }
    if(b.action==="approveExpense"){ const result=await approveExpense(b.actor,b.reference,b.final_allocation); return res.status(200).json({ok:true,...result}); }
    if(b.action==="linkTelegram"){ await linkTelegram(b.actor,b.employee_code,Number(b.telegram_user_id),Number(b.telegram_chat_id)); return res.status(200).json({ok:true}); }
    if(b.action==="unlinkTelegram"){ const result=await unlinkTelegram(b.actor,b.employee_code,Number(b.telegram_user_id)); return res.status(200).json({ok:true,...result}); }
    if(b.action==="retrySync"){
      if(b.actor!=="svetlana") throw new Error("Permission denied.");
      const table=b.kind==="sale"?"sales":b.kind==="expense"?"expenses":null; if(!table) throw new Error("Invalid sync kind.");
      const {data,error}=await getSupabase().from(table).select("*").eq("reference",b.reference).single(); if(error||!data) throw new Error("Record not found.");
      const result=await syncRecordDetailed(b.kind,data); return res.status(200).json({ok:result.status==="ok",sheet_sync_status:result.status,error:result.error??null});
    }
    if(b.action==="retryNotification"){
      if(b.kind!=="sale" && b.kind!=="expense") throw new Error("Invalid notification kind.");
      const status=await retryNotification(b.actor,b.kind,b.reference);
      return res.status(200).json({ok:status==="sent",notification_status:status});
    }
    return res.status(400).json({ok:false,error:"Unknown action"});
  } catch (error:any) { return res.status(400).json({ok:false,error:error?.message??"Unknown error"}); }
}
