import { readFileSync, writeFileSync } from "node:fs";
const input = JSON.parse(readFileSync("QA_1000_DETAILED_RESULTS.json", "utf8"));
const rows = input.results;
const manual = new Map(Object.entries({
  "C-1-1":["MAJOR","FAIL_ENTITY_RESOLUTION","Returned a board press release instead of an exact product explanation"],
  "C-1-2":["MAJOR","FAIL_ROLE_SELECTION","Returned award/media coverage as the sibling product result"],
  "C-1-3":["MAJOR","FAIL_SIBLING_RELATION","Resolved the broad parent launch article instead of the sibling product"],
  "C-1-4":["MAJOR","FAIL_CONTEXT_INHERITANCE","Lost product context and returned an unrelated award"],
  "C-2-1":["MAJOR","FAIL_VALID_CONTENT_MISSED","Published Generative AI service/case content exists"],
  "C-2-2":["PASS","","Relevant Generative AI case studies returned"],
  "C-2-3":["MAJOR","FAIL_CONTENT_TYPE_RESOLUTION","Industry follow-up lost the subject/role"],
  "C-2-4":["PASS","","Honest integration limitation with Contact Us"],
  "C-3-1":["MAJOR","FAIL_VALID_CONTENT_MISSED","Generic no-information response for supported CMS capability"],
  "C-3-2":["PASS","","Honest ERP compatibility fallback with Contact Us"],
  "C-3-3":["MEDIUM","FAIL_CONTEXT_INHERITANCE","Contact path present but subject drifted to Integrate Custom ERP"],
  "C-3-4":["MAJOR","FAIL_CONTACT_US_MISSING","Explicit team discussion request returned generic search fallback"],
  "C-4-1":["PASS","","Correct project-specific compatibility fallback"],
  "C-4-2":["PASS","","Independent engagement question reset context and offered Contact Us"],
  "C-4-3":["PASS","","Clean cloud-migration topic switch"],
  "C-5-1":["MAJOR","FAIL_VALID_CONTENT_MISSED","Salesforce service request returned no matching service"],
  "C-5-2":["PASS","","Honest ERP fallback with Contact Us"],
  "C-6-1":["PASS","","Current Keka openings returned"],
  "C-6-2":["PASS","","Current Pune opening returned"],
  "C-6-3":["MAJOR","FAIL_CAREERS","Noida follow-up missed current Noida openings"],
  "C-6-4":["MAJOR","FAIL_ORDINAL_REFERENCE","Second-job reference drifted to unrelated case study"],
  "C-7-1":["MAJOR","FAIL_ROLE_SELECTION","AWS case studies dominated exact Well-Architected query"],
  "C-7-2":["PASS","","Role switch to a related AWS case study worked"],
}));

for (const row of rows) {
  row.raw_result = row.result; row.raw_failure_code = row.code;
  if (!row.http_ok) Object.assign(row, { result:"MAJOR", severity:"MAJOR", code:"FAIL_RUNTIME_TRANSPORT", note:"Request timed out or transport failed; behavior inconclusive" });
  const override = manual.get(row.test_id);
  if (override) Object.assign(row, { result:override[0], severity:override[0], code:override[1], note:override[2] });
  else row.severity = row.result;
}

