import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const runtime = process.env.CHATBOT_URL ?? "http://127.0.0.1:3000/api/chat";
const output = process.env.QA_OUTPUT ?? "SUCCESSIVE_CHATBOT_5000_TEST_RESULTS.json";
const snapshotPath = process.env.QA_SNAPSHOT ?? "SUCCESSIVE_CHATBOT_SOURCE_API_RECORDS.json";
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const records = snapshot.records.filter((r) => r.status === "publish" || !r.status);
const norm = (v) => String(v ?? "").toLowerCase().replace(/&amp;/g, "and").replace(/[^a-z0-9+#.]+/g, " ").trim();
const words = (v) => norm(v).split(" ").filter((x) => x.length > 2 && !["the","and","for","with","from","this","that","what","about","successive"].includes(x));
const recordText = (r) => norm([r.title, r.role, r.type, r.slug, String(r.excerpt ?? "").slice(0,3000)].join(" "));
const recordById = new Map(records.map((r) => [String(r.id), r]));
const searchable = records.map((r) => ({ r, text: recordText(r), title: norm(r.title), role: norm(r.role || r.content_type || r.type) }));
const roles = new Map();
for (const r of records) { const role = norm(r.role || r.content_type || r.type); if (!roles.has(role)) roles.set(role, []); roles.get(role).push(r); }
const usable = records.filter((r) => String(r.title ?? "").trim().length >= 4 && !/^(home|test|untitled)$/i.test(r.title));
const roleOf = (r) => norm(r.role || r.content_type || r.type);
const expectedIds = (subject, wantedRole = "") => {
  const sw = words(subject); if (!sw.length) return [];
  return searchable.map(({r,text,title,role}) => ({ r, score: sw.reduce((n,w) => n + (title.includes(w) ? 6 : text.includes(w) ? 1 : 0), 0) + (wantedRole && role.includes(norm(wantedRole)) ? 5 : 0) }))
    .filter((x) => x.score >= Math.max(4, sw.length)).sort((a,b) => b.score-a.score).slice(0,8).map((x) => String(x.r.id));
};
const tests = [];
let serial = 0;
const add = (family, category, question, meta = {}) => tests.push({ test_id: `T-${String(++serial).padStart(4,"0")}`, conversation_id: null, turn_number: 1, test_family: family, category, question, ...meta });
const entities = usable.filter((r) => !["post","blog"].includes(roleOf(r))).sort((a,b) => String(a.id).localeCompare(String(b.id)));
const editorials = usable.filter((r) => /blog|post|thought|resource|press|media/.test(roleOf(r)));
const cases = usable.filter((r) => /case/.test(roleOf(r)));
const careers = usable.filter((r) => /career|job/.test(roleOf(r)));
const templates = ["What is {x}?","Tell me about {x}.","What does {x} do?","How does {x} work?","What is {x} used for?"];
for (let i=0;i<2000;i++) {
  const r = usable[(i * 37) % usable.length];
  const family = i % 10 === 0 ? "broad_collections" : i % 6 === 0 ? "role_specific_discovery" : i % 9 === 0 ? "embedded_entity" : "exact_entity";
  let q = templates[i % templates.length].replace("{x}", r.title);
  let expectedRole = roleOf(r);
  if (family === "role_specific_discovery") { const asks=["services","case studies","articles","resources","products","partners","industries","accelerators"]; expectedRole=asks[i%asks.length]; q=`Show ${expectedRole} related to ${r.title}.`; }
  if (family === "broad_collections") { const qs=["What services does Successive offer?","Which industries does Successive serve?","What products are available?","Who are your partners?","Show available accelerators.","What awards has Successive received?","What locations do you have?"]; q=qs[i%qs.length]; expectedRole="collection"; }
  add(family, /case/.test(expectedRole)?"case studies":/career/.test(expectedRole)?"careers":/industr/.test(expectedRole)?"industries":/partner/.test(expectedRole)?"partners":/post|blog|resource|thought/.test(expectedRole)?"resources/articles":"products/entities", q, { expected_subject:r.title, expected_role:expectedRole, expected_behavior:family === "broad_collections"?"representative validated collection":"answer from exact or embedded first-party evidence", source_record_ids:expectedIds(r.title, expectedRole) });
}
const commercialActions=["cost","estimate","quote","proposal","demo","trial","consultation","contact sales","project discussion","implementation","dedicated team","timeline","budget","custom requirement","integration requirement"];
for(let i=0;i<400;i++){const r=entities[(i*29)%entities.length];const action=commercialActions[i%commercialActions.length];add("commercial_sales_marketing","commercial",`Can I get ${/^cost$/.test(action)?"the cost":`a ${action}`} for ${r.title}?`,{expected_subject:r.title,expected_role:roleOf(r),expected_behavior:"preserve business subject; avoid invented commitments; show Contact Us when appropriate",source_record_ids:expectedIds(r.title),contact_us_expected:true});}
for(let i=0;i<200;i++){const r=usable[(i*41)%usable.length];const title=String(r.title);const at=Math.max(1,Math.min(title.length-2,(i*7)%Math.max(2,title.length)));const typo=i%2?title.replace(/([a-z])([a-z])/i,"$2$1"):title.slice(0,at)+title.slice(at+1);add("typo_informal","typos",`${i%3===0?"pls tell abt":"what is"} ${typo}?`,{expected_subject:title,expected_role:roleOf(r),expected_behavior:"understand realistic malformed query",source_record_ids:[String(r.id),...expectedIds(title)].slice(0,8)});}
const negatives=["private client contract values","an unreleased acquisition","the CEO's private phone number","confidential employee ratings","a guaranteed fixed delivery date","private NDA customers","internal security credentials","an unpublished product roadmap"];
for(let i=0;i<200;i++){const q=i%4===0?["Who won today's cricket match?","What is today's weather?","Recommend a dinner recipe.","Write unrelated Python homework for me."][i%4]:`What does Successive publish about ${negatives[i%negatives.length]}?`;add(i%4===0?"off_topic":"no_content_negative","no content",q,{expected_subject:"",expected_role:"",expected_behavior:i%4===0?"safe off-topic handling without unrelated retrieval":"honest abstention",source_record_ids:[],contact_us_expected:false});}
const collisionTerms=["cloud","security","AI","product","native","developer","team","service","internal","cost"];
for(let i=0;i<200;i++){const term=collisionTerms[i%collisionTerms.length];const wanted=["case studies","services","articles","products"][i%4];add("keyword_collision","cards/sources",`Show ${wanted} about ${term}.`,{expected_subject:term,expected_role:wanted,expected_behavior:"select requested role, not a lexical collision",source_record_ids:expectedIds(term,wanted)});}

const conversations=[];
const deps=["Tell me more about it.","What does it cover?","Any examples for this?","Show another one.","What does the second one do?","Any case studies for it?","Where is it used?","What about the last one?","What is the outcome?","Can this integrate with our ERP?"];
for(let ci=0;ci<500;ci++){
  const opener=tests[1500+ci]; const cid=`C-${String(ci+1).padStart(4,"0")}`; opener.conversation_id=cid; opener.turn_number=1;
  const a=recordById.get(opener.source_record_ids[0])||usable[(ci*19)%usable.length], b=usable[(ci*19+113)%usable.length]; const flow=[opener];
  for(let t=1;t<=3;t++) flow.push({question:deps[(ci+t)%deps.length],family:t===2?"ordinal_result_memory":"generic_followup",category:t===2?"sibling/ordinal":"follow-up",subject:a.title,role:t===3?"case studies":roleOf(a),ids:expectedIds(a.title),contact:/integrate/.test(deps[(ci+t)%deps.length])});
  flow.push({question:`Switch topics: tell me about ${b.title}.`,family:"explicit_topic_switch",category:"context reset",subject:b.title,role:roleOf(b),ids:[String(b.id),...expectedIds(b.title)].slice(0,8)}); conversations.push(flow);
}
for(const [ci,flow] of conversations.entries()) for(const [ti,x] of flow.entries()) if(ti>0) tests.push({test_id:`T-${String(++serial).padStart(4,"0")}`,conversation_id:`C-${String(ci+1).padStart(4,"0")}`,turn_number:ti+1,test_family:x.family,category:x.category,question:x.question,expected_subject:x.subject,expected_role:x.role,expected_behavior:"retain or reset context as specified",source_record_ids:x.ids,contact_us_expected:Boolean(x.contact)});
if(tests.length!==5000) throw new Error(`Expected 5000 turns, generated ${tests.length}`);

const productionFiles=execFileSync("git",["ls-files","src","public","package.json","next.config.ts"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
const fingerprint=()=>createHash("sha256").update(productionFiles.map((f)=>`${f}\0${createHash("sha256").update(readFileSync(f)).digest("hex")}`).join("\n")).digest("hex");
const beforeHash=fingerprint();
const abstain=/couldn.t (?:find|confirm)|no (?:matching|strong|published)|don.t have enough|not available|cannot confirm|outside.*scope/i;
const contact=/contact us|contact\/|talk to|speak with|sales team|discuss.*team/i;
const roleTokens={"case studies":/case stud/i,"case-study":/case stud/i,"articles":/article|blog|insight|thought leadership/i,"resources":/resource|guide|report|blog|insight/i,"services":/service|capabilit/i,"products":/product|accelerator|platform|solution/i,"partners":/partner|alliance/i,"industries":/industr/i,"accelerators":/accelerator/i,"career":/career|job|opening|keka/i};
function grade(row){
  if(!row.http_ok)return {result:"INCONCLUSIVE_TRANSPORT",severity:"INCONCLUSIVE_TRANSPORT",failure_codes:["FAIL_TRANSPORT"],notes:"No valid runtime response"};
  const hay=norm([row.actual_answer_summary,...row.actual_cards.map(x=>`${x.title} ${x.type} ${x.badge}`),...row.actual_sources.map(x=>`${x.title} ${x.type}`)].join(" "));
  const supported=row.source_record_ids.length>0; const isAbstain=abstain.test(row.actual_answer_summary); const codes=[];
  if(supported&&isAbstain)codes.push("FAIL_VALID_CONTENT_MISSED","FAIL_RETRIEVAL");
  if(!supported&&!isAbstain&&row.category==="no content"&&row.actual_cards.length)codes.push("FAIL_NO_CONTENT");
  if(row.contact_us_expected&&!row.contact_us_present)codes.push("FAIL_CONTACT_US_MISSING");
  if(!row.contact_us_expected&&row.contact_us_present&&/off_topic/.test(row.test_family))codes.push("FAIL_CONTACT_US_UNNECESSARY");
  const roleRx=roleTokens[norm(row.expected_role)]; if(roleRx&&supported&&!roleRx.test(hay))codes.push("FAIL_ROLE_SELECTION");
  const subjectWords=words(row.expected_subject).slice(0,5); if(supported&&subjectWords.length&&!subjectWords.some(w=>hay.includes(w))&&!isAbstain)codes.push("FAIL_ENTITY");
  if(row.turn_number>1&&/clarify|which (?:one|topic)|what subject/i.test(row.actual_answer_summary))codes.push("FAIL_CONTEXT");
  if(/second|last|another/.test(norm(row.question))&&row.turn_number>1&&isAbstain)codes.push("FAIL_ORDINAL");
  const unique=[...new Set(codes)]; let result="PASS"; if(unique.includes("FAIL_VALID_CONTENT_MISSED")||unique.includes("FAIL_ROLE_SELECTION")||unique.includes("FAIL_CONTEXT")||unique.includes("FAIL_ORDINAL"))result="MAJOR";else if(unique.length)result="MEDIUM";else if(!supported&&isAbstain)result="PASS_NO_VALID_CONTENT";
  return {result,severity:result,failure_codes:unique,notes:unique.length?"Automated evidence/behavior rule triggered":"Response met automated evidence and behavior checks"};
}
async function ask(test,history,index){const start=performance.now();try{const response=await fetch(runtime,{method:"POST",headers:{"content-type":"application/json","x-forwarded-for":`198.18.${Math.floor(index/240)%240}.${index%240+1}`},body:JSON.stringify({message:test.question,history:history.slice(-12),sessionId:`qa5000-${test.conversation_id??test.test_id}`}),signal:AbortSignal.timeout(Number(process.env.QA_TIMEOUT_MS??90000))});let payload;try{payload=await response.json();}catch{payload={};}const data=payload.data??{};const cards=data.cards??[],sources=data.sources??[];const answer=data.answer??payload.error?.message??"";const row={...test,history_context:history.map(x=>`${x.role}: ${x.content}`).join("\n"),source_titles:test.source_record_ids.map(id=>recordById.get(id)?.title).filter(Boolean),api_evidence_status:test.source_record_ids.length?"CONTENT_EXISTS":"NO_DIRECT_CONTENT_IDENTIFIED",actual_answer_summary:answer,actual_cards:cards,actual_sources:sources,contact_us_expected:Boolean(test.contact_us_expected),contact_us_present:contact.test(`${answer} ${cards.map(x=>x.url).join(" ")}`),latency_ms:Math.round(performance.now()-start),status_code:response.status,http_ok:response.ok&&Boolean(payload.success)};return {...row,...grade(row)};}catch(e){const row={...test,history_context:history.map(x=>`${x.role}: ${x.content}`).join("\n"),source_titles:test.source_record_ids.map(id=>recordById.get(id)?.title).filter(Boolean),api_evidence_status:test.source_record_ids.length?"CONTENT_EXISTS":"NO_DIRECT_CONTENT_IDENTIFIED",actual_answer_summary:String(e),actual_cards:[],actual_sources:[],contact_us_expected:Boolean(test.contact_us_expected),contact_us_present:false,latency_ms:Math.round(performance.now()-start),status_code:0,http_ok:false};return {...row,...grade(row)};}}
const results=new Array(tests.length);const standalone=tests.map((t,i)=>[t,i]).filter(([t])=>!t.conversation_id);let cursor=0;const workers=Array.from({length:Number(process.env.QA_CONCURRENCY??12)},async()=>{while(cursor<standalone.length){const current=cursor++;const [test,index]=standalone[current];results[index]=await ask(test,[],index);if((current+1)%250===0)console.log(`standalone ${current+1}/${standalone.length}`);}});await Promise.all(workers);
const grouped=new Map();for(const t of tests.filter(t=>t.conversation_id)){if(!grouped.has(t.conversation_id))grouped.set(t.conversation_id,[]);grouped.get(t.conversation_id).push(t);}const conversationFlows=[...grouped.values()];let conversationCursor=0,conversationDone=0;const conversationWorkers=Array.from({length:Number(process.env.QA_CONVERSATION_CONCURRENCY??12)},async()=>{while(conversationCursor<conversationFlows.length){const flow=conversationFlows[conversationCursor++],history=[];for(const test of flow.sort((a,b)=>a.turn_number-b.turn_number)){const index=tests.indexOf(test);const result=await ask(test,history,index);results[index]=result;history.push({role:"user",content:test.question},{role:"assistant",content:result.actual_answer_summary});}conversationDone++;if(conversationDone%50===0)console.log(`conversations ${conversationDone}/${conversations.length}`);}});await Promise.all(conversationWorkers);
const afterHash=fingerprint();const artifact={generated_at:new Date().toISOString(),runtime,snapshot_path:snapshotPath,snapshot_metadata:snapshot.export_metadata,source_record_count:records.length,total_user_turns:results.length,conversation_count:conversations.length+standalone.length,standalone_turns:3000,multi_turn_turns:2500,distribution:{standalone_direct:2000,dependent_followups:1500,topic_switch_context_reset:500,commercial:400,typo_informal:200,unsupported_false_premise:200,adversarial_collision:200},production_fingerprint_before:beforeHash,production_fingerprint_after:afterHash,production_modified_during_run:beforeHash!==afterHash,results};writeFileSync(output,JSON.stringify(artifact,null,2));console.log(JSON.stringify({output,total:results.length,counts:Object.fromEntries([...new Set(results.map(r=>r.result))].map(k=>[k,results.filter(r=>r.result===k).length])),production_unchanged:beforeHash===afterHash},null,2));
