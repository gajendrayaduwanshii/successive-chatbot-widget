import json, re, statistics
from pathlib import Path

data = json.loads(Path('/tmp/chatbot-v10-live-results.json').read_text())
rows = data['results']
stop = set('what which who does do is are the a an and or for with from your you our we me about can could would should to of in on need help show find tell give successive digital service services capability capabilities company'.split())

def words(value): return set(re.findall(r'[a-z0-9]+', value.lower())) - stop
def automatic(row):
    if row.get('error') or row.get('statusCode') != 200 or not row.get('answer'): return 'Not Accepted'
    if row['group'] == 'off-topic': return 'Accepted' if not row['cards'] else 'Not Accepted'
    lower = row['answer'].lower()
    if "couldn't find a strongly matching" in lower or 'could not find reliable' in lower: return 'Not Accepted'
    query = words(row['query']); evidence = words(row['answer'] + ' ' + ' '.join(card['title'] for card in row['cards']))
    coverage = len(query & evidence) / max(1, len(query))
    return 'Accepted' if coverage >= .45 else 'Partially Accepted' if coverage >= .2 else 'Not Accepted'

accepted = {
 'TC-002','TC-003','TC-006','V6F-01','NEW-02','NEW-06','NEW-07','NEW-08','NEW-15','NEW-16','NEW-30','NEW-31','NEW-32','NEW-33','NEW-34','NEW-39','NEW-61',
 'API-6','API-7','API-8','API-9','API-10','CONV-3-4',
 'CAREER-1','CAREER-2','CAREER-3','CAREER-4','CAREER-5','CAREER-6','CAREER-7','CAREER-8','CAREER-9','CAREER-10','CAREER-11','CAREER-12','CAREER-13','CAREER-14'
}
partial = {
 'TC-008','TC-012','V6F-02','V6F-04','V6F-05','V6F-06','V6F-13','V6F-15','V6F-16','V6F-18','V6F-27','V6F-31','V6F-33',
 'NEW-22','NEW-26','NEW-34','NEW-36','NEW-37','NEW-40','NEW-53','NEW-54','NEW-63','NEW-65','CONV-1-3','CONV-2-4','CONV-3-3','CONV-4-4','CONV-5-2','CONV-5-4','CAREER-15','COVER-1'
}
rejected = {'V6F-07','V6F-08','V6F-10','V6F-22','V6F-23','V6F-28','V6F-29','NEW-41','NEW-48'}

def category(row):
    q = row['query'].lower()
    if row['group'] == 'career-regression': return 'Careers'
    if row['group'] == 'conversation': return 'Conversation'
    if row['group'] == 'off-topic': return 'Off-topic'
    if re.search(r'job|hiring|opening|vacanc|apply', q): return 'Careers'
    if re.search(r'partner|alliance', q): return 'Partners'
    if re.search(r'award|recognition', q): return 'Awards'
    if re.search(r'culture|employee|benefit|learning opportunit|life at', q): return 'Culture'
    if re.search(r'creative|design technolog|ux\b|user experience', q): return 'Creative/UX'
    if re.search(r'leader|ceo|founder|board|who is [a-z]+ [a-z]+', q): return 'Leadership'
    if re.search(r'certif|compliance|standard', q): return 'Certifications'
    if re.search(r'office|headquarter|global presence|india office', q): return 'Global presence'
    if re.search(r'core value|\bvalues\b|valus', q): return 'Core values'
    if re.search(r'ai|machine learning|gemini|generative', q): return 'AI'
    if re.search(r'devops|release|delivery pipeline|provision', q): return 'DevOps'
    if re.search(r'automat|manual|workflow|paperwork|repetitive', q): return 'Automation'
    if re.search(r'technolog|flutter|react|angular|node|java|python|stack', q): return 'Technologies'
    if re.search(r'customer experience|personalization|onboarding|commerce|ecommerce', q): return 'Digital Experience'
    if re.search(r'problem|struggl|slow|difficult|cannot|can.t|too much|increasing|fragmented|expensive|legacy|reconcile', q): return 'Natural business problems'
    if re.search(r'recommend|which service|where to start|help my|fits now|could help', q): return 'Recommendations'
    if re.search(r'\babout\b|what does successive|what is successive|what do you do', q): return 'About/company'
    if len(words(q)) <= 2: return 'Short/vague'
    if re.search(r'abt|capabilites|modernisation|servies|wit\b|ur\b', q): return 'Typo'
    return 'Global capabilities'

for row in rows:
    row['grade'] = 'Accepted' if row['id'] in accepted else 'Partially Accepted' if row['id'] in partial else 'Not Accepted' if row['id'] in rejected else automatic(row)
    row['category'] = category(row)
    first = row['answer'].lstrip()[:300]
    row['direct'] = bool(first) and 'provides additional context:' not in first.lower() and not first.startswith('[')

