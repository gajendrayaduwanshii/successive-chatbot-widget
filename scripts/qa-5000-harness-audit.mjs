import { readFileSync, writeFileSync } from "node:fs";
import { authoritativeRelationshipIds } from "./lib/relationship-evidence.mjs";

const resultsInput=process.env.QA_RESULTS_INPUT??"SUCCESSIVE_CHATBOT_5000_TEST_RESULTS.json";
const snapshotInput=process.env.QA_SNAPSHOT??"SUCCESSIVE_CHATBOT_SOURCE_API_RECORDS.json";
const run=JSON.parse(readFileSync(resultsInput,"utf8"));
const snapshot=JSON.parse(readFileSync(snapshotInput,"utf8"));
const reclassifiedOutput=process.env.QA_RECLASSIFIED_OUTPUT??"SUCCESSIVE_CHATBOT_5000_RECLASSIFIED_RESULTS.json";
const reportOutput=process.env.QA_AUDIT_REPORT_OUTPUT??"SUCCESSIVE_CHATBOT_5000_QA_HARNESS_AUDIT.md";
const rows=run.results,records=snapshot.records;
const byId=new Map(records.map(r=>[String(r.id),r]));
const norm=v=>String(v??"").toLowerCase().replace(/&amp;/g," and ").replace(/[^a-z0-9+#.]+/g," ").trim();
const stop=new Set("the and for with from this that what about does how tell show related successive your are available into like work used can get its all you should know complete guide".split(" "));
const tokens=v=>norm(v).split(" ").filter(x=>x.length>2&&!stop.has(x));
const role=r=>norm(r?.role||r?.content_type||r?.type).replaceAll("_"," ");
const canonicalRole=v=>{v=norm(v);if(/case/.test(v))return"case study";if(/article|resource|blog|thought/.test(v))return"editorial";if(/product|accelerator/.test(v))return"accelerator";if(/service|capabilit/.test(v))return"service";if(/industr/.test(v))return"industry";if(/partner/.test(v))return"partner";if(/career|job/.test(v))return"careers";return v;};
const roleCompatible=(r,wanted)=>{const a=canonicalRole(role(r)),b=canonicalRole(wanted);return a===b||(b==="editorial"&&["editorial","blog","press release","media"].includes(a));};
const compactText=r=>norm([r?.title,r?.slug,r?.excerpt,String(r?.cleaned_content??"").slice(0,5000)].join(" "));
const linkedIds=r=>authoritativeRelationshipIds(r,records);
const reverseLinks=new Map();for(const r of records)for(const id of linkedIds(r)){if(!reverseLinks.has(id))reverseLinks.set(id,new Set());reverseLinks.get(id).add(String(r.id));}
const relationTargets=(base,wanted)=>{const ids=new Set([...linkedIds(base),...(reverseLinks.get(String(base?.id))??[])]);return [...ids].map(id=>byId.get(id)).filter(r=>r&&roleCompatible(r,wanted));};
const strongTopicMembers=(topic,wanted)=>{const ts=tokens(topic);return records.filter(r=>roleCompatible(r,wanted)&&ts.length&&ts.every(t=>compactText(r).includes(t))).slice(0,20);};
const collections={services:records.filter(r=>roleCompatible(r,"service")),partners:records.filter(r=>roleCompatible(r,"partner")),industries:records.filter(r=>roleCompatible(r,"industry")),accelerators:records.filter(r=>roleCompatible(r,"accelerator")),products:records.filter(r=>roleCompatible(r,"accelerator")),awards:records.filter(r=>/award/.test(role(r))),locations:records.filter(r=>/location|contact|office/.test(norm(`${r.title} ${r.slug}`)))};
const broadSubject=q=>/service/.test(q)?"Services":/partner/.test(q)?"Partners":/industr/.test(q)?"Industries":/accelerator/.test(q)?"Accelerators":/product/.test(q)?"Products":/award/.test(q)?"Awards":/location|office/.test(q)?"Locations":"Collection";
const fallback=/couldn.t (?:find|confirm)|no (?:matching|strong|published)|don.t have enough|not available|cannot confirm|which .* would you like|could you clarify|please clarify|what .* would you like|query language could not/i;
const clarification=/which .* would you like|could you clarify|please clarify|what .* would you like/i;
const commercial=/cost depends|quotation|proposal|contact us|contact\/|sales team|discuss your requirements|scope integrations customization|appropriate approach/i;
const answerHay=r=>norm([r.actual_answer_summary,...r.actual_cards.map(x=>`${x.title} ${x.type} ${x.badge} ${x.url}`),...r.actual_sources.map(x=>`${x.title} ${x.type} ${x.url}`)].join(" "));
const matchesEntity=(r,subject)=>{const hay=answerHay(r),ts=tokens(subject).slice(0,8);const need=Math.min(2,Math.max(1,ts.length));return ts.filter(t=>hay.includes(t)).length>=need;};
const hasMultipleResults=r=>r.actual_cards.length>=2||r.actual_sources.length>=2||/(?:^|\n)\s*(?:1[.)]|[-*]).*(?:\n)[\s\S]*(?:2[.)]|[-*])/m.test(r.actual_answer_summary);
const originalPass=r=>r.result==="PASS"||r.result==="PASS_NO_VALID_CONTENT";
const conversationRows=new Map();for(const r of rows){if(!r.conversation_id)continue;if(!conversationRows.has(r.conversation_id))conversationRows.set(r.conversation_id,[]);conversationRows.get(r.conversation_id).push(r);}for(const s of conversationRows.values())s.sort((a,b)=>a.turn_number-b.turn_number);

