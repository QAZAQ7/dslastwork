import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabase } from "../../lib/supabase";
import { getSheetsClient } from "../../lib/googleSheets";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="GET") return res.status(405).json({ok:false,error:"Method not allowed"});

  const result:any={
    ok:true,
    supabase:{configured:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),reachable:false},
    googleSheets:{configured:Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY&&process.env.GOOGLE_SHEETS_ID),reachable:false},
    telegram:{configured:Boolean(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_WEBHOOK_SECRET)},
  };

  try{
    const {error}=await getSupabase().from("employees").select("code",{count:"exact",head:true});
    if(error) throw error;
    result.supabase.reachable=true;
  }catch(e:any){
    result.ok=false;
    result.supabase.error=String(e?.message||"Supabase check failed").slice(0,300);
  }

  if(result.googleSheets.configured){
    try{
      const sheets=getSheetsClient();
      const meta=await sheets.spreadsheets.get({
        spreadsheetId:process.env.GOOGLE_SHEETS_ID!,
        fields:"spreadsheetId,sheets.properties.title"
      });
      const tabs=(meta.data.sheets||[]).map((s:any)=>s.properties?.title).filter(Boolean);
      result.googleSheets.reachable=true;
      result.googleSheets.tabs=tabs;
      result.googleSheets.requiredTabsPresent=tabs.includes("Sales")&&tabs.includes("Expenses");
      if(!result.googleSheets.requiredTabsPresent) result.ok=false;
    }catch(e:any){
      result.ok=false;
      result.googleSheets.error=String(e?.response?.data?.error?.message||e?.message||"Google Sheets check failed").slice(0,300);
    }
  } else result.ok=false;

  if(!result.telegram.configured) result.ok=false;
  return res.status(result.ok?200:503).json(result);
}
