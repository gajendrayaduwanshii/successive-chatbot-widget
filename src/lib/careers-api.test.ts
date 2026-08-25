import { describe, expect, it } from "vitest";
import {
  filterCareerJobs,
  isCareerOpeningQuery,
  shouldUseCareerOpeningRoute,
  type CareerJob,
} from "./careers-api";

const jobs: CareerJob[] = [
  {
    id: 1,
    title: "Full-Stack Lead",
    departmentName: "Node",
    experience: "8+",
    jobLocations: [{ name: "Noida" }],
    excerpt: "React, Node.js, Python, cloud, and DevOps engineering.",
  },
  {
    id: 2,
    title: "MERN Lead",
    departmentName: "Solutions",
    experience: "6-10 years",
    jobLocations: [{ name: "Noida" }],
    excerpt: "MongoDB, Express.js, React, Node.js, and Next.js.",
  },
  {
    id: 3,
    title: "GIS Analyst",
    departmentName: "Information & Technology",
    jobLocations: [{ name: "Pune" }],
    excerpt: "Experience: 4-5 years. ArcGIS, QGIS, Python and spatial analysis.",
  },
];

describe("dynamic Successive career openings", () => {
  it("recognizes career, vacancy, application, and opening questions", () => {
    expect(isCareerOpeningQuery("How many openings are available?")).toBe(true);
    expect(isCareerOpeningQuery("Are you hiring React developers?")).toBe(true);
    expect(isCareerOpeningQuery("How can I apply for Full-Stack Lead?"))
      .toBe(true);
    expect(isCareerOpeningQuery("Tell me about Successive careers")).toBe(false);
    expect(isCareerOpeningQuery("What benefits does the Careers page describe?"))
      .toBe(false);
    expect(isCareerOpeningQuery("What is your application modernization approach?"))
      .toBe(false);
    expect(isCareerOpeningQuery("What role does cloud play in modernization?"))
      .toBe(false);
    expect(isCareerOpeningQuery("Which role does AI play in your solutions?"))
      .toBe(false);
  });

  it("returns all jobs for a total-opening question", () => {
    expect(filterCareerJobs(jobs, "How many openings are available?")).toHaveLength(3);
    expect(filterCareerJobs(jobs, "could you plz find me the current opening in successive"))
      .toHaveLength(3);
    expect(filterCareerJobs(
      jobs,
      "Hey i m lookin for it job could you plz give the data in hirings in successive",
    )).toHaveLength(3);
  });

  it("allows only dependent career refinements into the live openings route", () => {
    expect(shouldUseCareerOpeningRoute("Pune only", "career", "REFINE_SCOPE"))
      .toBe(true);
    expect(shouldUseCareerOpeningRoute("MERN only", "career", "REFINE_SCOPE"))
      .toBe(true);
    expect(shouldUseCareerOpeningRoute("AI services", "service", "SWITCH_TOPIC"))
      .toBe(false);
    expect(filterCareerJobs(jobs, "Pune only").map((job) => job.id)).toEqual([3]);
    expect(filterCareerJobs(jobs, "MERN only").map((job) => job.id)).toEqual([2]);
  });

  it("filters dynamically by technology and location", () => {
    expect(filterCareerJobs(jobs, "Are there GIS jobs in Pune?").map((job) => job.id))
      .toEqual([3]);
    expect(filterCareerJobs(jobs, "Show React openings in Noida").map((job) => job.id))
      .toEqual([1, 2]);
    expect(filterCareerJobs(jobs, "Show data jobs").map((job) => job.id))
      .toEqual([]);
  });

  it("filters by a candidate's stated experience", () => {
    expect(filterCareerJobs(jobs, "Jobs for 5 years experience").map((job) => job.id))
      .toEqual([3]);
    expect(filterCareerJobs(jobs, "Node openings for 8 years experience").map((job) => job.id))
      .toEqual([1, 2]);
  });

  it("returns no matches for unsupported criteria", () => {
    expect(filterCareerJobs(jobs, "Show Golang jobs in Noida")).toEqual([]);
  });

  it("requires strong skill evidence instead of an incidental long-description mention", () => {
    const weak: CareerJob = {
      id: 4,
      title: "Business Analyst",
      description: `${"Business analysis and stakeholder coordination. ".repeat(20)} Our company also employs React teams elsewhere.`,
    };
    expect(filterCareerJobs([...jobs, weak], "React jobs").map(({ id }) => id))
      .toEqual([1, 2]);
  });
});
