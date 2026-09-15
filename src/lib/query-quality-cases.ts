/** Reusable behavioral evaluation cases. Assertions should target structure,
 * not today's WordPress IDs, because the published corpus changes over time. */
export interface QueryQualityCase {
  query: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  expectedIntent?: string;
  expectedTopic?: string;
  expectedContentType?: string;
  mustPrefer?: string;
  mustNotPrefer?: string;
  expectedBehavior: string;
}

export const QUERY_QUALITY_CASES: QueryQualityCase[] = [
  { query: "AI", expectedIntent: "explore", expectedTopic: "AI", mustPrefer: "documents identifying AI in titles/headings/metadata", mustNotPrefer: "documents with only an incidental AI body mention", expectedBehavior: "Explain the strongest website-supported AI capabilities." },
  { query: "cloud", expectedIntent: "explore", expectedTopic: "cloud", mustPrefer: "cloud-authoritative content", mustNotPrefer: "incidental cloud mentions", expectedBehavior: "Provide a grounded cloud overview or clarify genuine ambiguity." },
  { query: "What do you offer healthcare companies?", expectedIntent: "discovery", expectedTopic: "healthcare", expectedContentType: "service", expectedBehavior: "Connect healthcare needs to supported capabilities without inventing an offering." },
  { query: "My application is old and difficult to maintain.", expectedIntent: "solve_problem", expectedTopic: "application modernization", mustPrefer: "content whose identity/evidence supports the problem", expectedBehavior: "Address the business problem in plain language." },
  { query: "We manually process too many documents.", expectedIntent: "solve_problem", expectedTopic: "document automation", expectedBehavior: "Use semantic search hints, then validate them against website evidence." },
  { query: "Our ecommerce platform isn't scaling.", expectedIntent: "solve_problem", expectedTopic: "commerce scalability", expectedBehavior: "Prefer authoritative commerce/platform engineering evidence." },
  { query: "We cannot get useful insights from our data.", expectedIntent: "solve_problem", expectedTopic: "data analytics", expectedBehavior: "Recommend only website-supported approaches." },
  { query: "I don't know which service I need.", expectedIntent: "recommendation", expectedContentType: "service", expectedBehavior: "Ask one useful clarification when no business problem is known." },
  { query: "Have you done something similar before?", expectedIntent: "evidence", expectedContentType: "case-study", expectedBehavior: "Inherit the recent topic and prefer relevant case studies." },
  { query: "Any blog about it?", expectedIntent: "resource", expectedContentType: "blog", expectedBehavior: "Inherit the recent topic and constrain results to blogs." },
  { query: "What about healthcare?", expectedIntent: "follow_up", expectedTopic: "healthcare plus recent topic", expectedBehavior: "Combine a new constraint with the recent subject unless it is a clear switch." },
  { query: "Tell me more.", expectedIntent: "follow_up", expectedBehavior: "Resolve the latest supported subject or ask one clarification." },
  { query: "Who won yesterday's cricket match?", expectedIntent: "off_topic", expectedBehavior: "Keep the Successive scope and provide no fabricated answer or cards." },
  { query: "Write me a birthday poem.", expectedIntent: "off_topic", expectedBehavior: "Politely state the Successive-focused boundary." },
];

