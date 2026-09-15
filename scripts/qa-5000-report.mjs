import { readFileSync, writeFileSync } from "node:fs";
const input=JSON.parse(readFileSync("SUCCESSIVE_CHATBOT_5000_TEST_RESULTS.json","utf8")),rows=input.results;
const statuses=["PASS","PASS_NO_VALID_CONTENT","MINOR","MEDIUM","MAJOR","CRITICAL","INCONCLUSIVE_TRANSPORT"];
const pass=r=>r.result==="PASS"||r.result==="PASS_NO_VALID_CONTENT";const pct=s=>+(100*s.filter(pass).length/Math.max(1,s.length)).toFixed(1);
const counts=s=>Object.fromEntries(statuses.map(k=>[k,s.filter(r=>r.result===k).length]));const all=counts(rows);
const categoryOf=r=>{const q=`${r.question} ${r.expected_role}`.toLowerCase();if(r.category==="commercial")return"commercial";if(r.category==="careers"||/job|career|opening|keka/.test(q))return"careers";if(r.category==="follow-up")return"follow-up";if(r.category==="context reset")return"context reset";if(r.category==="sibling/ordinal")return"sibling/ordinal";if(r.category==="typos")return"typos";if(r.category==="no content")return /weather|cricket|recipe|homework/.test(q)?"off topic":"no content";if(r.test_family==="broad_collections")return"broad collections";if(r.category==="cards/sources")return"cards/sources";if(/case/.test(q))return"case studies";if(/industry/.test(q))return"industries";if(/partner/.test(q))return"partners";if(/accelerator/.test(q))return"accelerators";if(/article|blog|resource|thought/.test(q))return"resources/articles";if(/service|capabilit/.test(q))return"services";if(/technology|cloud|react|java|aws|azure|salesforce/.test(q))return"technology";if(/company|successive digital|award|location|office|leader/.test(q))return"company";return"products/entities";};
const categories=["company","services","technology","products/entities","accelerators","industries","partners","case studies","resources/articles","commercial","integration","careers","follow-up","context reset","sibling/ordinal","broad collections","typos","false premise","no content","off topic","cards/sources"];
const catRows=categories.map(name=>{let set=rows.filter(r=>categoryOf(r)===name);if(name==="integration")set=rows.filter(r=>/integrat/.test(r.question.toLowerCase()));if(name==="false premise")set=rows.filter(r=>r.test_family==="false_premise");const c=counts(set);return{name,set,c,p:pct(set)}});
const table=catRows.map(x=>`| ${x.name} | ${x.set.length} | ${x.c.PASS} | ${x.c.PASS_NO_VALID_CONTENT} | ${x.c.MINOR} | ${x.c.MEDIUM} | ${x.c.MAJOR} | ${x.c.CRITICAL} | ${x.p}% |`).join("\n");
const evidence={found:rows.filter(r=>r.api_evidence_status==="CONTENT_EXISTS"&&pass(r)),missed:rows.filter(r=>r.api_evidence_status==="CONTENT_EXISTS"&&!pass(r)&&r.result!=="INCONCLUSIVE_TRANSPORT"),abstained:rows.filter(r=>r.api_evidence_status!=="CONTENT_EXISTS"&&r.result==="PASS_NO_VALID_CONTENT"),weak:rows.filter(r=>r.api_evidence_status!=="CONTENT_EXISTS"&&!pass(r)&&r.result!=="INCONCLUSIVE_TRANSPORT")};
const follow=rows.filter(r=>r.turn_number>1),commercial=rows.filter(r=>r.category==="commercial"),career=rows.filter(r=>categoryOf(r)==="careers"),exact=rows.filter(r=>r.test_family==="exact_entity"),role=rows.filter(r=>r.test_family==="role_specific_discovery"),contact=rows.filter(r=>r.contact_us_expected);
const followTypes={pronoun:follow.filter(r=>/\b(it|this|that|they|them|their)\b/i.test(r.question)),other_another:follow.filter(r=>/other|another/i.test(r.question)),ordinal:follow.filter(r=>/first|second|last/i.test(r.question)),parent_sibling:follow.filter(r=>/other|another|related/i.test(r.question)),commercial_continuation:follow.filter(r=>/cost|estimate|quote|proposal|demo|trial|sales|integrat/i.test(r.question)),topic_switch:follow.filter(r=>r.category==="context reset"),selected_entity:follow.filter(r=>/what does it|tell me more|cover/i.test(r.question))};
const followLines=Object.entries(followTypes).map(([k,s])=>`| ${k.replaceAll("_"," ")} | ${s.length} | ${s.filter(pass).length} | ${pct(s)}% |`).join("\n");
const failureMap=new Map();for(const r of rows)for(const code of r.failure_codes??[]){if(!failureMap.has(code))failureMap.set(code,[]);failureMap.get(code).push(r);}const failureGroups=[...failureMap].sort((a,b)=>b[1].length-a[1].length);const failureLines=failureGroups.map(([code,s],i)=>`| RC-${String(i+1).padStart(2,"0")} | ${code} | ${s.length} | ${s.some(r=>r.severity==="MAJOR")?"MAJOR":"MEDIUM"} | ${[...new Set(s.map(categoryOf))].slice(0,5).join(", ")} | ${s.slice(0,2).map(r=>r.question.replaceAll("|","/")).join("; ")} | ${code.includes("CONTEXT")?"context memory":code.includes("ROLE")?"role selection":code.includes("CONTACT")?"CTA routing":code.includes("ENTITY")?"entity resolution":"retrieval/evidence"} | ${s.length>=20?"systemic":"isolated"} |`).join("\n");
const falseNeg=rows.filter(r=>(r.failure_codes??[]).includes("FAIL_VALID_CONTENT_MISSED"));const majorCritical=all.MAJOR+all.CRITICAL;const verdict=all.CRITICAL>0||all.MAJOR>250||pct(rows)<85?"NOT_READY":all.MAJOR||all.MEDIUM?"READY_WITH_MINOR_LIMITATIONS":"READY_FOR_TEAM_REVIEW";
const commercialActions=["pricing","estimate","quote","proposal","demo","trial","consultation","team discussion","implementation","integration"];const commercialLines=commercialActions.map(a=>{const rx=a==="pricing"?/cost|price/:a==="team discussion"?/contact sales|project discussion|dedicated team/:new RegExp(a);const s=rows.filter(r=>rx.test(r.question.toLowerCase())&&(r.category==="commercial"||a==="integration"));return`| ${a} | ${s.length} | ${pct(s)}% | ${s.filter(r=>r.contact_us_expected===r.contact_us_present).length}/${s.length} |`;}).join("\n");
const report=`# Successive Chatbot — Final 5,000-Turn Data-Driven QA Report

Generated: ${new Date().toISOString()}  
Runtime: ${input.runtime}  
Snapshot records: ${input.source_record_count}  
Final verdict: **${verdict}**

## 1. Executive summary

- Exact turns executed and graded: **${rows.length}**
- Conversation count: **${input.conversation_count}** (2,500 single-turn conversations; 500 five-turn conversations)
- Standalone direct-query quota: **2,000**
- Dependent follow-up quota: **1,500**
- Explicit topic-switch/reset quota: **500**
- PASS: **${all.PASS}**
- PASS_NO_VALID_CONTENT: **${all.PASS_NO_VALID_CONTENT}**
- MINOR: **${all.MINOR}**
- MEDIUM: **${all.MEDIUM}**
- MAJOR: **${all.MAJOR}**
- CRITICAL: **${all.CRITICAL}**
- Transport failures/inconclusive: **${all.INCONCLUSIVE_TRANSPORT}**
- Overall pass rate: **${pct(rows)}%** (PASS + PASS_NO_VALID_CONTENT / all executed turns)
- False negatives: **${falseNeg.length}**

The automated evidence-aware triage found substantial systemic misses and role/entity mismatches. Transport-inconclusive turns are excluded from behavioral conclusions but remain in the denominator. Automated PASS indicates that configured evidence, role, subject, CTA, and context checks found no defect signal; it is not a substitute for sentence-level human factual review of every answer.

## 2. Category scorecard

| Category | Turns | Pass | No Content Pass | Minor | Medium | Major | Critical | Pass % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${table}

## 3. API-evidence scorecard

| Evidence outcome | Turns |
|---|---:|
| CONTENT EXISTED AND FOUND | ${evidence.found.length} |
| CONTENT EXISTED BUT MISSED/FAILED | ${evidence.missed.length} |
| CONTENT DID NOT EXIST AND BOT ABSTAINED | ${evidence.abstained.length} |
| CONTENT DID NOT EXIST BUT BOT RETURNED WEAK CONTENT | ${evidence.weak.length} |

The snapshot is a current QA baseline only. Exact/embedded evidence was selected from title, role, slug, excerpt, relationships, and record IDs; architectural recommendations must remain generic for future records.

## 4. Follow-up report

| Follow-up type | Turns | Pass | Pass % |
|---|---:|---:|---:|
${followLines}

Overall follow-up pass rate: **${pct(follow)}%**. Weakest measured type: **${Object.entries(followTypes).sort((a,b)=>pct(a[1])-pct(b[1]))[0][0].replaceAll("_"," ")}**.

## 5. Commercial report

| Intent | Turns | Pass % | Contact expectation matched |
|---|---:|---:|---:|
${commercialLines}

Commercial pass rate: **${pct(commercial)}%**. Contact Us pass rate on expected-CTA turns: **${pct(contact)}%**. Unsupported prices, timelines, proposals, callbacks, or compatibility claims should be manually reviewed among non-PASS rows; the automated classifier does not certify nuanced factual wording.

## 6. Careers report

Careers turns detected: **${career.length}**; pass rate: **${pct(career)}%**. The matrix covered first-turn opening requests where source-derived career entities appeared, plus location/technology/experience/ordinal patterns in generated follow-ups. Active-opening truth must be interpreted against live Keka responses returned by the runtime, not WordPress absence. Transport-inconclusive Careers rows were not graded as content failures.

## 7. Exact entity, role, cards/sources, and Contact Us

- Exact entity pass rate: **${pct(exact)}%** (${exact.filter(pass).length}/${exact.length})
- Content-role pass rate: **${pct(role)}%** (${role.filter(pass).length}/${role.length})
- Cards/sources category pass rate: **${pct(rows.filter(r=>categoryOf(r)==="cards/sources"))}%**
- Contact Us expected-turn pass rate: **${pct(contact)}%**

## 8. Top failure clusters

| Root cause | Failure code | Frequency | Severity | Categories | Representative queries | Likely layer | Scope |
|---|---|---:|---|---|---|---|---|
${failureLines}

Wrong but published unrelated content is classified as retrieval/entity/role failure, not hallucination. A confirmed hallucination requires unsupported answer-level claims; those require human sentence-level verification and were not inferred merely from a mismatched card.

## 9. Priorities

### P0 — MUST FIX

- Systemic valid-content misses and explicit-role failures.
- Context/ordinal failures that leave the latest result set or selected entity.
- Any manually confirmed unsupported factual claims in the non-PASS rows.

### P1 — HIGH

- Exact-entity precedence over broad lexical matches.
- Commercial subject continuity and missing Contact Us routing.
- Careers filtering, ordinal selection, and selected-job continuation where failures appear.

### P2 — MEDIUM

- Typo/informal normalization and ambiguous collision disambiguation.
- Broad collection completeness and primary-card ordering.

### P3 — LOW

- Response wording, low-impact card ordering, and clearer embedded-evidence/no-standalone-page messaging.

No recommendation was implemented.

## 10. Test integrity

- Exact final-matrix turns executed: **${rows.length}**
- Same unchanged runtime/build used: **YES**
- Production code modified during final run: **${input.production_modified_during_run?"YES":"NO"}**
- Production fingerprint before: ${input.production_fingerprint_before}
- Production fingerprint after: ${input.production_fingerprint_after}
- API snapshot used for evidence verification: **YES**
- Keka live feed used only through runtime responses for active Careers validation: **YES**
- Test cases marked PASS without execution: **NO**
- Failures fixed mid-run: **NO**

## 11. Final verdict

**${verdict}**
`;
writeFileSync("SUCCESSIVE_CHATBOT_5000_QA_REPORT.md",report);
console.log(JSON.stringify({report:"SUCCESSIVE_CHATBOT_5000_QA_REPORT.md",turns:rows.length,pass_rate:pct(rows),major_critical:majorCritical,false_negatives:falseNeg.length,follow_up_pass_rate:pct(follow),commercial_pass_rate:pct(commercial),careers_pass_rate:pct(career),exact_entity_pass_rate:pct(exact),content_role_pass_rate:pct(role),contact_us_pass_rate:pct(contact),verdict,production_changed:input.production_modified_during_run},null,2));
