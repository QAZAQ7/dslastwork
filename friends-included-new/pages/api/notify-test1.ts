import type { NextApiRequest, NextApiResponse } from "next";
import { retryNotification } from "../../lib/service";
export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="GET") return res.status(405).json({ok:false});
  try{
    const sale=await retryNotification("svetlana","sale","S01");
    const expense=await retryNotification("svetlana","expense","E01");
    return res.status(200).json({ok:true,sale,expense});
  }catch(e:any){return res.status(500).json({ok:false,error:e?.message||"error"});}
}