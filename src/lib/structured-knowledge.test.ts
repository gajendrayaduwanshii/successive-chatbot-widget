import { describe, expect, it } from "vitest";
import type { WordPressItem } from "@/types/wordpress";
import { answerStructuredRequest, availableClientSuggestionActions, classifyClientIntent, clientOverviewFallback, cleanMediaLabel, extractTrustedOrganizations, understandContextualStructuredRequest, understandStructuredRequest } from "./structured-knowledge";
import { buildSearchDocument } from "./search-index";

const page = (id: number, slug: string, title: string, acf: Record<string, unknown>): WordPressItem => ({
  id, type: "page", slug, link: `https://example.test/${slug}/`,
  title: { rendered: title }, acf: acf as WordPressItem["acf"],
});

const corpus: WordPressItem[] = [
  page(99, "how-we-work", "How We Work", {
    core_values: [{ heading: "Delivery", description: "A delivery principle." }],
  }),
  page(1, "about-us", "About Us", {
    core_values: [{ heading: "Curiosity", description: "We keep learning." }],
    executive_management: [{ name: "Aarav Malhotra", desgnation: "Director of Engineering" }],
    certifications: [{ image: { url: "https://example.test/cert.png", alt: "Example Quality Standard" } }],
  }),
  page(2, "global-capabilities", "Global Capabilities", {
    capabilities_categories: [{ inner_title: "Application Engineering", short_description: "Build resilient digital products.", logo_repeater: [{ logo: { url: "https://example.test/runtime.svg", alt: "Example Runtime" } }] }],
  }),
  page(3, "partners", "Partners & Alliances", {
    partnerships_repeater: [{ acf_repeater: "Cloud Alliances", partnerships_logos: [{ logo: { url: "https://example.test/partner.svg", alt: "Example Cloud" } }] }],
  }),
  page(4, "our-culture", "Our Culture", {
    culture_content: "We support employee learning and workplace inclusion.",
  }),
];

const trustedLabel = (suffix: string) => `Fixture Organization ${suffix}`;
const trustedHomepage = (names: string[], heading = "Completely revised marketing copy"): WordPressItem => ({
  id: 901, type: "page", slug: "cms-internal-home-record", link: "https://successive.tech/",
  title: { rendered: "Home" }, content: { rendered: "" }, acf: {
    trusted_heading: heading,
    trusted_logos: names.map((name) => ({ logo: { alt: name, url: `https://cdn.test/${name.length}.svg` } })),
    partner_logos: [{ logo: { alt: trustedLabel("Partner"), url: "https://cdn.test/partner.svg" } }],
    certification_logos: [{ logo: { alt: trustedLabel("Certification"), url: "https://cdn.test/cert.svg" } }],
    technology_logos: [{ logo: { alt: trustedLabel("Technology"), url: "https://cdn.test/tech.svg" } }],
  } as WordPressItem["acf"],
});

