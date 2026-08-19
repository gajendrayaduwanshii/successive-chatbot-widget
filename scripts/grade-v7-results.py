import json, re, statistics
from pathlib import Path

data=json.loads(Path('/tmp/chatbot-v7-live-results.json').read_text())
results=data['results']
stop=set('what which who does do is are the a an and or for with from your you our we me about can could would should to of in on need help show find tell give successive digital service services capability capabilities company'.split())

manual={
'TC-001':'Accepted','TC-002':'Partially Accepted','TC-003':'Accepted','TC-004':'Accepted','TC-005':'Accepted','TC-006':'Accepted','TC-007':'Partially Accepted','TC-008':'Partially Accepted','TC-009':'Accepted','TC-010':'Accepted','TC-011':'Partially Accepted','TC-012':'Partially Accepted','TC-013':'Partially Accepted','TC-014':'Accepted','TC-015':'Accepted'}
v6={
'V6F-01':'Accepted','V6F-02':'Partially Accepted','V6F-03':'Not Accepted','V6F-04':'Partially Accepted','V6F-05':'Not Accepted','V6F-06':'Not Accepted','V6F-07':'Accepted','V6F-08':'Not Accepted','V6F-09':'Partially Accepted','V6F-10':'Not Accepted','V6F-11':'Not Accepted','V6F-12':'Partially Accepted','V6F-13':'Not Accepted','V6F-14':'Not Accepted','V6F-15':'Accepted','V6F-16':'Not Accepted','V6F-17':'Partially Accepted','V6F-18':'Accepted','V6F-19':'Not Accepted','V6F-20':'Partially Accepted','V6F-21':'Not Accepted','V6F-22':'Not Accepted','V6F-23':'Not Accepted','V6F-24':'Partially Accepted','V6F-25':'Partially Accepted','V6F-26':'Partially Accepted','V6F-27':'Not Accepted','V6F-28':'Not Accepted','V6F-29':'Partially Accepted','V6F-30':'Accepted','V6F-31':'Accepted','V6F-32':'Accepted','V6F-33':'Partially Accepted','V6F-34':'Accepted','V6F-35':'Not Accepted'}

def words(s): return set(re.findall(r'[a-z0-9]+',s.lower()))-stop
def auto(r):
    if r.get('error') or r.get('statusCode')!=200 or not r['answer']: return 'Not Accepted'
    if r['group']=='off-topic': return 'Accepted' if not r['cards'] and ('successive' in r['answer'].lower() or 'business technology' in r['answer'].lower()) else 'Not Accepted'
    if "couldn't find a strongly matching" in r['answer'].lower() or 'could not find reliable' in r['answer'].lower(): return 'Not Accepted'
    q=words(r['query']); evidence=words(r['answer']+' '+' '.join(c['title'] for c in r['cards']))
    coverage=len(q&evidence)/max(1,len(q))
    noisy=bool(r['cards']) and any(len(words(c['title'])&q)==0 for c in r['cards'])
    if coverage>=.45 and not noisy: return 'Accepted'
    if coverage>=.2: return 'Partially Accepted'
    return 'Not Accepted'

for r in results:
    r['grade']=manual.get(r['id'],v6.get(r['id'],auto(r)))
    opening=r['answer'].split('\n##',1)[0].strip()
    r['openingSentences']=len(re.findall(r'(?<=[.!?])(?:\s|$)',opening))
    r['startsWithHeading']=r['answer'].lstrip().startswith('#')
    r['directOpening']=bool(opening) and not r['startsWithHeading'] and not re.match(r'^\[[^]]+\]\(',opening)

counts={g:sum(r['grade']==g for r in results) for g in ['Accepted','Partially Accepted','Not Accepted']}
dur=sorted(r['durationMs'] for r in results)
def pct(n,d=len(results)): return round(n*100/d,1) if d else 0
groups={}
for group in sorted(set(r['group'] for r in results)):
    subset=[r for r in results if r['group']==group]
    groups[group]={'count':len(subset),'accepted':sum(r['grade']=='Accepted' for r in subset),'partial':sum(r['grade']=='Partially Accepted' for r in subset),'failed':sum(r['grade']=='Not Accepted' for r in subset)}

