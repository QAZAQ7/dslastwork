import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

export type Split={richard:number;anastasia:number;jean:number};
export const money=(n:any)=>Math.round(Number(n)*100)/100;
export function validateSplit(s:Split){
  const v=[s.richard,s.anastasia,s.jean];
  if(v.some(x=>!Number.isFinite(x)||x<0||x>100)) throw new Error('Each commission share must be between 0% and 100%.');
  if(Math.abs(v.reduce((a,b)=>a+b,0)-100)>0.0001) throw new Error('Commission shares must total 100%.');
}
export function calcCommissions(amount:number,s:Split){
  validateSplit(s); const pool=money(amount*.10);
  const r:any={richard:money(pool*s.richard/100),anastasia:money(pool*s.anastasia/100),jean:money(pool*s.jean/100)};
  const diff=money(pool-r.richard-r.anastasia-r.jean);
  if(Math.abs(diff)>=.01){ const max=Math.max(s.richard,s.anastasia,s.jean); const order:(keyof Split)[]=['richard','anastasia','jean']; const w=order.find(k=>s[k]===max)!; r[w]=money(r[w]+diff); }
  return {pool,...r};
}
export function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase environment variables are missing.');
  return createClient(url,key,{auth:{persistSession:false}});
}
export async function employee(code:string){const {data,error}=await db().from('employees').select('*').eq('code',code).single();if(error||!data) throw new Error('Unknown employee.');return data;}
export async function requireRole(code:string,allowed:string[]){const e=await employee(code);if(!allowed.includes(e.role)) throw new Error('Permission denied.');return e;}
function googleClient(){
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, raw=process.env.GOOGLE_PRIVATE_KEY;
  if(!email||!raw) throw new Error('Google Sheets credentials are missing.');
  let key=raw.trim(); if((key.startsWith('"')&&key.endsWith('"'))||(key.startsWith("'")&&key.endsWith("'"))) key=key.slice(1,-1);
  key=key.replace(/\\n/g,'\n').replace(/\r\n/g,'\n').trim();
  if(!key.includes('-----BEGIN PRIVATE KEY-----')||!key.includes('-----END PRIVATE KEY-----')) throw new Error('GOOGLE_PRIVATE_KEY format is invalid.');
  const auth=new google.auth.JWT({email:email.trim(),key,scopes:['https://www.googleapis.com/auth/spreadsheets']});
  return google.sheets({version:'v4',auth});
}
async function upsert(tab:string,ref:string,headers:string[],values:any[]){
  const spreadsheetId=process.env.GOOGLE_SHEETS_ID;if(!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is missing.'); const gs=googleClient();
  const cur=await gs.spreadsheets.values.get({spreadsheetId,range:`${tab}!A:Z`}); let rows=cur.data.values||[];
  if(!rows.length){await gs.spreadsheets.values.update({spreadsheetId,range:`${tab}!A1`,valueInputOption:'RAW',requestBody:{values:[headers]}});rows=[headers];}
  const idx=rows.findIndex((r:any[],i:number)=>i>0&&r?.[0]===ref);
  if(idx>0) await gs.spreadsheets.values.update({spreadsheetId,range:`${tab}!A${idx+1}`,valueInputOption:'RAW',requestBody:{values:[values]}});
  else await gs.spreadsheets.values.append({spreadsheetId,range:`${tab}!A:Z`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[values]}});
}
export async function syncRecord(kind:'sale'|'expense',row:any){
  const database=db(); try{
    if(kind==='sale') await upsert('Sales',row.reference,['Reference','Submission time','Salesperson','Customer','Project','Description','Amount','Proposed Richard %','Proposed Anastasia %','Proposed Jean-Claude %','Approved Richard %','Approved Anastasia %','Approved Jean-Claude %','Richard commission','Anastasia commission','Jean-Claude commission','Status'],[row.reference,row.submitted_at,row.salesperson_code,row.customer,row.project,row.description,Number(row.amount),Number(row.proposed_richard),Number(row.proposed_anastasia),Number(row.proposed_jean),row.approved_richard??'',row.approved_anastasia??'',row.approved_jean??'',Number(row.commission_richard||0),Number(row.commission_anastasia||0),Number(row.commission_jean||0),row.status]);
    else await upsert('Expenses',row.reference,['Reference','Submission time','Reporter','Description','Category','Amount','Proposed allocation','Final allocation','Status'],[row.reference,row.submitted_at,row.reporter_code,row.description,row.category,Number(row.amount),row.proposed_allocation,row.final_allocation??'',row.status]);
    await database.from(kind==='sale'?'sales':'expenses').update({sheet_sync_status:'ok'}).eq('id',row.id); return 'ok';
  }catch(e:any){console.error('SHEETS_SYNC_ERROR',e?.response?.data||e?.message||e);await database.from(kind==='sale'?'sales':'expenses').update({sheet_sync_status:'failed'}).eq('id',row.id);return 'failed';}
}
export async function sendTelegram(chatId:number|string,text:string){const token=process.env.TELEGRAM_BOT_TOKEN;if(!token) throw new Error('TELEGRAM_BOT_TOKEN is missing.');const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text})});if(!r.ok) throw new Error(await r.text());}
