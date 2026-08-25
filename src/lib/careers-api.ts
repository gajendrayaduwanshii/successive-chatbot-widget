import { decodeEntities, htmlToText } from "./html-utils";
import { normalizeSearchText } from "./search-index";

const CAREERS_PAGE_URL = "https://successive.tech/careers/jobsearch/";
const KEKA_CAREERS_BASE_URL = "https://successivesoftware.keka.com/careers";
const KEKA_EMBED_IDENTIFIER = "a0dbae8a-c880-42dd-8947-466574e4de7d";
const JOBS_TTL_MS = 5 * 60 * 1000;

export interface CareerJob {
  id: number;
  title: string;
  description?: string;
  excerpt?: string;
  departmentName?: string;
  jobLocations?: Array<{
    name?: string;
    city?: string;
    state?: string;
    countryName?: string;
  }>;
  jobType?: number;
  experience?: string;
  publishedOn?: string;
  skillNames?: string[];
}

let jobsCache: { jobs: CareerJob[]; expiresAt: number } | undefined;

export function isCareerOpeningQuery(message: string): boolean {
  const employment = /\b(?:job|jobs|opening|openings|open role|open roles|vacanc(?:y|ies)|hiring|career opportunit(?:y|ies))\b/i;
  const employmentPosition = /\b(?:position|positions|role|roles)\b/i;
  const application = /\b(?:apply|application)\b/i;
  const softwareContext = /\b(?:ai|artificial intelligence|software|web|mobile|cloud|enterprise|moderniz|development|architecture|system|platform|solution)\b/i;
  if (/\b(?:what|which)\s+role\s+(?:does|do|can)\b/i.test(message)) return false;
  return employment.test(message) ||
    (employmentPosition.test(message) && !softwareContext.test(message)) ||
    (application.test(message) && (
      employment.test(message) ||
      /\b(?:how|where)\s+(?:can|do|should)\s+i\s+apply\s+for\b/i.test(message)
    ));
}

export function shouldUseCareerOpeningRoute(
  message: string,
  requestedContentType: string | null,
  followUpScope: string,
): boolean {
  return isCareerOpeningQuery(message) ||
    (requestedContentType === "career" &&
      ["CONTINUE_SAME_SCOPE", "REFINE_SCOPE", "AMBIGUOUS_FOLLOW_UP"].includes(followUpScope));
}

export async function fetchActiveCareerJobs(): Promise<CareerJob[]> {
  if (jobsCache && jobsCache.expiresAt > Date.now()) return jobsCache.jobs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      `${KEKA_CAREERS_BASE_URL}/api/embedjobs/default/active/${KEKA_EMBED_IDENTIFIER}`,
      {
        signal: controller.signal,
        next: { revalidate: 300 },
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error(`Keka jobs endpoint returned ${response.status}`);
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new Error("Keka jobs endpoint returned invalid data");
    const jobs = value.filter(
      (item): item is CareerJob =>
        !!item &&
        typeof item === "object" &&
        typeof (item as CareerJob).id === "number" &&
        typeof (item as CareerJob).title === "string",
    );
    jobsCache = { jobs, expiresAt: Date.now() + JOBS_TTL_MS };
    return jobs;
  } finally {
    clearTimeout(timeout);
  }
}

const QUERY_NOISE = new Set([
  "a", "all", "an", "and", "any", "apply", "are", "at", "available",
  "career", "careers", "current", "currently", "do", "does", "for", "have",
  "hiring", "how", "i", "in", "is", "job", "jobs", "many", "me", "of",
  "open", "opening", "openings", "position", "positions", "role", "roles",
  "show", "successive", "the", "there", "to", "vacancies", "vacancy", "what",
  "which", "with", "you", "your", "could", "can", "please", "plz",
  "find", "give", "get", "provide", "tell", "looking", "lookin", "only",
  "hey", "hirings", "details", "information",
]);