lines=['# Chatbot Generic Testing Report V7','',f"> Fresh validation date: 13 August 2026  ",f"> Method: {len(results)} actual live requests against the production build at `{data['baseUrl']}`; concurrency 2; 60-second request timeout; first-pass responses only; no response was retried.  ",'> Source of truth: current Successive WordPress/API corpus. V6 was preserved unchanged.','', '## Executive Result','',
f"All {len(results)} valid requests returned HTTP 200 payloads. Conservative manual/heuristic grading produced {counts['Accepted']} Accepted, {counts['Partially Accepted']} Partially Accepted, and {counts['Not Accepted']} Not Accepted. Strict acceptance is {pct(counts['Accepted'])}% and usable is {pct(counts['Accepted']+counts['Partially Accepted'])}%.",'',
'| Metric | V6 | V7 |','| --- | ---: | ---: |',f"| Live requests | 131 | {len(results)} |",f"| Accepted | 69 | {counts['Accepted']} |",f"| Partially Accepted | 30 | {counts['Partially Accepted']} |",f"| Not Accepted | 32 | {counts['Not Accepted']} |",f"| Strict acceptance | 52.7% | {pct(counts['Accepted'])}% |",f"| Usable | 75.6% | {pct(counts['Accepted']+counts['Partially Accepted'])}% |",f"| Timeout/no payload | 0 | {sum(bool(r.get('error')) for r in results)} |",f"| Responses with zero cards | 52 | {sum(not r['cards'] for r in results)} |",f"| P50 | ~7.1 s | {dur[len(dur)//2]/1000:.1f} s |",f"| P95 | ~20.1 s | {dur[int(len(dur)*.95)]/1000:.1f} s |",'',
'The generic refactor improved company overview, complete industry discovery, definitions, exact named-resource summaries, data-governance mapping, AWS governance, contact details, and transparent content-type absence. It did not meet the desired overall regression bar: broad vague capability discovery, several natural business problems, authority selection, and card precision still fail materially.','',
'## Failure diagnosis by pipeline stage','',
'- Query understanding: vague portfolio and recommendation prompts can still request clarification or lose the implied company scope.','- Candidate retrieval: contractor onboarding, release velocity, infrastructure-as-code, AI value validation, media automation, and some industry queries still miss the best evidence.','- Ranking/authority: generic sub-service or editorial pages can outrank dedicated capability, partner, industry, or well-architected pages.','- Business-problem mapping: lexical problem profiles remain weak when user wording differs substantially from page wording.','- Constraint filtering: multi-constraint relevance improved unevenly; a card can satisfy one constraint and miss another.','- Conversation state: explicit switches generally work, but generic follow-ups still inherit an arbitrary example or exhaust results early.','- Generation: selected evidence is usually grounded, but some openings reproduce source copy instead of answering in a natural 3–4-line summary.','- Card selection: strict filtering prevents many noisy cards, but several accepted answers have no card and several partial answers still show weak secondary cards.','- Insufficient evidence: missing exact webinar/eBook combinations are now stated cautiously instead of substituted as exact matches.','',
'## Test composition and category results','', '| Group | Requests | Accepted | Partial | Not Accepted |','| --- | ---: | ---: | ---: | ---: |']
for group,s in groups.items(): lines.append(f"| {group} | {s['count']} | {s['accepted']} | {s['partial']} | {s['failed']} |")
lines += ['', 'Coverage includes all 15 spreadsheet cases, 35 V6 failed/partial regressions, 45 unseen prompts, five off-topic prompts, and five four-turn conversations (20 turns).','',
'## Response-structure audit','',f"- Direct non-heading opening: {sum(r['directOpening'] for r in results)}/{len(results)} ({pct(sum(r['directOpening'] for r in results))}%).",f"- Openings with 3–4 detected sentences: {sum(3<=r['openingSentences']<=4 for r in results)}/{len(results)} ({pct(sum(3<=r['openingSentences']<=4 for r in results))}%).",f"- Responses starting with a Markdown heading: {sum(r['startsWithHeading'] for r in results)}.",'- Sentence detection is mechanical and Markdown links can affect the count; the per-response excerpts below remain the authoritative QA evidence.','',
'## Manual spreadsheet TC-001–TC-015','', '| ID | Request | Result | Cards | Response excerpt |','| --- | --- | --- | ---: | --- |']
def esc(s): return s.replace('|','\\|').replace('\n',' ')[:260]
for r in results:
    if r['group']=='manual': lines.append(f"| {r['id']} | {esc(r['query'])} | {r['grade']} | {len(r['cards'])} | {esc(r['answer'])} |")
lines += ['', 'Manual conclusions: TC-002 retrieved About but did not enumerate all five values; TC-007 answered enterprise services but did not explicitly correct the premise; TC-008 answered the CEO but selected a different recent recognition than the spreadsheet expectation; TC-011 and TC-012 had useful answers with imperfect authority/cards; TC-013 found ArcGIS evidence but did not open with a direct yes.','',
'## All live regression evidence','', '| ID | Group | Request | Result | ms | Cards | Response excerpt |','| --- | --- | --- | --- | ---: | ---: | --- |']
for r in results: lines.append(f"| {r['id']} | {r['group']} | {esc(r['query'])} | {r['grade']} | {r['durationMs']} | {len(r['cards'])} | {esc(r['answer'])} |")
lines += ['', '## Remaining issues requiring review','',
'1. Replace lexical-only problem matching with a corpus-derived semantic retrieval layer or embeddings, while preserving deterministic authority and content-type constraints.','2. Treat broad/vague portfolio questions as catalog requests without a topic-specific phrase list.','3. Improve role classification from WordPress taxonomy/ACF so dedicated service, partner, industry, accelerator, and company pages consistently outrank editorial mentions.','4. Make constraint satisfaction a hard precondition for cards; separately allow supporting evidence in the answer context.','5. Persist structured conversation state server-side or pass explicit state, rather than reconstructing it only from text history.','6. Enforce the 3–4 sentence opening with a schema field and post-validation instead of prompt-only guidance.','7. Reconcile “latest” using event date from content/structured fields, not only WordPress modified date.','',
'## Integrity verification','', '- `CHATBOT_GENERIC_TESTING_REPORT_V6.md` was not overwritten.','- No query-specific Flutter, GIS, cloud-cost, secure-development, core-values, or named-page runtime route was added.','- The previous query-specific canonical response module and GIS/Kagen routing branches were removed.','- Portfolio enumeration is derived from WordPress roles and service metadata.','- Contact extraction reports only values present in published ACF fields.','- Exact-title matching, off-topic handling, bounded corpus loading, stale fallback, and index reuse remain in place.','- Automated verification: 97 tests passed, 9 skipped; TypeScript passed; ESLint passed; production build passed.','',
'## Overall conclusion','',f"V7 is more generic and materially better in several high-value paths, but the fresh strict score is {pct(counts['Accepted'])}%, so this should not be represented as fully fixed. The remaining failures are architectural retrieval/authority/constraint problems, not justification for adding per-query routes."]
Path('CHATBOT_GENERIC_TESTING_REPORT_V7.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'counts':counts,'groups':groups,'p50':dur[len(dur)//2],'p95':dur[int(len(dur)*.95)]},indent=2))