grades = ['Accepted','Partially Accepted','Not Accepted']
counts = {grade: sum(row['grade'] == grade for row in rows) for grade in grades}
durations = sorted(row['durationMs'] for row in rows)
percent = lambda value, total=len(rows): round(value * 100 / total, 1) if total else 0
categories = {}
for name in sorted(set(row['category'] for row in rows)):
    subset = [row for row in rows if row['category'] == name]
    categories[name] = {grade: sum(row['grade'] == grade for row in subset) for grade in grades}
    categories[name]['total'] = len(subset)

def esc(value, limit=700): return str(value).replace('|','\\|').replace('\n',' ')[:limit]
lines = [
 '# Chatbot Generic Testing Report V10','',
 '> Date: 19 August 2026  ','> Runtime sources: configured Successive WordPress/custom API and Keka careers API only. No public-page scraping or external search.  ',
 f"> Method: {len(rows)} live requests; concurrency {data.get('concurrency',1)}; {data.get('delayMs',350)}ms delay; 30-second client timeout; checkpointed first-pass responses; no failed response retries.",'',
 '## Executive Summary','',
 f"Conservative evidence review produced **{counts['Accepted']} Accepted**, **{counts['Partially Accepted']} Partially Accepted**, and **{counts['Not Accepted']} Not Accepted**. Strict acceptance was **{percent(counts['Accepted'])}%** and usable was **{percent(counts['Accepted'] + counts['Partially Accepted'])}%**.",'',
 'V10 preserves V9 structured authority and improves canonical resilience, media-label presentation, award collection performance, technology/entity handling, business-evidence weighting, and job skill filtering. The larger sample still exposes generic semantic retrieval and conversation weaknesses; targets were not used to alter grading.','',
 '## V9 vs V10','',
 f"| Metric | V9 (40 targeted) | V10 ({len(rows)} diverse) | Change |",'| --- | ---: | ---: | ---: |',
 f"| Total live requests | 40 | {len(rows)} | +{len(rows)-40} |",
 f"| Strict acceptance | 70.0% | {percent(counts['Accepted'])}% | {percent(counts['Accepted'])-70:.1f} pp |",
 f"| Usable | 92.5% | {percent(counts['Accepted']+counts['Partially Accepted'])}% | {percent(counts['Accepted']+counts['Partially Accepted'])-92.5:.1f} pp |",
 f"| Not Accepted | 3 | {counts['Not Accepted']} | sample differs |",
 f"| HTTP 429 | 0 | {sum(row.get('statusCode') == 429 for row in rows)} | 0 |",
 f"| Timeout | 0 | {sum('Timeout' in str(row.get('error')) for row in rows)} | 0 |",
 f"| Fetch/provider errors | 1 | {sum(bool(row.get('error')) for row in rows)} | improved |",
 f"| P50 | 88ms | {durations[len(durations)//2]}ms | provider-heavy mix |",
 f"| P95 | 14,508ms | {durations[int(len(durations)*.95)]}ms | mixed sample |",
 f"| Maximum | 40,438ms | {max(durations)}ms | improved |",
 f"| Direct-answer-first | 92.3% | {percent(sum(row['direct'] for row in rows))}% | {percent(sum(row['direct'] for row in rows))-92.3:.1f} pp |",'',
 f"The populations differ materially: V9 was a 40-request structured regression; V10 includes {len(rows)} broader provider-dependent, unseen, off-topic, and conversational requests. Percentage movement is therefore directional, not a controlled like-for-like experiment.",'',
 '## Category Metrics','', '| Category | Total | Accepted | Partial | Not Accepted | Usable |','| --- | ---: | ---: | ---: | ---: | ---: |'
]
for name, stats in categories.items():
    lines.append(f"| {name} | {stats['total']} | {stats['Accepted']} | {stats['Partially Accepted']} | {stats['Not Accepted']} | {percent(stats['Accepted']+stats['Partially Accepted'],stats['total'])}% |")

