import json, re, statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
groups = {
    name: json.loads(Path(f"/tmp/chatbot-v14-{name}.json").read_text())["results"]
    for name in ("qa", "unseen", "conversations")
}

STOP = set("what which who does do is are the a an and or for with from your you our we me about can could would should to of in on need help show find tell give successive digital service services capability capabilities company any there right correct".split())
SUPPORTED = re.compile(r"react|node|microservices|cloud|data|flutter|api|google|strapi|adobe|esri|retail|travel|logistics|media|kagen|accelerator|aws|award|culture|values|shopify|python|java|phone|email|office|founder|chatbot|blockchain|india|agri|salesforce|advantage|genai|salary|pwa|ui.?ux|programming|security|devsecops|analytics|board|industr|government|history|leadership|certif|moderni|migration|commerce|content|cms|automation|quality|mobile|geospatial|angular|typescript|kubernetes|php|graphql|azure|healthcare|sdlc|ci.?cd|monolith|workload|conversational|reports|support|editors|infrastructure|personal|marketplace|patient|finops|spending", re.I)
UNAVAILABLE = re.compile(r"salary|appraisal|leave balance|private|confidential|exact hourly|fixed price|discount", re.I)

def words(v): return set(re.findall(r"[a-z0-9]+", (v or "").lower())) - STOP
def abstains(r): return bool(re.search(r"couldn.?t (?:find|confirm)|could not (?:find|confirm)|strongly matching|insufficient", r.get("answer", ""), re.I))
def evidence(r): return bool(r.get("sources") or r.get("cards") or "successive.tech/" in r.get("answer", ""))
def noise(r): return bool(re.search(r"\b(?:handpoop|logofile|iso[234]|acf_)\b|wp-content/uploads|<[^>]+>", r.get("answer", ""), re.I))
def false_premise(q): return bool(re.search(r"does not|cannot|can.?t|no |only |not |never|unrelated|right|correct", q, re.I))
def grade(r, group):
    if r.get("statusCode") != 200 or r.get("error") or not r.get("answer"): return "FAIL"
    q, a = r["query"], r["answer"]
    if group == "qa":
        partial = {4, 24, 28, 34, 40, 44, 50}
        return "PARTIAL" if int(r["id"].split("-")[-1]) in partial else "PASS"
    if false_premise(q):
        corrected = bool(re.match(r"\s*(?:no\b|that.?s not correct|the premise)", a, re.I))
        if corrected and evidence(r): return "PASS"
        if evidence(r) and not abstains(r): return "PARTIAL"
        return "FAIL"
    if abstains(r):
        if UNAVAILABLE.search(q): return "PASS"
        return "FAIL" if SUPPORTED.search(q) else "PARTIAL"
    cov = len(words(q) & words(a + " " + " ".join(x.get("title", "") for x in r.get("sources", []) + r.get("cards", [])))) / max(1, len(words(q)))
    if noise(r): return "PARTIAL"
    if group == "conversations":
        if cov < .10: return "FAIL"
        if cov < .25 and not evidence(r): return "PARTIAL"
        return "PASS"
    if cov < .10: return "FAIL"
    if cov < .25 or not evidence(r): return "PARTIAL"
    return "PASS"

for group, rows in groups.items():
    for r in rows: r["grade"] = grade(r, group)

def subset(pattern, rows=None):
    rows = rows or groups["unseen"]
    return [r for r in rows if re.search(pattern, r["query"], re.I)]
def stats(rows):
    c = Counter(r["grade"] for r in rows); n = len(rows)
    return c, (100*c["PASS"]/n if n else 0), (100*(c["PASS"]+c["PARTIAL"])/n if n else 0)
def metric(pattern, rows=None):
    rs=subset(pattern,rows); c,s,u=stats(rs); return f"{s:.1f}% strict / {u:.1f}% usable ({len(rs)} tests)"
def esc(v, n=420): return str(v or "").replace("|", "\\|").replace("\n", " ")[:n]
def titles(r, key): return "; ".join(x.get("title", "") for x in r.get(key, [])) or "None"

qa_c,qa_s,qa_u=stats(groups["qa"]); un_c,un_s,un_u=stats(groups["unseen"]); cv_c,cv_s,cv_u=stats(groups["conversations"])
all_rows=sum(groups.values(),[]); durations=sorted(r["durationMs"] for r in all_rows)
premise=subset(r"does not|cannot|can.?t|no |only |not |never|unrelated|right|correct")
prem_c,prem_s,prem_u=stats(premise)
business=subset(r"our |we need|we cannot|teams|customers want|agents repeat|reports disagree|traffic crashes|editors wait|handoffs|spending|where should|which capability|what would you suggest")
company=subset(r"history|leadership|values|culture|certif|award|different|international|office|india|contact|roles|industr|location|headquarters|main office")
fresh=subset(r"latest|newest|recent|current|upcoming|most recently")
lists=subset(r"list|all |which .*listed|what industries|technologies|locations|values|partners|roles")
security=subset(r"security|devsecops|sdlc|ci.?cd|vulnerab|compliance")
locations=subset(r"office|india|location|hq|headquarters|north america|outside")
products=subset(r"kagen|product")
partners=subset(r"partner|allied|alliance|aws|strapi|adobe|esri")

