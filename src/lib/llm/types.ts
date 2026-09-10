import type { HistoryMessage } from "@/types/chat";
import type { NormalizedContent } from "@/types/wordpress";
import type { AssistantResponse } from "./schemas";
import type { QueryUnderstanding } from "../query-understanding";
import type { CommercialIntent } from "../commercial-intent";
import type { GroundedEvidencePackage } from "../grounded-evidence-package";
export interface LLMInput {
  message: string;
  responseLanguage: string;
  fallbackAnswer: string;
  history: HistoryMessage[];
  context: NormalizedContent[];
  understanding?: QueryUnderstanding;
  evidencePackage?: GroundedEvidencePackage;
  elaboration?: {
    subject: string;
    primaryEvidence: string[];
    additionalEvidence: string[];
  };
}
export interface PreparedQuery {
  englishQuery: string;
  responseLanguage: string;
  contactAnswer: string;
  blogsAnswer: string;
  fallbackAnswer: string;
}
export interface LLMProvider {
  prepareMultilingualQuery(message: string): Promise<PreparedQuery>;
  understandQuery(
    message: string,
    history: HistoryMessage[],
  ): Promise<QueryUnderstanding>;
  generateStructuredResponse(input: LLMInput): Promise<AssistantResponse>;
  generateCommercialResponse(input: {
    message: string;
    subject: string | null;
    intents: CommercialIntent[];
    history: HistoryMessage[];
    evidence: NormalizedContent[];
  }): Promise<string>;
}
