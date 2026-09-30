import type { NextApiRequest, NextApiResponse } from "next";
import { getSheetsClient } from "../../lib/googleSheets";

export default async function handler(_req:NextApiRequest,res:NextApiResponse){
  try{
    const spreadsheetId=process.env.GOOGLE_SHEETS_ID;
    const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key=process.env.GOOGLE_PRIVATE_KEY;
    if(!spreadsheetId || !email || !key){
      return res.status(500).json({
        ok:false,
        error:"Missing Google environment variable",
        env:{email:Boolean(email),privateKey:Boolean(key),spreadsheetId:Boolean(spreadsheetId)}
      });
    }

    const sheets=getSheetsClient();
    const metadata=await sheets.spreadsheets.get({
      spreadsheetId,
      fields:"properties.title,sheets.properties.title"
    });
    const sales=await sheets.spreadsheets.values.get({
      spreadsheetId,
      range:"Sales!A1:Z5"
    });

    return res.status(200).json({
      ok:true,
      spreadsheetTitle:metadata.data.properties?.title??null,
      tabs:metadata.data.sheets?.map(s=>s.properties?.title).filter(Boolean)??[],
      salesRowsRead:sales.data.values?.length??0,
      safeChecks:{
        emailPresent:true,
        privateKeyPresent:true,
        spreadsheetIdPresent:true
      }
    });
  }catch(error:any){
    const googleError=error?.response?.data?.error;
    console.error("GOOGLE_HEALTH_ERROR",error?.response?.data??error?.message??error);
    return res.status(500).json({
      ok:false,
      error:googleError?.message??error?.message??"Google Sheets health check failed",
      code:googleError?.code??null,
      status:googleError?.status??null
    });
  }
}
