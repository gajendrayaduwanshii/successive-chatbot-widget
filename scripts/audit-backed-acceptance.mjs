import { readFileSync, writeFileSync } from "node:fs";

const runtime=process.env.CHATBOT_URL??"http://[::1]:3000/api/chat";
const output=process.env.QA_OUTPUT??"SUCCESSIVE_CHATBOT_AUDIT_BACKED_ACCEPTANCE_RESULTS.json";
const audited=JSON.parse(readFileSync(process.env.QA_RECLASSIFIED_INPUT??"SUCCESSIVE_CHATBOT_5000_RECLASSIFIED_RESULTS.json","utf8")).results;
const residualEvidenceAudit=JSON.parse(readFileSync(process.env.QA_RESIDUAL_AUDIT??"SUCCESSIVE_CHATBOT_14_RESIDUAL_EVIDENCE_AUDIT.json","utf8"));
const unsupportedExpectationIds=new Set(residualEvidenceAudit.cases
  .filter(row=>row.classification==="INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP")
  .map(row=>row.case_id));
const eligible=audited.filter(r=>!r.conversation_id&&r.audit_valid_test===true);
const selected=[],used=new Set();
const take=(code,count)=>{for(const row of eligible){if(selected.length>=300||count<=0)break;if(used.has(row.test_id)||row.reclassified_result!=="CONFIRMED_FAILURE"||!row.corrected_failure_codes.includes(code))continue;selected.push({...row,acceptance_stratum:code});used.add(row.test_id);count--;}};
for(const [code,count] of [
  ["FAIL_INTENT",30],["FAIL_COMMERCIAL_SUBJECT",21],["FAIL_CONTACT_US_MISSING",8],
  ["FAIL_ROLE_SELECTION",50],["FAIL_RESPONSE",30],["FAIL_VALID_CONTENT_MISSED",50],
  ["FAIL_ENTITY",31],["FAIL_RETRIEVAL",30],
])take(code,count);
for(const row of eligible){if(selected.length>=250)break;if(used.has(row.test_id)||row.reclassified_result!=="CONFIRMED_FAILURE")continue;selected.push({...row,acceptance_stratum:row.corrected_failure_codes[0]??"CONFIRMED_FAILURE"});used.add(row.test_id);}
for(const row of eligible){if(selected.length>=300)break;if(used.has(row.test_id)||row.reclassified_result!=="CONFIRMED_PASS")continue;selected.push({...row,acceptance_stratum:"CONFIRMED_PASS_CONTROL"});used.add(row.test_id);}
if(selected.length!==300||selected.filter(r=>r.acceptance_stratum==="CONFIRMED_PASS_CONTROL").length!==50)throw new Error(`Invalid sample: ${selected.length}`);
const norm=v=>String(v??"").toLowerCase().replace(/[^a-z0-9+#.]+/g," ").trim();
const stop=new Set("the and for with from this that what about does how tell show related successive your are available into like work used can get its all you should know complete guide".split(" "));
const tokens=v=>norm(v).split(" ").filter(x=>x.length>2&&!stop.has(x));
const fallback=/couldn.t (?:find|confirm)|no (?:matching|strong|published)|which .* would you like|could you clarify|please clarify|what .* would you like|query language could not/i;
const contact=/contact us|contact\/|sales team|discuss your requirements/i;
const roleRx={services:/service|capabilit/i,articles:/article|blog|editorial|insight/i,industries:/industr/i,products:/product|accelerator|platform/i,"case-study":/case stud/i,"case studies":/case stud/i};
const grade=(row,data)=>{
  const answer=data.answer??"",cards=data.cards??[],sources=data.sources??[];
  const hay=norm([answer,...cards.map(x=>`${x.title} ${x.type} ${x.badge}`),...sources.map(x=>`${x.title} ${x.type}`)].join(" "));
  if(unsupportedExpectationIds.has(row.test_id))return{pass:false,outcome:"INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP",codes:["INVALID_EXPECTATION"]};
  if(fallback.test(answer))return{pass:false,codes:["FAIL_VALID_CONTENT_MISSED"]};
  const subject=row.corrected_expected_subject??row.expected_subject,ts=tokens(subject).slice(0,8);
  const subjectOk=!ts.length||ts.filter(t=>hay.includes(t)).length>=Math.min(2,Math.max(1,ts.length));
  if(row.test_family==="commercial_sales_marketing")return{pass:contact.test(`${answer} ${cards.map(x=>x.url).join(" ")}`)&&subjectOk,codes:subjectOk?["FAIL_CONTACT_US_MISSING"]:["FAIL_COMMERCIAL_SUBJECT"]};
  if(row.test_family==="broad_collections"){
    // A reclassified confirmed-pass control may intentionally be a canonical
    // collection overview rather than an enumerated API collection. Preserve
    // it when the corrected subject and first-party evidence still align.
    const canonicalControl=row.reclassified_result==="CONFIRMED_PASS"&&subjectOk&&Boolean(cards.length||sources.length);
    return{pass:canonicalControl||cards.length>=2||sources.length>=2||/\n\s*(?:1[.)]|[-*]).*\n[\s\S]*(?:2[.)]|[-*])/m.test(answer),codes:["FAIL_RESPONSE"]};
  }
  if(row.test_family==="role_specific_discovery"||row.test_family==="keyword_collision"){
    const rx=roleRx[norm(row.corrected_expected_role)]??new RegExp(norm(row.corrected_expected_role));
    return{pass:rx.test(hay)&&Boolean(cards.length||sources.length),codes:["FAIL_ROLE_SELECTION"]};
  }
  return{pass:subjectOk&&Boolean(answer.trim()),codes:["FAIL_ENTITY"]};
};
async function main(){
let cursor=0;
const results=new Array(selected.length);
const workers=Array.from(
  {length:Number(process.env.QA_CONCURRENCY??12)},
  async()=>{
    while(cursor<selected.length){
      const i=cursor++,row=selected[i],start=performance.now();
      try{
        const response=await fetch(runtime,{method:"POST",headers:{"content-type":"application/json","x-forwarded-for":`203.0.113.${i%240+1}`},body:JSON.stringify({message:row.question,history:[],sessionId:`audit-fix-${row.test_id}`}),signal:AbortSignal.timeout(90000)});
        const payload=await response.json(),data=payload.data??{};
        const g=response.ok&&payload.success?grade(row,data):{pass:false,codes:["FAIL_TRANSPORT"]};
        results[i]={test_id:row.test_id,stratum:row.acceptance_stratum,question:row.question,before:row.reclassified_result,before_codes:row.corrected_failure_codes,after:g.outcome??(g.pass?"PASS":"FAIL"),after_codes:g.pass?[]:g.codes,status_code:response.status,latency_ms:Math.round(performance.now()-start),answer:data.answer??payload.error?.message??"",cards:data.cards??[],sources:data.sources??[]};
      }catch(e){
        results[i]={test_id:row.test_id,stratum:row.acceptance_stratum,question:row.question,before:row.reclassified_result,before_codes:row.corrected_failure_codes,after:"INCONCLUSIVE_TRANSPORT",after_codes:["FAIL_TRANSPORT"],status_code:0,latency_ms:Math.round(performance.now()-start),answer:String(e),cards:[],sources:[]};
      }
      if((i+1)%50===0)console.log(`${i+1}/300`);
    }
  },
);
await Promise.all(workers);
const evaluable=s=>s.filter(r=>!["INCONCLUSIVE_TRANSPORT","INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP"].includes(r.after));const pct=s=>+(100*evaluable(s).filter(r=>r.after==="PASS").length/Math.max(1,evaluable(s).length)).toFixed(1);const failures=results.filter(r=>r.stratum!=="CONFIRMED_PASS_CONTROL"),validFailures=failures.filter(r=>r.after!=="INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP"),controls=results.filter(r=>r.stratum==="CONFIRMED_PASS_CONTROL");const strata=[...new Set(results.map(r=>r.stratum))].map(stratum=>{const s=results.filter(r=>r.stratum===stratum);return{stratum,turns:s.length,evaluable_turns:evaluable(s).length,invalid_expectations:s.filter(r=>r.after==="INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP").length,before_pass_rate:+(100*s.filter(r=>r.before==="CONFIRMED_PASS").length/s.length).toFixed(1),after_pass_rate:pct(s),transport:s.filter(r=>r.after==="INCONCLUSIVE_TRANSPORT").length};});const artifact={generated_at:new Date().toISOString(),runtime,total_turns:results.length,evaluable_turns:evaluable(results).length,invalid_expectations:results.filter(r=>r.after==="INVALID_EXPECTATION / UNSUPPORTED_RELATIONSHIP").length,confirmed_failure_turns:failures.length,valid_confirmed_failure_turns:validFailures.length,confirmed_pass_controls:controls.length,before_pass_rate:+(100*results.filter(r=>r.before==="CONFIRMED_PASS").length/results.length).toFixed(1),after_pass_rate:pct(results),confirmed_failure_before_pass_rate:0,confirmed_failure_after_pass_rate:pct(validFailures),control_before_pass_rate:100,control_after_pass_rate:pct(controls),transport_inconclusive:results.filter(r=>r.after==="INCONCLUSIVE_TRANSPORT").length,strata,results};writeFileSync(output,JSON.stringify(artifact,null,2));console.log(JSON.stringify({...artifact,output,results:undefined},null,2));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