describe("dynamic homepage trusted organizations", () => {
  it("uses the root homepage structured repeater without depending on heading text", () => {
    const names = [trustedLabel("Alpha"), trustedLabel("Beta"), trustedLabel("Gamma")];
    const result = extractTrustedOrganizations([trustedHomepage(names, "A heading with no trust words")]);
    expect(result?.organizations).toEqual(names);
    expect(result?.sourcePath).toContain("trusted_logos");
  });
  it("reflects content changes and excludes false logo collections", () => {
    const initial = [trustedLabel("Alpha"), trustedLabel("Beta"), trustedLabel("Gamma")];
    const updated = [initial[0]!, initial[2]!, trustedLabel("Delta")];
    expect(extractTrustedOrganizations([trustedHomepage(initial)])?.organizations).toEqual(initial);
    const result = extractTrustedOrganizations([trustedHomepage(updated)])?.organizations ?? [];
    expect(result).toEqual(updated);
    expect(result.join(" ")).not.toMatch(/Partner|Certification|Technology/);
  });
  it("deduplicates and rejects noisy labels and non-root pages", () => {
    const valid = trustedLabel("Alpha");
    expect(extractTrustedOrganizations([trustedHomepage([valid, valid, "logo", "asset 123", "client-logo.svg", ""])])?.organizations).toEqual([valid]);
    const nonRoot = trustedHomepage([valid]); nonRoot.link = "https://successive.tech/other/";
    expect(extractTrustedOrganizations([nonRoot])).toBeNull();
  });
  it.each(["client", "clients", "our clients", "your clients", "customer", "customers", "Who are your clients?", "Show your clients", "show me your customers", "companies you work with", "Which companies work with you?", "Tell me about your customers"])(
    "recognizes client overview grammar: %s", (query) => expect(classifyClientIntent(query)).toBe("overview"),
  );
  it.each(["current clients", "active clients", "who are your clients right now?", "which of these are current?"])(
    "applies current-status intent only when explicitly requested: %s",
    (query) => expect(classifyClientIntent(query)).toBe("current"),
  );
  it.each(["customer experience services", "customer support automation", "multi-client Strapi", "client-side development", "customer data platform", "customer journey personalization", "client-server architecture"])(
    "rejects client-list terminology collisions: %s", (query) => expect(classifyClientIntent(query)).toBeNull(),
  );
  it("keeps safe generation fallbacks query-sensitive", () => {
    const answers = ["client", "clients", "who are your clients?", "which companies work with you?", "tell me about your customers"].map(clientOverviewFallback);
    expect(new Set(answers).size).toBe(5);
  });
  it.each(["client", "clients", "our clients", "your clients", "who are your clients?", "show me your customers", "companies you work with"])(
    "keeps generic client wording positive without an unsolicited current-status disclaimer: %s",
    (query) => {
      const answer = clientOverviewFallback(query);
      expect(answer).toMatch(/^## /);
      expect(answer).not.toMatch(/does not|cannot confirm|current active|not every/i);
      expect(answer).not.toMatch(/home ?page|website/i);
    },
  );
  it("emits only collection-backed client suggestion actions", () => {
    expect(availableClientSuggestionActions([])).toEqual([]);
    const item: WordPressItem = { id: 902, type: "case_study", slug: "published-story", link: "https://example.test/case-studies/published-story/",
      title: { rendered: "Published Customer Story" }, content: { rendered: "A published customer outcome." } };
    const actions = availableClientSuggestionActions([item]);
    expect(actions.map((action) => action.intent)).toEqual(["CUSTOMER_WORK_DISCOVERY"]);
    expect(actions[0]?.contentType).toBe("case-study");
    expect(actions.every((action) => action.sourceContext === "CLIENT_OVERVIEW")).toBe(true);
  });
});

describe("structured API knowledge", () => {
  it("routes a terse location refinement only from active location context", () => {
    expect(understandContextualStructuredRequest("Pune only", [
      { role: "user", content: "Where are your offices?" },
    ])).toMatchObject({ attribute: "company_location", subject: "pune office" });
    expect(understandContextualStructuredRequest("Pune only", [
      { role: "user", content: "Show current openings" },
    ])).toBeNull();
    expect(understandContextualStructuredRequest("Where are your offices?", [
      { role: "user", content: "Pune office" },
    ])).toMatchObject({ attribute: "company_location" });
  });
  it("does not mistake a short office-location phrase for a person name", () => {
    expect(understandStructuredRequest("Office locations")).toMatchObject({
      attribute: "company_location",
    });
  });

  it.each([
    "office location",
    "office locations",
    "India location",
    "India office",
    "Where are your offices?",
    "Where is your India office?",
    "Where is Successive located?",
    "Where is Successive?",
    "Where are you based?",
    "Successive locations",
    "company address",
    "head office",
    "corporate office",
    "headquarters",
    "HQ",
    "branches",
    "Do you have an office in India?",
    "Do you operate in India?",
    "US office",
    "What is your presence outside the US?",
    "Global presence",
    "Which countries do you operate in?",
    "Which country?",
    "offcie loaction",
  ])("recognizes company-location phrasing: %s", (query) => {
    expect(understandStructuredRequest(query)).toMatchObject({ attribute: "company_location" });
  });

  it.each([
    "location intelligence services",
    "Location Intelligence",
    "Location Intelligence services",
    "Location analytics",
    "market location strategy",
    "GIS site selection",
    "GIS solutions",
    "Geospatial services",
    "geospatial capabilities",
  ])("leaves location-related capability phrasing to service retrieval: %s", (query) => {
    expect(understandStructuredRequest(query)).toBeNull();
  });

  it.each([
    "jobs by location",
    "office jobs in Noida",
  ])("does not route job-location phrasing as company presence: %s", (query) => {
    expect(understandStructuredRequest(query)?.attribute).not.toBe("company_location");
  });

  it("separates company certifications from continuous-compliance services", () => {
    expect(understandStructuredRequest("What certifications do you have?")).toMatchObject({
      attribute: "certifications",
    });
    expect(understandStructuredRequest("What continuous cloud compliance services do you provide?"))
      .toBeNull();
    expect(understandStructuredRequest("Security compliance automation"))
      .toBeNull();
  });
  it.each([
    ["What are your core values?", "values"],
    ["What is Global Capabilities?", "capabilities"],
    ["Any partnership?", "partners"],
    ["Who is Aarav Malhotraa in Successive?", "person"],
    ["Who is Aarav Malhotraa?", "person"],
    ["Aarav Malhotra", "person"],
    ["When is appraisal?", "employee_policy"],
    ["Do you work with Example Runtime?", "technologies"],
  ] as const)("classifies %s", (query, attribute) => {
    expect(understandStructuredRequest(query)?.attribute).toBe(attribute);
  });

  it("returns a fuzzy-matched API team member with their designation", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Who is Aarav Malhotraa in Successive?")!);
    expect(result?.answer).toContain("Aarav Malhotra");
    expect(result?.answer).toContain("Director of Engineering");
    expect(result?.document.role).toBe("company");
  });

  it("returns the designation when the company name is omitted", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Who is Aarav Malhotra?")!);
    expect(result?.answer).toBe("**Aarav Malhotra** is listed as **Director of Engineering** in Successive’s executive management section.");
  });

  it.each([
    ["Executive Management", "Executive One", "#w-tabs-5-data-w-pane-1"],
    ["Leadership Team", "Leadership One", "#w-tabs-5-data-w-pane-3"],
  ])(
    "returns the first three correctly mapped API people with designations for %s",
    (query, firstExpectedName, expectedAnchor) => {
      const aboutWithManagement = page(10, "about-us", "About Us", {
        executive_management: [
          { name: "Executive One", desgnation: "Chief Revenue Officer" },
          { name: "Executive Two", desgnation: "Executive Vice President" },
          { name: "Executive Three", desgnation: "Chief Technology Officer" },
          { name: "Executive Four", desgnation: "Chief Operating Officer" },
        ],
        leadership_team: [
          { name: "Leadership One", desgnation: "Business Unit Head" },
          { name: "Leadership Two", desgnation: "Engineering Director" },
          { name: "Leadership Three", desgnation: "Delivery Director" },
          { name: "Leadership Four", desgnation: "Practice Head" },
        ],
      });
      const result = answerStructuredRequest(
        [aboutWithManagement],
        understandStructuredRequest(query)!,
      );

      expect(result?.answer).toContain(firstExpectedName);
      expect(result?.answer).not.toContain(query === "Executive Management" ? "Leadership One" : "Executive One");
      expect(result?.answer).not.toContain(query === "Executive Management" ? "Executive Four" : "Leadership Four");
      expect(result?.answer.match(/^- \*\*/gm)).toHaveLength(3);
      expect(result?.answer).toContain("Showing the first 3 of 4.");
      expect(result?.answer).toContain("[More](");
      expect(result?.answer).toContain(expectedAnchor);
      expect(result?.document.url).toContain(expectedAnchor);
    },
  );

  it.each(["ceo", "Current CEO", "chief executive", "Who runs Successive?", "owner", "Who owns Successive?", "founder", "Who founded Successive?"])(
    "answers %s from Executive Management instead of unrelated retrieval",
    (query) => {
    const about = page(13, "about-us", "About Us", {
      executive_management: [
        { name: "API Chief", desgnation: "Founder & CEO" },
        { name: "API Executive", desgnation: "Chief Revenue Officer" },
      ],
      leadership_team: [
        { name: "Delivery Leader", desgnation: "Vice President – Global Delivery" },
      ],
    });
    const result = answerStructuredRequest([about], understandStructuredRequest(query)!);

    expect(result?.answer).toBe("- **API Chief** — Founder & CEO");
    expect(result?.answer).not.toContain("Delivery Leader");
    expect(result?.answer).not.toContain("Showing the first 3");
    expect(result?.document.url).toContain("#w-tabs-5-data-w-pane-1");
    },
  );

  it.each([
    ["managing partner", "Managing Partner"],
    ["CRO", "Chief Revenue Officer"],
    ["CTO", "Chief Technology Officer"],
    ["COO", "Chief Operating Officer"],
    ["CFO", "Chief Financial Officer"],
  ])("matches the requested executive designation: %s", (query, designation) => {
    const about = page(15, "about-us", "About Us", {
      executive_management: [
        { name: `${query} Person`, desgnation: designation },
        { name: "Other Executive", desgnation: "Executive Vice President" },
      ],
    });
    const result = answerStructuredRequest([about], understandStructuredRequest(query)!);

    expect(result?.answer).toContain(`${query} Person`);
    expect(result?.answer).toContain(designation);
    expect(result?.answer).not.toContain("Other Executive");
  });

  it("does not replace a missing requested executive role with arbitrary executives", () => {
    const about = page(16, "about-us", "About Us", {
      executive_management: [{ name: "API Chief", desgnation: "Founder & CEO" }],
    });
    const result = answerStructuredRequest([about], understandStructuredRequest("CFO")!);

    expect(result?.answer).toContain("couldn’t confirm");
    expect(result?.answer).not.toContain("API Chief");
    expect(result?.evidencePaths).toEqual([]);
  });

  it.each([
    ["How old is Successive Digital?", "approximately"],
    ["When was Successive founded?", "founded in **2012**"],
  ])("answers company-age intent from the published About founding year: %s", (query, expected) => {
    const about = page(14, "about-us", "About Us", {
      executive_management: [{ name: "API Chief", desgnation: "Founder & CEO" }],
      worldwide_footprint: "Founded in 2012, Successive has evolved into a global digital transformation company.",
    });
    const result = answerStructuredRequest([about], understandStructuredRequest(query)!);

    expect(result?.answer).toContain("2012");
    expect(result?.answer).toContain(expected);
    expect(result?.answer).not.toMatch(/hybrid app|cloud re-sales/i);
    expect(result?.document.slug).toBe("about-us");
  });

  it.each([
    "How does Successive support global enterprises?",
    "How do you support international clients?",
    "What is Successive's global presence?",
  ])("answers global-enterprise presence from the About worldwide-footprint field: %s", (query) => {
    const about = page(17, "about-us", "About Us", {
      executive_management: [{ name: "API Chief", desgnation: "Founder & CEO" }],
      worldwide_footprint: "Successive operates across seven strategic locations and serves 150+ enterprise clients worldwide.",
    });
    const result = answerStructuredRequest([about], understandStructuredRequest(query)!);

    expect(result?.answer).toContain("seven strategic locations");
    expect(result?.answer).toContain("150+ enterprise clients");
    expect(result?.answer).not.toContain("couldn’t confirm the capability");
    expect(result?.document.slug).toBe("about-us");
  });

  it("answers an office-location query without prepending company history", () => {
    const about = page(18, "about-us", "About Us", {
      worldwide_footprint: "Founded in 2012 by a small group of technologists, Successive became a global digital transformation company. Today, Successive operates across seven strategic locations, including India, London, Dallas (HQ), and Johannesburg, serving 150+ enterprise clients worldwide.",
    });
    const result = answerStructuredRequest([about], understandStructuredRequest("office location")!);

    expect(result?.answer).toContain("seven strategic locations");
    expect(result?.answer).toContain("Dallas (HQ)");
    expect(result?.answer).toContain("Dallas is identified as Successive’s headquarters");
    expect(result?.answer).toContain("150+ enterprise clients worldwide");
    expect(result?.answer.split(/\n\n/)).toHaveLength(4);
    expect(result?.answer).not.toMatch(/founded|2012|small group/i);
  });

  it("removes a historical prefix even when it shares a sentence with the location fact", () => {
    const about = page(19, "about-us", "About Us", {
      worldwide_footprint: "Founded in 2012 by technologists, Successive expanded globally; today it operates from offices in India, London, Dallas, and Johannesburg.",
    });
    const result = answerStructuredRequest([about], understandStructuredRequest("Where are your offices?")!);

    expect(result?.answer).toContain("operates from offices");
    expect(result?.answer).not.toMatch(/founded|2012|technologists/i);
  });

  it("directly answers a combined limited-scope and named-location question", () => {
    const about = page(20, "about-us", "About Us", {
      worldwide_footprint: "Successive operates across seven strategic locations, including India, London, Dallas (HQ), and Johannesburg, serving 150+ enterprise clients worldwide.",
    });
    const result = answerStructuredRequest([about], understandStructuredRequest("US-only? India offices?")!);
    const lines = result?.answer.split(/\n\n/) ?? [];

    expect(lines[0]).toMatch(/^No—/);
    expect(lines[1]).toMatch(/^Yes—.*India/);
    expect(result?.answer).toContain("seven strategic locations");
    expect(result?.answer).not.toContain("150+ enterprise clients");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("prefers a matching structured office address over a general footprint", () => {
    const about = page(21, "about-us", "About Us", {
      worldwide_footprint: "Successive operates across several global locations, including India, London, and Dallas (HQ).",
    });
    const contact = page(22, "contact", "Contact Us", {
      india_office_address: "Noida, Uttar Pradesh, India",
    });
    const result = answerStructuredRequest(
      [about, contact],
      understandStructuredRequest("Where is your India office?")!,
    );

    expect(result?.document.slug).toBe("contact");
    expect(result?.answer).toContain("Noida, Uttar Pradesh, India");
    expect(result?.answer).not.toMatch(/location intelligence|gis|geospatial/i);
  });

  it("turns raw contact country icons and addresses into a direct visitor-facing answer", () => {
    const about = page(23, "about-us", "About Us", {
      worldwide_footprint: "Successive operates across global locations including India and the US.",
    });
    const contact = page(24, "contact", "Contact Us", {
      offices: [
        { country_icon: "footer-icon-India", address: "Windsor Grand, Sector 126, Noida, UP 201301" },
        { country_icon: "footer-icon-US", address: "325 N Saint Paul St Suite 3100, Dallas, TX 75201" },
      ],
    });
    const result = answerStructuredRequest(
      [about, contact],
      understandStructuredRequest("US-only? India offices?")!,
    );

    expect(result?.answer).toMatch(/^No—/);
    expect(result?.answer).toContain("Yes—Successive has a published office location in India");
    expect(result?.answer).toContain("Windsor Grand, Sector 126, Noida, UP 201301");
    expect(result?.answer).toContain("325 N Saint Paul St Suite 3100, Dallas, TX 75201");
    expect(result?.answer).not.toMatch(/country icon|footer-icon/i);
  });

  it.each([
    ["Board of Directors", "board-directors", "#w-tabs-5-data-w-pane-0"],
    ["Partners & Advisors", "partners_and_advisors", "#w-tabs-5-data-w-pane-2"],
  ])("maps %s to its own API field and About tab", (query, field, expectedAnchor) => {
    const about = page(11, "about-us", "About Us", {
      [field]: [{ name: `${query} Person`, desgnation: `${query} Role` }],
    });
    const result = answerStructuredRequest([about], understandStructuredRequest(query)!);

    expect(result?.answer).toContain(`${query} Person`);
    expect(result?.document.url).toContain(expectedAnchor);
  });

  it("resolves a bare team-member name from the API record", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Aarav Malhotra")!);
    expect(result?.answer).toContain("Director of Engineering");
  });

  it("preserves a direct bare-name request in contextual routing", () => {
    expect(understandContextualStructuredRequest("Aarav Malhotra", []))
      .toMatchObject({ attribute: "person", subject: "aarav malhotra" });
  });

  it("does not fabricate a record for an unmatched bare name", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("Unknown Person")!);
    expect(result).toBeNull();
  });

  it("does not confuse an industry relationship with a technology lookup", () => {
    expect(understandStructuredRequest("Do you work with healthcare companies?")).toBeNull();
    expect(understandStructuredRequest("Do you use Example Runtime?")?.attribute).toBe("technologies");
  });

  it("keeps structured facts within their canonical API pages", () => {
    const values = answerStructuredRequest(corpus, understandStructuredRequest("List core values")!);
    const technologies = answerStructuredRequest(corpus, understandStructuredRequest("Which technologies do you use?")!);
    const partners = answerStructuredRequest(corpus, understandStructuredRequest("Show any partnerships")!);
    expect([values?.answer, values?.document.slug]).toEqual([expect.stringContaining("Curiosity"), "about-us"]);
    expect([technologies?.answer, technologies?.document.slug]).toEqual([expect.stringContaining("Example Runtime"), "global-capabilities"]);
    expect([partners?.answer, partners?.document.slug]).toEqual([expect.stringContaining("Example Cloud"), "partners"]);
  });

  it("derives authority roles from ACF structure", () => {
    expect(corpus.map((item) => buildSearchDocument(item)).map(({ role }) => role)).toEqual(["company", "company", "global_capabilities", "partners", "culture"]);
  });

  it("cleans generic media filenames without inventing a label", () => {
    expect(cleanMediaLabel("Example-Cloud-logo-final-2.png")).toBe("Example Cloud");
    expect(cleanMediaLabel("vendor_1699999999999_a3f22d019bc4.svg")).toBe("vendor");
  });

  it("normalizes bounded common typos for structured catalogs", () => {
    expect(understandStructuredRequest("parnters")?.attribute).toBe("partners");
    expect(understandStructuredRequest("tecnologies")?.attribute).toBe("technologies");
  });

  it("returns a bounded answer when an employee policy is not published", () => {
    const result = answerStructuredRequest(corpus, understandStructuredRequest("When is appraisal?")!);
    expect(result?.answer).toContain("couldn’t confirm");
    expect(result?.answer).not.toMatch(/cloud|CMS|UX project/i);
    expect(result?.document.role).toBe("culture");
  });

  it("returns career benefits from the structured advantage slider without media filenames", () => {
    const careers = page(12, "careers", "Careers", {
      description: "Join our team.",
      image_repeater: [{ image: { title: "why-successive1", url: "https://example.test/why-successive1.png" } }],
      advantage_subtitle: "Successive employees enjoy published workplace benefits.",
      advantage_slider: [
        {
          advantage_image: { title: "rewards", url: "https://example.test/rewards.webp" },
          advantage_heading: "Rewards & Recognitions",
          advantage_description: "Monthly and annual employee awards.",
        },
        {
          advantage_heading: "Learning & Development",
          advantage_description: "A progressive knowledge-sharing culture.",
        },
      ],
    });
    const result = answerStructuredRequest(
      [careers],
      understandStructuredRequest("What career benefits does Successive publish?")!,
    );

    expect(result?.answer).toContain("Rewards & Recognitions");
    expect(result?.answer).toContain("Monthly and annual employee awards");
    expect(result?.answer).toContain("Learning & Development");
    expect(result?.answer).not.toMatch(/why-successive|rewards\.webp/i);
    expect(result?.evidencePaths).toEqual(["advantage_subtitle", "advantage_slider"]);
  });

  it.each(["What is my employee ID?", "Who is my manager?", "What is the CEO personal phone number?"])(
    "routes private/internal information safely: %s",
    (query) => expect(understandStructuredRequest(query)?.attribute).toBe("employee_policy"),
  );

  it("does not classify a project-cost question as company overview", () => {
    expect(understandStructuredRequest("What is Successive exact chatbot project cost?"))
      .toBeNull();
  });
});