function strongJobSkillText(job: CareerJob): string {
  const description = htmlToText(job.description ?? job.excerpt ?? "");
  const explicitSections = description
    .split(/(?:requirements?|skills?|technologies|tech stack|qualification)s?\s*:/i)
    .slice(1)
    .join(" ");
  return normalizeSearchText([
    job.title,
    job.departmentName,
    ...(job.skillNames ?? []),
    explicitSections || (description.length <= 600 ? description : ""),
  ].filter(Boolean).join(" "));
}

function searchableJobText(job: CareerJob): string {
  return normalizeSearchText([strongJobSkillText(job), htmlToText(job.description ?? job.excerpt ?? "")].join(" "));
}

export function filterCareerJobs(jobs: CareerJob[], message: string): CareerJob[] {
  const normalized = normalizeSearchText(message);
  const genericItJob = /\bit jobs?\b/.test(normalized);
  const requestsHiringInformation =
    /\b(?:give|provide)\b.*\b(?:data|details|information)\b.*\b(?:hiring|hirings|jobs?|openings?)\b/.test(normalized);
  const requestedYears = Number(
    normalized.match(/\b(\d{1,2})\s*(?:plus\s*)?(?:years?|yrs?)\b/)?.[1],
  );
  const requestedLocations = [...new Set(jobs.flatMap((job) =>
    (job.jobLocations ?? []).flatMap((location) => [location.name, location.city])
      .filter((value): value is string => !!value)
      .map(normalizeSearchText),
  ))].filter((location) => ` ${normalized} `.includes(` ${location} `));
  const locationFiltered = requestedLocations.length
    ? jobs.filter((job) => {
        const locations = (job.jobLocations ?? []).flatMap((location) =>
          [location.name, location.city].filter((value): value is string => !!value),
        ).map(normalizeSearchText);
        return requestedLocations.some((requested) => locations.includes(requested));
      })
    : jobs;
  const experienceFiltered = Number.isFinite(requestedYears)
    ? locationFiltered.filter((job) => {
        const statedExperience = job.experience ||
          htmlToText(job.description ?? job.excerpt ?? "")
            .match(/\bexperience\s*:\s*([^\n.]{1,30})/i)?.[1] || "";
        const values = [...statedExperience.matchAll(/\d{1,2}/g)].map((match) =>
          Number(match[0]),
        );
        if (!values.length) return false;
        const minimum = values[0]!;
        const maximum = /[-–]/.test(statedExperience)
          ? (values[1] ?? minimum)
          : Number.POSITIVE_INFINITY;
        return requestedYears >= minimum && requestedYears <= maximum;
      })
    : locationFiltered;

  const terms = normalized.split(" ").filter(
    (term) => term.length > 1 && !QUERY_NOISE.has(term) &&
      !(term === "it" && genericItJob) &&
      !(term === "data" && requestsHiringInformation) &&
      !requestedLocations.includes(term) && !/^\d+$/.test(term) &&
      !["year", "years", "yr", "yrs", "experience"].includes(term),
  );
  if (!terms.length) return experienceFiltered;
  return experienceFiltered.filter((job) => {
    const generalText = searchableJobText(job);
    const strongText = strongJobSkillText(job);
    return terms.every((term) => {
      const requestedAsSkill = /^(?:react|angular|vue|node|nodejs|python|java|golang|dotnet|net|php|flutter|qa|devops|aws|azure|gis)$/.test(term);
      const evidence = requestedAsSkill ? strongText : generalText;
      return ` ${evidence} `.includes(` ${term} `);
    });
  });
}

export function careerJobUrl(job: CareerJob): string {
  return `${KEKA_CAREERS_BASE_URL}/jobdetails/${job.id}`;
}

export function careerJobSummary(job: CareerJob): string {
  const locations = [...new Set((job.jobLocations ?? [])
    .map((location) => location.name ?? location.city)
    .filter(Boolean))].join(", ");
  const details = [
    job.departmentName,
    locations,
    job.experience ? `${decodeEntities(job.experience)} experience` : undefined,
    job.jobType === 2 ? "Full Time" : undefined,
  ].filter(Boolean);
  return details.join(" · ") || "View the live opening for current details.";
}

export function careersPageUrl(): string {
  return CAREERS_PAGE_URL;
}