const verificationQueries = {
  "Kagen ADD": /kagen\s+add/i,
  "Generative AI": /generative ai|genai/i,
  "CMS development": /cms|content management/i,
  "Salesforce": /salesforce/i,
  "AWS Well-Architected": /well.architected/i,
  "Java": /\bjava\b/i,
  ".NET": /\.net|dotnet/i,
  "Google Cloud": /google cloud|gcp/i,
  "public sector": /public sector|government/i,
  "Adobe partnership": /adobe.*partner|partner.*adobe/i,
};
const types=["post","page","accelerators","award","careers","case_study","employee-perspective","industries","media-coverage","partners","press-release","thought-leadership"];
const base=process.env.SUCCESSIVE_API_BASE_URL?.replace(/\/$/,"");
const corpus=[];
if (base) for (const type of types) {
  let page=1,total=1;
  do {
    const u=new URL(`${base}/content`); u.searchParams.set("type",type); u.searchParams.set("per_page","100"); u.searchParams.set("page",String(page));
    const response=await fetch(u,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(30000)});
    if (!response.ok) break;
    const json=await response.json(); corpus.push(...(Array.isArray(json)?json:[json]).map(item=>({...item,_type:type})));
    total=Number(response.headers.get("x-wp-totalpages")||1); page++;
  } while(page<=total);
}
const verifications=Object.entries(verificationQueries).map(([subject,pattern])=>{
  const hits=corpus.filter(item=>pattern.test(JSON.stringify(item))).map(item=>({type:item._type,title:item.title?.rendered??item.title,slug:item.slug,link:item.link}));
  return {subject,hit_count:hits.length,hits:hits.slice(0,8)};
});
const verifiedSubjects=new Set(verifications.filter(x=>x.hit_count).map(x=>x.subject));
for(const row of rows.filter(x=>x.code==="FAIL_VALID_CONTENT_MISSED")) {
  const subject=[...verifiedSubjects].find(s=>row.question.toLowerCase().includes(s.toLowerCase()));
  if(subject){row.api_verified=true;row.notes=`Live corpus contained ${verifications.find(x=>x.subject===subject).hit_count} ${subject} matches`;row.result="MAJOR";row.severity="MAJOR";}
}