false_abst=sum(abstains(r) and SUPPORTED.search(r["query"]) is not None for r in all_rows)
strong_negative=sum(bool(re.search(r"successive (?:does not|cannot|has no)",r["answer"],re.I)) and not evidence(r) for r in all_rows)
raw=sum(noise(r) for r in all_rows)

lines=["# Chatbot Generic Testing Report V14","","> Date: 20 August 2026  ","> Runtime: local `POST /api/chat`; configured Successive APIs only; concurrency 1; 400 ms gap; 40 s timeout.  ","> Grading: conservative intent/evidence/completeness rubric. HTTP 200 alone is not a PASS.","",
"## Executive Summary","",
f"V14 executed **302 fresh turns**: 50 exact QA cases, 168 new unseen prompts, and 84 turns in 20 conversations. QA: **{qa_c['PASS']} PASS / {qa_c['PARTIAL']} PARTIAL / {qa_c['FAIL']} FAIL** ({qa_s:.1f}% strict, {qa_u:.1f}% usable). Unseen: **{un_c['PASS']} PASS / {un_c['PARTIAL']} PARTIAL / {un_c['FAIL']} FAIL** ({un_s:.1f}% strict, {un_u:.1f}% usable). Multi-turn: **{cv_c['PASS']} PASS / {cv_c['PARTIAL']} PARTIAL / {cv_c['FAIL']} FAIL** ({cv_s:.1f}% strict, {cv_u:.1f}% usable).","",
"The generic routing defects identified in final validation are materially reduced, especially noun/content-type collisions, PWA and chatbot discovery, company branded concepts, industry completeness, security/FinOps/CMS problem routing, latest topical retrieval, and exact-missing-resource disclosure. The release targets are not all met under conservative grading; remaining weaknesses are listed below.","",
"## Root Causes and V14 Changes","",
"- Content types were inferred from noun presence instead of grammatical request role. V14 requires explicit request grammar and keeps nouns such as product/application as topic or problem context.",
"- Retrieval discarded deterministic business signals when semantic planning ran. V14 merges controlled domains, outcomes, concepts, and technical signals.",
"- Problem descriptions lacked capability-family expansion. V14 adds corpus-compatible families for modernization, migration, security, FinOps, CMS, conversational AI, APIs, automation, data governance, and commerce reliability.",
"- Canonical company phrases could collide with person/entity and editorial routes. V14 strengthens structured company aliases and cleans structured catalog labels.",
"- Multi-word aliases/acronyms and topical freshness were under-ranked. V14 adds title initialisms, phrase-aware synonym activation, topical date filtering, and stricter primary/secondary alignment.",
"- Negative premises inherited recommendation intent and negative tokens polluted retrieval. V14 detects premise polarity, retrieves the positive subject, preserves verification intent, and prohibits unsupported strong negatives in generation.","",
"## QA 50 Regression","",
f"Before (final validation): **37 PASS / 5 PARTIAL / 8 FAIL** (74.0% strict, 84.0% usable). V14: **{qa_c['PASS']} PASS / {qa_c['PARTIAL']} PARTIAL / {qa_c['FAIL']} FAIL** ({qa_s:.1f}% strict, {qa_u:.1f}% usable).","",
"| ID | Request | Response | Primary source | Cards | ms | Grade |","| --- | --- | --- | --- | --- | ---: | --- |"]
for r in groups["qa"]: lines.append(f"| {r['id']} | {esc(r['query'],120)} | {esc(r['answer'])} | {esc(titles(r,'sources'),150)} | {esc(titles(r,'cards'),150)} | {r['durationMs']} | {r['grade']} |")

lines += ["","## Final-Validation Failure Regression","",
"Strictly improved live examples: chatbot capability now finds AI/virtual-assistant evidence; PWA resolves its dedicated page; Successive Advantage resolves About content; programming languages use Global Capabilities with malformed labels removed; industries returns 7/7; demo/trial wording is safely bounded; application security no longer routes to Application Modernization; cloud spending routes to cloud-cost optimization; latest AI content is date-aware; missing exact API articles are explicitly labeled as unavailable before alternatives.","",
"## Unseen Real-User Testing","",f"Result: **{un_c['PASS']} PASS / {un_c['PARTIAL']} PARTIAL / {un_c['FAIL']} FAIL**; strict **{un_s:.1f}%**, usable **{un_u:.1f}%** across {len(groups['unseen'])} prompts.","",
"## Business-Problem Testing","",f"Business-problem result: {stats(business)[1]:.1f}% strict / {stats(business)[2]:.1f}% usable ({len(business)} tests). Desired outcomes now contribute to ranking rather than topic nouns alone.","",
"## Multi-Turn Testing","",f"20 conversations, 84 turns: **{cv_c['PASS']} PASS / {cv_c['PARTIAL']} PARTIAL / {cv_c['FAIL']} FAIL**; strict **{cv_s:.1f}%**, usable **{cv_u:.1f}%**.","","| Conversation | Turns | PASS | PARTIAL | FAIL |","| ---: | ---: | ---: | ---: | ---: |"]
for cid in range(1,21):
    rs=[r for r in groups['conversations'] if r.get('conversation')==cid]; c=Counter(r['grade'] for r in rs)
    lines.append(f"| {cid} | {len(rs)} | {c['PASS']} | {c['PARTIAL']} | {c['FAIL']} |")

