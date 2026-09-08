import { normalizeSearchText } from "./search-index";

/** Canonical person-role concepts. Aliases are data, not answer rules. */
export type PersonRoleConcept =
  | "ceo" | "founder" | "co_founder" | "owner" | "chair" | "president"
  | "vice_president" | "managing_director" | "director" | "board_member"
  | "executive" | "cto" | "cfo" | "coo" | "cmo" | "cio" | "chro" | "cro"
  | "head_engineering" | "head_technology" | "head_sales" | "head_marketing"
  | "head_hr" | "partner" | "managing_partner" | "principal" | "general_manager";

type RoleDefinition = {
  concept: PersonRoleConcept;
  query: RegExp;
  designation: RegExp;
};

// Specific roles precede broader roles (for example, Managing Partner before
// Partner and Vice President before President). This preserves distinctions.
const ROLE_DEFINITIONS: RoleDefinition[] = [
  { concept: "ceo", query: /\b(?:ceo|chief executive(?: officer)?|who runs(?: the company| successive(?: digital)?)?|company ceo|company head|head of (?:successive|the company))\b/i, designation: /\b(?:ceo|chief executive(?: officer)?)\b/i },
  { concept: "co_founder", query: /\bco[ -]?founder\b/i, designation: /\bco[ -]?founder\b/i },
  { concept: "founder", query: /\b(?:founder|who founded|founded by)\b/i, designation: /\bfounder\b/i },
  { concept: "owner", query: /\b(?:business owner|company owner|owner|ownership|who owns(?: the company| successive(?: digital)?)?)\b/i, designation: /\b(?:business )?owner\b/i },
  { concept: "chair", query: /\b(?:chairman|chairperson|chairwoman|board chair)\b/i, designation: /\b(?:chairman|chairperson|chairwoman|board chair)\b/i },
  { concept: "vice_president", query: /\b(?:vice president|vp)\b/i, designation: /\b(?:vice president|vp)\b/i },
  { concept: "president", query: /\bpresident\b/i, designation: /\bpresident\b/i },
  { concept: "managing_director", query: /\b(?:managing director|md)\b/i, designation: /\b(?:managing director|md)\b/i },
  { concept: "board_member", query: /\b(?:board member|member of the board)\b/i, designation: /\b(?:board member|member of the board)\b/i },
  { concept: "managing_partner", query: /\bmanaging partner\b/i, designation: /\bmanaging partner\b/i },
  { concept: "partner", query: /\bpartner\b/i, designation: /\bpartner\b/i },
  { concept: "cto", query: /\b(?:cto|chief technology officer|technology head|head of technology)\b/i, designation: /\b(?:cto|chief technology officer|technology head|head of technology)\b/i },
  { concept: "cfo", query: /\b(?:cfo|chief financial officer)\b/i, designation: /\b(?:cfo|chief financial officer)\b/i },
  { concept: "coo", query: /\b(?:coo|chief operating officer)\b/i, designation: /\b(?:coo|chief operating officer)\b/i },
  { concept: "cmo", query: /\b(?:cmo|chief marketing officer)\b/i, designation: /\b(?:cmo|chief marketing officer)\b/i },
  { concept: "cio", query: /\b(?:cio|chief information officer)\b/i, designation: /\b(?:cio|chief information officer)\b/i },
  { concept: "chro", query: /\b(?:chro|chief human resources officer|chief human resource officer)\b/i, designation: /\b(?:chro|chief human resources officer|chief human resource officer)\b/i },
  { concept: "cro", query: /\b(?:cro|chief revenue officer)\b/i, designation: /\b(?:cro|chief revenue officer)\b/i },
  { concept: "head_engineering", query: /\bhead of engineering\b/i, designation: /\bhead of engineering\b/i },
  { concept: "head_technology", query: /\bhead of technology\b/i, designation: /\bhead of technology\b/i },
  { concept: "head_sales", query: /\bhead of sales\b/i, designation: /\bhead of sales\b/i },
  { concept: "head_marketing", query: /\bhead of marketing\b/i, designation: /\bhead of marketing\b/i },
  { concept: "head_hr", query: /\b(?:head of hr|head of human resources?)\b/i, designation: /\b(?:head of hr|head of human resources?)\b/i },
  { concept: "general_manager", query: /\bgeneral manager\b/i, designation: /\bgeneral manager\b/i },
  { concept: "principal", query: /\bprincipal\b/i, designation: /\bprincipal\b/i },
  { concept: "director", query: /\bdirector\b/i, designation: /\bdirector\b/i },
  { concept: "executive", query: /\bexecutive\b/i, designation: /\bexecutive\b/i },
];

export function requestedPersonRole(query: string): PersonRoleConcept | null {
  const normalized = normalizeSearchText(query);
  if (/\b(?:executive management|management team|leadership team|board of directors)\b/.test(normalized)) return null;
  return ROLE_DEFINITIONS.find(({ query: pattern }) => pattern.test(normalized))?.concept ?? null;
}

export function designationHasRole(designation: string, concept: PersonRoleConcept): boolean {
  const normalized = normalizeSearchText(designation);
  const definition = ROLE_DEFINITIONS.find((item) => item.concept === concept);
  if (!definition?.designation.test(normalized)) return false;
  // Broad substrings must not collapse explicitly distinct roles.
  if (concept === "founder" && /\bco[ -]?founder\b/i.test(normalized) && !/(?:^|[&,/]|\band\b)\s*founder\b/i.test(normalized)) return false;
  if (concept === "president" && /\bvice president\b/i.test(normalized)) return false;
  if (concept === "partner" && /\bmanaging partner\b/i.test(normalized)) return false;
  if (concept === "director" && /\bmanaging director\b/i.test(normalized)) return false;
  return true;
}

export function isPersonRoleQuery(query: string): boolean {
  return requestedPersonRole(query) !== null;
}
