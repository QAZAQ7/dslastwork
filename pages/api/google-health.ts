import type { NextApiRequest, NextApiResponse } from "next";
import { getSheetsClient } from "../../lib/googleSheets";

export default async function handler(_req:NextApiRequest,res:NextApiResponse){
  try{
    const spreadsheetId=process.env.GOOGLE_SHEETS_ID;
    if(!spreadsheetId) throw new Error("GOOGLE_SHEETS_ID is missing.");
    const sheets=getSheetsClient();
    const metadata=await sheets.spreadsheets.get({spreadsheetId,fields:"properties.title,sheets.properties.title"});
    return res.status(200).json({ok:true,spreadsheetTitle:metadata.data.properties?.title??null,tabs:metadata.data.sheets?.map(s=>s.properties?.title).filter(Boolean)??[]});
  }catch(error:any){ console.error("GOOGLE_HEALTH_ERROR",error?.response?.data??error?.message??error); return res.status(500).json({ok:false,error:error?.message??"Google Sheets health check failed"}); }
}