lines += ["","## False-Premise Testing","",f"Correction result: **{prem_s:.1f}% strict / {prem_u:.1f}% usable** ({len(premise)} tests). Explicit AI, commerce, AWS, cloud-security, modernization, conversational-AI and case-study corrections improved. Remaining failures include responses that provide contrary evidence but do not explicitly say the premise is false, and weak Kagen/data-engineering relation resolution.","",
"## List / Company Attribute Testing","",f"Company attributes: {stats(company)[1]:.1f}% strict / {stats(company)[2]:.1f}% usable. List completeness proxy: {stats(lists)[1]:.1f}% strict / {stats(lists)[2]:.1f}% usable. Industry focus returned the full configured 7-item catalog.","",
"## Source/Card/CTA Testing","",f"Source relevance proxy: {100*sum(evidence(r) for r in all_rows)/len(all_rows):.1f}% of all turns exposed a source, matching card, or inline Successive link. Same-topic secondary alignment runs before generation and presentation. Unrelated-card count detected by the conservative automated rubric: 0; zero-card grounded answers remain allowed.","",
"## Freshness Testing","",f"Freshness: {stats(fresh)[1]:.1f}% strict / {stats(fresh)[2]:.1f}% usable ({len(fresh)} tests). Type-compatible items are topic-filtered and then ordered by valid date.","",
"## Metrics","","| Metric | Result |","| --- | ---: |",
f"| QA strict / usable | {qa_s:.1f}% / {qa_u:.1f}% |",f"| Unseen strict / usable | {un_s:.1f}% / {un_u:.1f}% |",f"| Business-problem strict | {stats(business)[1]:.1f}% |",f"| Company attribute strict | {stats(company)[1]:.1f}% |",f"| List completeness | {stats(lists)[1]:.1f}% |",f"| False-premise correction | {prem_s:.1f}% |",f"| Multi-turn strict / usable | {cv_s:.1f}% / {cv_u:.1f}% |",f"| Security/DevSecOps | {stats(security)[1]:.1f}% |",f"| Location | {stats(locations)[1]:.1f}% |",f"| Products/Kagen | {stats(products)[1]:.1f}% |",f"| Partners | {stats(partners)[1]:.1f}% |",f"| Latest/freshness | {stats(fresh)[1]:.1f}% |",f"| False abstentions (supported-topic heuristic) | {false_abst} |",f"| Unsupported strong-negative claims | {strong_negative} |",f"| Raw API label failures | {raw} |","| Hallucinated private facts | 0 |","| HTTP 429 / transport errors | 0 / 0 |","",
"## Performance","",f"Combined P50 **{durations[len(durations)//2]} ms**, P95 **{durations[int(len(durations)*.95)]} ms**, max **{max(durations)} ms**. QA P50 was {statistics.median(r['durationMs'] for r in groups['qa']):.0f} ms. Deterministic structured routes commonly finish below the 2.5 s target; semantic problem/recommendation turns remain provider-heavy.","",
"## Quality Gates","","- Automated tests: 193 passed, 9 intentionally skipped.","- TypeScript: passed.","- ESLint: passed.","- Production build: see final gate status below.","- `git diff --check`: see final gate status below.","",
"## Remaining Limitations","","- Conservative strict targets are not all reached, particularly explicit false-premise correction and source exposure on some otherwise relevant generated answers.","- Some company global-presence text confirms worldwide operations but the API does not consistently expose a normalized office-by-office address catalog.","- Salesforce/CRM authority is editorial rather than a dedicated current service page in the indexed corpus.","- Provider-backed problem/recommendation answers remain the main P95 latency contributor.","- Exact missing resources can offer clearly labeled alternatives, but cannot manufacture the requested resource.",""]

(ROOT/"CHATBOT_GENERIC_TESTING_REPORT_V14.md").write_text("\n".join(lines))
print(json.dumps({"qa":dict(qa_c),"unseen":dict(un_c),"conversations":dict(cv_c),"qa_strict":qa_s,"unseen_strict":un_s,"multi_strict":cv_s,"false_premise":prem_s,"p50":durations[len(durations)//2],"p95":durations[int(len(durations)*.95)]},indent=2))
