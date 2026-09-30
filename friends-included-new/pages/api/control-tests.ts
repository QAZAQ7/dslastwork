import type { NextApiRequest,NextApiResponse } from "next";
import {approveSale,createExpense,createSale,getDashboard} from "../../lib/service";
async function test(name:string,fn:()=>Promise<any>){try{const v=await fn();return {name,ok:true,result:v?.alreadyApproved??"completed"};}catch(e:any){return {name,ok:false,error:e?.message||"error"};}}
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 if(req.method!=="GET")return res.status(405).json({ok:false});
 const out=[];
 out.push(await test("invalid split 60/30/20",()=>createSale({actor:"richard",reference:"QA_BAD_SPLIT",customer:"QA",project:"A",description:"QA",amount:10,split:{richard:60,anastasia:30,jean:20}})));
 out.push(await test("Richard approval denied",()=>approveSale("richard","S05",{richard:100,anastasia:0,jean:0})));
 out.push(await test("Kevin sale denied",()=>createSale({actor:"kevin",reference:"QA_KEVIN",customer:"QA",project:"A",description:"QA",amount:10,split:{richard:100,anastasia:0,jean:0}})));
 out.push(await test("zero expense rejected",()=>createExpense({actor:"kevin",reference:"QA_ZERO",description:"QA",category:"Other",amount:0,proposedAllocation:"A"})));
 out.push(await test("duplicate sale rejected",()=>createSale({actor:"richard",reference:"S01",customer:"QA",project:"A",description:"QA",amount:10,split:{richard:100,anastasia:0,jean:0}})));
 out.push(await test("duplicate expense rejected",()=>createExpense({actor:"kevin",reference:"E01",description:"QA",category:"Other",amount:10,proposedAllocation:"A"})));
 out.push(await test("approved sale idempotent",()=>approveSale("svetlana","S01",{richard:50,anastasia:30,jean:20})));
 return res.status(200).json({tests:out,dashboard:await getDashboard("svetlana")});
}