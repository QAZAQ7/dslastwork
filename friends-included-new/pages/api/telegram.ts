import type { NextApiRequest, NextApiResponse } from "next";
import { createExpense, createSale } from "../../lib/service";
import { getSupabase } from "../../lib/supabase";
import { sendTelegram } from "../../lib/telegram";

const parts=(text:string)=>text.split("|").map(v=>v.trim());

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  try{
    if(req.method!=="POST") return res.status(405).json({ok:false});
    const secret=req.headers["x-telegram-bot-api-secret-token"];
    if(process.env.TELEGRAM_WEBHOOK_SECRET && secret!==process.env.TELEGRAM_WEBHOOK_SECRET) return res.status(403).json({ok:false});
    const msg=req.body?.message;
    if(!msg?.from?.id||!msg?.chat?.id||!msg?.text) return res.status(200).json({ok:true});
    const text=String(msg.text).trim();
    const db=getSupabase();
    const {data:emp}=await db.from("employees").select("*").eq("telegram_user_id",msg.from.id).maybeSingle();

    if(text==="/start"){
      if(!emp){ await sendTelegram(msg.chat.id,`Friends Included bot ready.\nTelegram user ID: ${msg.from.id}\nTelegram chat ID: ${msg.chat.id}\nAsk the manager to link these IDs to an employee.`); return res.status(200).json({ok:true}); }
      await db.from("employees").update({telegram_chat_id:msg.chat.id}).eq("id",emp.id);
      await sendTelegram(msg.chat.id,"Friends Included bot ready.\n\n/sale | REF | Customer | A/B | Description | Amount | Richard% | Anastasia% | Jean%\n\n/expense | REF | Description | Materials/Travel/Other | Amount | A/B/Company overhead");
      return res.status(200).json({ok:true});
    }

    if(!emp){ await sendTelegram(msg.chat.id,"Your Telegram account is not linked. Send /start and give the shown IDs to the manager."); return res.status(200).json({ok:true}); }
    await db.from("employees").update({telegram_chat_id:msg.chat.id}).eq("id",emp.id);

    if(text.startsWith("/sale")){
      const p=parts(text); if(p.length!==9) throw new Error("Use: /sale | REF | Customer | A/B | Description | Amount | Richard% | Anastasia% | Jean%");
      const result=await createSale({actor:emp.code,reference:p[1],customer:p[2],project:p[3] as "A"|"B",description:p[4],amount:p[5],split:{richard:Number(p[6]),anastasia:Number(p[7]),jean:Number(p[8])},originalChatId:msg.chat.id});
      await sendTelegram(msg.chat.id,`Recorded ${result.row.reference}: €${Number(result.row.amount).toFixed(2)}, Project ${result.row.project}, status ${result.row.status}. Sheet sync: ${result.sheet_sync_status}.`);
      return res.status(200).json({ok:true});
    }
    if(text.startsWith("/expense")){
      const p=parts(text); if(p.length!==6) throw new Error("Use: /expense | REF | Description | Materials/Travel/Other | Amount | A/B/Company overhead");
      const result=await createExpense({actor:emp.code,reference:p[1],description:p[2],category:p[3] as "Materials"|"Travel"|"Other",amount:p[4],proposedAllocation:p[5] as "A"|"B"|"Company overhead",originalChatId:msg.chat.id});
      await sendTelegram(msg.chat.id,`Recorded ${result.row.reference}: €${Number(result.row.amount).toFixed(2)}, proposed ${result.row.proposed_allocation}, status ${result.row.status}. Sheet sync: ${result.sheet_sync_status}.`);
      return res.status(200).json({ok:true});
    }
    await sendTelegram(msg.chat.id,"Unknown command. Send /start for instructions.");
    return res.status(200).json({ok:true});
  }catch(error:any){ try{const chat=req.body?.message?.chat?.id;if(chat)await sendTelegram(chat,`Error: ${error?.message??"Unknown error"}`);}catch{} return res.status(200).json({ok:true}); }
}