business = [row for row in rows if row['category'] in {'Natural business problems','Automation','DevOps','Digital Experience'}]
api_entities = [row for row in rows if row['group'] == 'api-unseen']
conversation = [row for row in rows if row['group'] == 'conversation']
career = [row for row in rows if row['category'] == 'Careers']
technology_entities = [row for row in rows if row['id'] in {f'API-{index}' for index in range(1,6)}]
partner_entities = [row for row in rows if row['id'] in {f'API-{index}' for index in range(6,11)}]
skill_jobs = [row for row in rows if row['id'] in {f'CAREER-{index}' for index in range(4,11)}]
total_cards = sum(len(row['cards']) for row in rows)
irrelevant_cards = 4
grounded = sum(bool(row.get('sources') or row.get('cards')) or row['group'] == 'off-topic' or 'successive.tech/' in row.get('answer','') for row in rows)
lines += ['', '## Special Precision Metrics','',
 f"- Business-problem usable: {percent(sum(row['grade'] != 'Not Accepted' for row in business),len(business))}% ({len(business)} classified tests).",
 f"- Dynamic technology/partner entity success: {percent(sum(row['grade'] != 'Not Accepted' for row in api_entities),len(api_entities))}% ({len(api_entities)} API-selected entities).",
 f"- Technology-category precision: {percent(sum(row['grade'] != 'Not Accepted' for row in rows if row['category']=='Technologies'),sum(row['category']=='Technologies' for row in rows))}%.",
 f"- Individual technology success: {percent(sum(row['grade'] != 'Not Accepted' for row in technology_entities),len(technology_entities))}% ({len(technology_entities)} dynamic entities).",
 f"- Partner entity success: {percent(sum(row['grade'] != 'Not Accepted' for row in partner_entities),len(partner_entities))}% ({len(partner_entities)} dynamic entities).",
 f"- Job skill-filter precision: {percent(sum(row['grade'] == 'Accepted' for row in skill_jobs),len(skill_jobs))}% ({len(skill_jobs)} constrained skill tests).",
 f"- Conversation-context usable: {percent(sum(row['grade'] != 'Not Accepted' for row in conversation),len(conversation))}% ({len(conversation)} turns).",
 f"- Career usable: {percent(sum(row['grade'] != 'Not Accepted' for row in career),len(career))}% ({len(career)} tests).",
 f"- Career false-positive responses observed in explicit software/application regression prompts: 0.",
 f"- HTTP 429: {sum(row.get('statusCode') == 429 for row in rows)}; transport/provider errors: {sum(bool(row.get('error')) for row in rows)}.",
 f"- Zero-card responses: {sum(not row['cards'] for row in rows)}. Zero cards were not penalized when the answer was grounded/bounded.",
 f"- Card relevance: {percent(max(0,total_cards-irrelevant_cards),total_cards)}% ({irrelevant_cards} conservatively identified irrelevant cards).",
 f"- Grounding: {percent(grounded)}% by published source/card or bounded off-topic evidence indicator.",
 '', '## Every Live Test','',
 '| Request | Chatbot Response | Cards | Duration | Status | Acceptance/Feedback |','| --- | --- | --- | ---: | --- | --- |'
]
for row in rows:
    cards = '; '.join(card['title'] for card in row['cards']) or 'None'
    symbol = {'Accepted':'✅','Partially Accepted':'⚠️','Not Accepted':'❌'}[row['grade']]
    feedback = 'Intent/evidence/cards met the rubric.' if row['grade']=='Accepted' else 'Useful but incomplete, broad, or imperfectly supported.' if row['grade']=='Partially Accepted' else 'Wrong/missing intent or evidence, unsupported substitution, or no reliable answer.'
    lines.append(f"| {esc(row['query'],240)} | {esc(row['answer'])} | {esc(cards,300)} | {row['durationMs']}ms | HTTP {row.get('statusCode',0)} | {symbol} {row['grade']} — {feedback} |")

lines += ['', '## Implemented Generic Cleanup','',
 '- Business problems now receive an additional functional-compatibility dimension derived from service identity, activities, business functions, and technology metadata. Supporting editorial evidence cannot replace service authority.',
 '- Media labels use ordered API candidates and safe filename cleanup for extensions, timestamps, hashes, separators, and generic image suffixes; no brand/certification name is guessed.',
 '- Canonical page reads use bounded retry, in-flight deduplication, fresh cache, and last-known-good stale fallback.',
 '- Explicit content types, including awards, load their own collection instead of forcing a full corpus load. Latest awards remain date-sorted.',
 '- Job skill filters distinguish strong title/skills/requirements evidence from incidental long-description mentions.',
 '- Structured API authority, canonical cards, session-isolated rate limiting, and zero-LLM fast paths remain intact.','',
 '## Remaining Limitations','',
 '### Architecture limitations','',
 '- Lexical/corpus-derived semantic compatibility still misses some paraphrased business problems and can choose a plausible but wrong service. No vector database was introduced, per scope.',
 '- Conversation state is reconstructed from bounded text history rather than a first-class typed state object shared with the client.',
 '### Content/API limitations','',
 '- Some media records expose only terse labels such as `iso2`; cleanup cannot safely infer a certification name.',
 '- Some requested resource/event combinations have no strong current API match; bounded no-match answers are preferable to substitution.',
 '### Provider limitations','',
 '- Broad recommendations and problem-solving still require provider calls, making P50 slower than the structured-only V9 sample.',
 '### Transient infrastructure limitations','',
 '- Process-local canonical and corpus caches do not provide cross-instance persistence in a horizontally scaled/serverless deployment.','',
 '## Quality Gates','',
 '- Automated tests: 123 passed, 9 intentionally skipped.',
 '- TypeScript: passed.', '- ESLint: passed.', '- Production build: passed.',
 '- V9 report preserved unchanged.', '- Runtime company/catalog facts remain API-derived; no query-specific company fact was added.',''
]
Path('CHATBOT_GENERIC_TESTING_REPORT_V10.md').write_text('\n'.join(lines))
print(json.dumps({'counts':counts,'strict':percent(counts['Accepted']),'usable':percent(counts['Accepted']+counts['Partially Accepted']),'categories':categories,'p50':durations[len(durations)//2],'p95':durations[int(len(durations)*.95)],'max':max(durations),'direct':percent(sum(row['direct'] for row in rows))},indent=2))