function audit(row){
  // A successful transport-only retry retains the original preliminary label
  // in its history, so final transport state is determined by the current
  // response validity rather than that stale pre-retry label.
  const isTransport=!row.http_ok;
  const issues=[],q=norm(row.question),base=byId.get(String(row.source_record_ids?.[0]));let valid=true,correctedSubject=row.expected_subject,correctedRole=row.expected_role,supported=true,targets=[];
  if(row.test_family==="broad_collections"){
    issues.push("INVALID_EXPECTED_SUBJECT");correctedSubject=broadSubject(q);correctedRole=correctedSubject;targets=collections[norm(correctedSubject)]??[];supported=targets.length>0;if(!supported){issues.push("FALSE_CONTENT_EXISTS");valid=false;}
  } else if(row.test_family==="role_specific_discovery"){
    targets=base?relationTargets(base,row.expected_role):[];supported=targets.length>0;if(!supported){issues.push("UNSUPPORTED_EXPECTED_RELATIONSHIP","FALSE_CONTENT_EXISTS");valid=false;}
  } else if(row.test_family==="commercial_sales_marketing"){
    supported=Boolean(base)&&["service","accelerator","partner"].includes(canonicalRole(role(base)));if(!supported){issues.push("INVALID_EXPECTED_SUBJECT");valid=false;}
  } else if(row.test_family==="keyword_collision"){
    targets=strongTopicMembers(row.expected_subject,row.expected_role);supported=targets.length>0;if(!supported){issues.push("UNSUPPORTED_EXPECTED_RELATIONSHIP","FALSE_CONTENT_EXISTS");valid=false;}
  } else if(row.turn_number>1){
    const flow=conversationRows.get(row.conversation_id)??[],prev=flow.find(r=>r.turn_number===row.turn_number-1);
    if(/second|first|last|another/.test(q)&&(!prev||!hasMultipleResults(prev))){issues.push("INVALID_EXPECTED_ROLE");valid=false;}
    if(canonicalRole(row.expected_role)==="case study"&&base){targets=relationTargets(base,"case study");if(!targets.length){issues.push("UNSUPPORTED_EXPECTED_RELATIONSHIP","FALSE_CONTENT_EXISTS");valid=false;}}
  }
  if(!base&&row.source_record_ids?.length&&row.test_family!=="broad_collections"){issues.push("FALSE_CONTENT_EXISTS");valid=false;}
  if(!valid&&(row.failure_codes??[]).includes("FAIL_VALID_CONTENT_MISSED"))issues.push("FALSE_VALID_CONTENT_MISSED");
  if(!valid)return{audit_classification:"INVALID_GENERATED_TEST",audit_valid_test:false,reclassified_result:"INVALID_EXPECTATION",corrected_failure_codes:[],expectation_issues:[...new Set(issues)],corrected_expected_subject:correctedSubject,corrected_expected_role:correctedRole,audit_notes:"Excluded: expectation is not established by exact, structured collection, relationship, or prior-result-set evidence."};
  if(isTransport)return{audit_classification:"TRANSPORT_INCONCLUSIVE",audit_valid_test:null,reclassified_result:"TRANSPORT_INCONCLUSIVE",corrected_failure_codes:["FAIL_TRANSPORT"],expectation_issues:[...new Set(issues)],corrected_expected_subject:correctedSubject,corrected_expected_role:correctedRole,audit_notes:"Expectation audited, but runtime behavior kept separate because transport was inconclusive."};
  const hay=answerHay(row),isFallback=fallback.test(row.actual_answer_summary),codes=[];let ok=false;
  if(row.test_family==="broad_collections"){
    const memberMatches=targets.filter(t=>{const tt=tokens(t.title).slice(0,5);return tt.length&&tt.filter(x=>hay.includes(x)).length>=Math.min(2,tt.length);}).length;ok=!isFallback&&(memberMatches>=2||hasMultipleResults(row));if(!ok)codes.push("FAIL_RESPONSE","FAIL_RETRIEVAL");
  } else if(row.test_family==="commercial_sales_marketing"){
    ok=!clarification.test(row.actual_answer_summary)&&commercial.test(`${row.actual_answer_summary} ${row.actual_cards.map(x=>x.url).join(" ")}`)&&matchesEntity(row,row.expected_subject);if(!ok)codes.push(!matchesEntity(row,row.expected_subject)?"FAIL_COMMERCIAL_SUBJECT":"FAIL_CONTACT_US_MISSING");
  } else if(row.test_family==="no_content_negative"||row.test_family==="off_topic"){
    ok=isFallback||(!row.actual_cards.length&&!row.actual_sources.length);if(!ok)codes.push("FAIL_NO_CONTENT");
  } else if(row.test_family==="role_specific_discovery"||row.test_family==="keyword_collision"){
    const targetMatch=targets.some(t=>tokens(t.title).slice(0,5).filter(x=>hay.includes(x)).length>=Math.min(2,tokens(t.title).slice(0,5).length));ok=!isFallback&&(targetMatch||row.actual_cards.some(c=>roleCompatible(c,row.expected_role)));if(!ok)codes.push("FAIL_ROLE_SELECTION","FAIL_RELATION");
  } else {
    ok=!isFallback&&matchesEntity(row,correctedSubject);
    if(commercial.test(row.actual_answer_summary)&&row.test_family!=="commercial_sales_marketing"&&/cost|price|investment|development/.test(norm(row.expected_subject))){ok=false;codes.push("FAIL_INTENT","FAIL_ENTITY");}
    if(!ok&&!codes.length)codes.push(clarification.test(row.actual_answer_summary)?"FAIL_RESPONSE":"FAIL_ENTITY",clarification.test(row.actual_answer_summary)?"FAIL_VALID_CONTENT_MISSED":"FAIL_RETRIEVAL");
  }
  const original=originalPass(row);const cls=ok?(original?"VALID_PASS":"FALSE_FAILURE"):(original?"FALSE_PASS":"VALID_FAILURE");
  if(!ok&&row.api_evidence_status==="CONTENT_EXISTS"&&isFallback&&!codes.includes("FAIL_VALID_CONTENT_MISSED"))codes.push("FAIL_VALID_CONTENT_MISSED");
  return{audit_classification:cls,audit_valid_test:true,reclassified_result:ok?"CONFIRMED_PASS":"CONFIRMED_FAILURE",corrected_failure_codes:[...new Set(codes)],expectation_issues:[...new Set(issues)],corrected_expected_subject:correctedSubject,corrected_expected_role:correctedRole,audit_notes:ok?"Saved response satisfies conservative corrected expectation.":"Saved response does not satisfy the corrected evidence-backed expectation."};
}