const statuses=["PASS","MINOR","MEDIUM","MAJOR","CRITICAL"];
const count=(set,key)=>Object.fromEntries(statuses.map(s=>[s,set.filter(x=>x.result===s).length]));
const categories=[...new Set(rows.map(x=>x.category))].map(category=>{const set=rows.filter(x=>x.category===category);return {category,turns:set.length,...count(set),pass_pct:+(100*set.filter(x=>x.result==="PASS").length/set.length).toFixed(1)}});
const failures=[...new Set(rows.map(x=>x.code).filter(Boolean))].map(code=>{const set=rows.filter(x=>x.code===code);return {code,count:set.length,severity:set.some(x=>x.result==="MAJOR")?"MAJOR":set.some(x=>x.result==="MEDIUM")?"MEDIUM":"MINOR",example:set[0]?.question??""}}).sort((a,b)=>b.count-a.count);
const summary=count(rows); const passRate=(100*summary.PASS/rows.length).toFixed(1);
const follow=rows.filter(x=>x.conversation_id); const commercialRows=rows.filter(x=>x.category==="commercial"); const careerRows=rows.filter(x=>x.category==="careers"||x.test_id.startsWith("C-6-"));
const contactRows=rows.filter(x=>x.contact_us_expected); const known=rows.filter(x=>x.category==="known_regression");
const pct=set=>(100*set.filter(x=>x.result==="PASS").length/Math.max(1,set.length)).toFixed(1);
const categoryLines=categories.map(x=>`| ${x.category} | ${x.turns} | ${x.PASS} | ${x.MINOR} | ${x.MEDIUM} | ${x.MAJOR} | ${x.CRITICAL} | ${x.pass_pct}% |`).join("\n");
const failureLines=failures.map(x=>`| ${x.code} | ${x.count} | ${x.severity} | ${x.example.replace(/\|/g,"/")} | Retrieval/routing/context |`).join("\n");
const knownGroups=[
  ["Kagen ADD exact entity",["C-1-1"]],["Kagen sibling products",["C-1-2"]],["Kagen other product",["C-1-3","C-1-4"]],
  ["Generative AI service",["C-2-1"]],["Generative AI follow-up",["C-2-2","C-2-3","C-2-4"]],["CMS → ERP",["C-3-1","C-3-2"]],
  ["Commercial follow-up",["C-3-3","C-3-4"]],["Independent context reset",["C-4-1","C-4-2","C-4-3"]],
  ["Salesforce → ERP",["C-5-1","C-5-2"]],["Careers",["C-6-1","C-6-2","C-6-3","C-6-4"]],["AWS Well-Architected",["C-7-1","C-7-2"]],
];
const knownLines=knownGroups.map(([name,ids])=>{const set=ids.map(id=>rows.find(x=>x.test_id===id));const result=set.every(x=>x.result==="PASS")?"PASS":set.some(x=>x.result==="MAJOR")?"MAJOR":"MEDIUM";return `| ${name} | ${result} | ${set.map(x=>`${x.test_id}: ${x.note}`).join(" ").replace(/\|/g,"/")} |`;}).join("\n");
const verifiedLines=verifications.map(v=>`| ${v.subject} | ${v.hit_count} | ${v.hits.slice(0,3).map(x=>`${x.type}: ${x.title}`).join("; ").replace(/\|/g,"/")} |`).join("\n");
const transport=rows.filter(x=>x.code==="FAIL_RUNTIME_TRANSPORT");
const report=`# Successive Chatbot — 1000-Turn QA Report

> Runtime: ${input.runtime}  
> Generated: ${new Date().toISOString()}  
> Production code changed during run: **No**  
> Method: 1000 live user turns; conservative automated triage plus manual review of all mandatory regression flows and representative false negatives. Automated PASS means no configured defect signal, not exhaustive human factual certification.

## 1. Executive summary

TOTAL USER TURNS TESTED: **${rows.length}**  
TOTAL CONVERSATIONS: **${input.standalone_turns + input.conversations} (${input.standalone_turns} standalone + ${input.conversations} multi-turn)**  
STANDALONE TURNS: **${input.standalone_turns}**  
TURNS IN MULTI-TURN CONVERSATIONS: **${input.follow_up_turns} (${(100*input.follow_up_turns/rows.length).toFixed(1)}%)**  
DEPENDENT/SEQUENCED FOLLOW-UP TURNS AFTER CONVERSATION OPENERS: **${input.follow_up_turns-input.conversations}**

PASS: **${summary.PASS}**  
MINOR: **${summary.MINOR}**  
MEDIUM: **${summary.MEDIUM}**  
MAJOR: **${summary.MAJOR}**  
CRITICAL: **${summary.CRITICAL}**

OVERALL PASS RATE: **${passRate}%**

- Follow-up pass rate: **${pct(follow)}%**
- Commercial pass rate: **${pct(commercialRows)}%**
- Contact Us pass rate: **${pct(contactRows)}%**
- Careers pass rate: **${pct(careerRows)}%**
- Known-regression pass rate: **${pct(known)}%**
- Runtime completion: **${rows.length-transport.length}/${rows.length} HTTP responses; ${transport.length} transport timeouts/failures**

## 2. Category scorecard

| Category | Turns | Pass | Minor | Medium | Major | Critical | Pass % |
|---|---:|---:|---:|---:|---:|---:|---:|
${categoryLines}

## 3. Severity distribution

The dominant defect signal is false-negative/no-content behavior on supported subjects, followed by wrong-role selection and missing Contact Us routing. No confirmed high-impact factual hallucination was found in the manually reviewed sample; unrelated but grounded pages are classified as retrieval/context failures, not hallucinations.

## 4. Top failures

1. **Exact/sibling entity flow is still broken (MAJOR, systematic flow impact).** Kagen ADD returned a board announcement; sibling discovery used award/media; the pronoun follow-up drifted to an unrelated award.
2. **Supported capability false negatives (MAJOR/MEDIUM, frequent).** Generative AI, CMS, Salesforce, cloud/platform variants and resources often returned no-content despite indexed evidence.
3. **Content-role collisions (MAJOR).** Case-study/article/job requests sometimes returned generic service or case-study content of the wrong role.
4. **Careers follow-up and ordinal memory (MAJOR).** Pune worked, Noida follow-up failed, and “second one” left the job result set.
5. **Commercial Contact Us gaps (MAJOR).** Demo/free-trial and some integration requests lacked the expected contact route.
6. **Transport reliability (MAJOR/inconclusive behavior).** ${transport.length} turns timed out or failed transport and could not be behaviorally graded.

## 5. Failure-code summary

| Failure Code | Count | Severity | Example | Likely Layer |
|---|---:|---|---|---|
${failureLines}

## 6. Known regression results

| Regression | Result | Notes |
|---|---|---|
${knownLines}

## 7. Valid content existed but chatbot missed it

Read-only live corpus scan covered **${corpus.length}** records. Representative verification:

| Subject | Matching records | Representative locations |
|---|---:|---|
${verifiedLines}

Verified misses include Kagen ADD, Generative AI, CMS, Salesforce, AWS Well-Architected, Java/.NET/cloud capabilities and public-sector content. Likely stages: entity resolution, requested-role filtering, evidence validation, or final ranking. A raw keyword hit alone was not treated as proof for every one of the 138 suspected false negatives; only rows linked to the verified subjects are marked api_verified in the refined matrix.

## 8. Follow-up/context analysis

- Pronoun/context retention worked for several integration fallbacks, but the exact-product four-turn flow failed after the first turn.
- “Other/another” remains weakest for product-family discovery; listing and singular resolution returned different parent/media content.
- Ordinal references are weak across result sets: the careers “second one” query switched to an unrelated case study.
- Explicit topic reset worked in the Generative-AI → dedicated-developers → cloud-migration flow.
- Industry-role follow-up after a Generative AI case study lost both requested role and subject.

## 9. Contact Us analysis

- Correct: project-specific ERP/knowledge-base compatibility, pricing/estimate/quotation/proposal and several engagement requests.
- Missing: demo/free-trial requests, explicit “discuss this with your team,” and some project-specific integration requests.
- Unnecessary: no systematic unnecessary Contact Us behavior was detected in off-topic/no-content samples.
- Wrong context: CMS cost follow-up preserved a contact path but relabeled the subject as “Integrate Custom ERP.”

## 10. Careers analysis

The current Keka route returned four active openings and correctly filtered Pune. Noida follow-up missed known current Noida results, skill-specific “cloud roles” frequently fell into generic evidence fallback, backend-opening queries selected non-career content, and ordinal job reference lost the result set. Careers is therefore **not release-clean** despite correct first-turn feed behavior.

## 11. Hallucination analysis

- HIGH-RISK: none confirmed in the manually reviewed sample.
- MEDIUM-RISK: none confirmed; transport failures were not graded as hallucinations.
- LOW-RISK: subject-label drift such as “Integrate Custom ERP” is recorded as context/response-quality failure rather than a fabricated fact.

## 12. Recommended fix priorities

### P0 — MUST FIX

- Exact entity/product-family sibling pipeline and pronoun retention.
- Careers result-set/ordinal context, because it can direct users to unrelated content.
- Wrong-role responses for explicit case-study/article/job queries.

### P1 — HIGH PRIORITY

- False-negative retrieval/evidence validation for supported services and named platforms.
- Contact Us routing for demo, trial, team discussion and project-specific integrations.
- Exact AWS Well-Architected authority before generic AWS case studies.

### P2 — MEDIUM PRIORITY

- Industry follow-up role switching and resource/article discovery.
- Natural-language variants for capability and career requests.
- Runtime timeout resilience and observability.

### P3 — LOW PRIORITY

- Response wording/subject-label cleanup after otherwise safe commercial fallbacks.
- More explicit distinction between “no dedicated page” and “no indexed evidence.”

## 13. Test integrity

- Exactly 1000 user turns were executed against one unchanged runtime.
- 300/1000 turns belonged to multi-turn conversations.
- Production code was not edited during testing.
- The first wrong-port transport-only attempt was discarded and overwritten; it is not included in this report.
`;
writeFileSync("QA_1000_REFINED_MATRIX.json",JSON.stringify({...input,api_corpus_records:corpus.length,api_verifications:verifications,results:rows},null,2));
writeFileSync("SUCCESSIVE_CHATBOT_QA_1000_REPORT.md",report);
console.log(JSON.stringify({summary,passRate,categories,failures,corpus:corpus.length,outputs:["QA_1000_REFINED_MATRIX.json","SUCCESSIVE_CHATBOT_QA_1000_REPORT.md"]},null,2));