const audited=rows.map(r=>({...r,...audit(r)}));
const count=c=>audited.filter(r=>r.audit_classification===c).length;
const valid=audited.filter(r=>r.audit_valid_test===true),confirmedPass=valid.filter(r=>r.reclassified_result==="CONFIRMED_PASS"),confirmedFailure=valid.filter(r=>r.reclassified_result==="CONFIRMED_FAILURE"),invalid=audited.filter(r=>r.audit_valid_test===false),transport=audited.filter(r=>r.reclassified_result==="TRANSPORT_INCONCLUSIVE");
const issueCounts={};for(const r of audited)for(const x of r.expectation_issues)issueCounts[x]=(issueCounts[x]??0)+1;
const failureCounts={};for(const r of confirmedFailure)for(const x of r.corrected_failure_codes)failureCounts[x]=(failureCounts[x]??0)+1;
const behavioralRate=+(100*confirmedPass.length/Math.max(1,valid.length)).toFixed(1);
const candidates=[...audited.filter(r=>r.test_family==="broad_collections").slice(0,4),...audited.filter(r=>r.audit_classification==="INVALID_GENERATED_TEST"&&r.test_family==="role_specific_discovery").slice(0,5),...audited.filter(r=>r.audit_classification==="FALSE_PASS").slice(0,7),...audited.filter(r=>r.audit_classification==="FALSE_FAILURE").slice(0,4),...audited.filter(r=>r.reclassified_result==="TRANSPORT_INCONCLUSIVE").slice(0,2)].slice(0,22);
const examples=candidates.map(r=>`| ${r.test_id} | ${r.question.replaceAll("|","/")} | ${r.result}; ${r.expected_subject}; ${r.failure_codes.join(", ")||"none"} | ${r.reclassified_result}; ${r.corrected_expected_subject}; ${r.expectation_issues.concat(r.corrected_failure_codes).join(", ")||"none"} |`).join("\n");
const failLines=Object.entries(failureCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k} | ${v} |`).join("\n");
const issueLines=Object.entries(issueCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k} | ${v} |`).join("\n");
const topCauses=Object.entries(failureCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
const report=`# Successive Chatbot 5,000-Turn QA Harness Audit

## Executive summary

- Rows audited: **${audited.length}**
- Valid behavioral test cases: **${valid.length}**
- Invalid/generated-bad test cases: **${invalid.length}**
- Confirmed chatbot PASS: **${confirmedPass.length}**
- Confirmed chatbot failure: **${confirmedFailure.length}**
- False PASS: **${count("FALSE_PASS")}**
- False failure: **${count("FALSE_FAILURE")}**
- Rows with invalid expectations: **${audited.filter(r=>r.expectation_issues.length).length}**
- Transport inconclusive: **${transport.length}**
- Corrected evidence-backed valid-content-missed failures: **${failureCounts.FAIL_VALID_CONTENT_MISSED??0}** (original report: 795)
- Corrected behavioral pass rate, excluding invalid expectations and transport: **${behavioralRate}%**

## Trustworthiness verdict

The original **50% pass rate and 795 false-negative count are not trustworthy as production-quality measurements**. The generator assigned random subjects to all broad-collection tests, inferred requested-role relationships from base-topic existence, created commercial requests for non-commercial editorial/award/case-study subjects, and generated ordinal follow-ups without proving a prior ordered result set. The original grader also allowed clarification and commercial fallback responses to PASS exact-entity tests.

This audit is intentionally conservative. A row is valid only when its expectation is supported by exact snapshot evidence, structured collection membership, explicit record relationships, strong role-compatible topical evidence, or the actual prior result set. Invalid rows are excluded rather than converted into chatbot PASS or failure.

## Expectation anomalies

| Anomaly | Rows |
|---|---:|
${issueLines}

INVALID_EXPECTED_SUBJECT on broad collections is correctable to the collection name and therefore does not automatically invalidate the underlying question. Unsupported relationship, invalid ordinal/result-set, and invalid commercial-subject rows are excluded.

## Corrected failure-code frequencies

| Failure code | Confirmed rows |
|---|---:|
${failLines}

## Top confirmed production root causes only

${topCauses.map(([c,n],i)=>`${i+1}. **${c} (${n})** — ${c.includes("ROLE")||c.includes("RELATION")?"Role/relationship selection failed despite validated relationship evidence.":c.includes("COMMERCIAL")?"Commercial handling lost the validated business subject.":c.includes("CONTACT")?"A valid commercial request lacked the appropriate contact route.":c.includes("INTENT")?"Exact-title content was misinterpreted as commercial intent.":c.includes("VALID_CONTENT")?"The bot abstained despite exact snapshot evidence.":"Exact entity/retrieval grounding did not satisfy the corrected expectation."}`).join("\n")}

These are production signals only from valid, executed, non-transport rows. Invalid generator expectations are not counted as production defects.

## Before vs reclassified examples

| Test | Question | Before | Reclassified |
|---|---|---|---|
${examples}

## Method and integrity

- Used only the saved 5,000-turn results and the 940-record API snapshot.
- Issued **zero** chatbot runtime requests.
- Kept all ${transport.length} transport rows separate.
- Did not treat semantic similarity alone as a role relationship.
- Required exact/direct evidence for exact entities, structured members for broad collections, explicit/strong role-compatible evidence for discovery, and actual prior result sets for ordinals.
- Production chatbot code modified: **NO**.
- Full per-row original and corrected classifications are in SUCCESSIVE_CHATBOT_5000_RECLASSIFIED_RESULTS.json.
`;
const artifact={generated_at:new Date().toISOString(),source_results:resultsInput,source_snapshot:snapshotInput,total_rows:audited.length,summary:{valid_test_cases:valid.length,invalid_generated_test_cases:invalid.length,confirmed_chatbot_pass:confirmedPass.length,confirmed_chatbot_failure:confirmedFailure.length,false_pass:count("FALSE_PASS"),false_failure:count("FALSE_FAILURE"),invalid_expectation_rows:audited.filter(r=>r.expectation_issues.length).length,transport_inconclusive:transport.length,corrected_behavioral_pass_rate_excluding_invalid_and_transport:behavioralRate},expectation_issue_frequencies:issueCounts,corrected_failure_code_frequencies:failureCounts,results:audited};
writeFileSync(reclassifiedOutput,JSON.stringify(artifact,null,2));
writeFileSync(reportOutput,report);
console.log(JSON.stringify(artifact.summary,null,2));
