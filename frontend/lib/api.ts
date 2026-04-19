const BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}/api${path}`, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface Stats {
  total_awards: number;
  total_funding: number;
  total_funding_fmt: string;
  unique_recipients: number;
  naics_coverage_pct: number;
  provinces_covered: number;
  year_range: string;
}

export interface NaicsSector {
  code: string;
  label: string;
}

export interface CompetitorRow {
  rank: number;
  entity_id: string;
  recipient_name: string;
  province: string;
  total_funding: number;
  total_funding_fmt: string;
  grant_count: number;
  latest_year: string;
  programs: string[];
}

export interface TrendRow {
  year: string;
  total_funding: number;
  award_count: number;
  unique_recipients: number;
}

export interface ProgramRow {
  program_name: string;
  total_awarded: number;
  total_fmt: string;
  award_count: number;
  median_award: number;
  median_fmt: string;
  unique_recipients: number;
}

/** Scraped program metadata from the HTML pipeline (programs_scraper). */
export interface ProgramMetadata {
  program_id: string;
  program_name: string;
  description: string | null;
  eligibility_text: string | null;
  program_type: "grant" | "loan" | "repayable" | "tax_credit" | string;
  min_funding: number | null;
  max_funding: number | null;
  naics_codes: string[];
  naics_keywords: string[];
  province_scope: string[];
  status: "open" | "closed" | string;
  source_url: string;
}

export interface TopRecipientRow {
  rank: number;
  entity_id: string;
  recipient_name: string;
  province: string;
  total_funding: number;
  total_funding_fmt: string;
  grant_count: number;
  latest_year: string;
  programs: string[];
}

export interface HeatmapData {
  sectors: string[];
  provinces: string[];
  values: number[][];
}

export interface AwardRow {
  source_ref:   string | null;
  fiscal_year:  string | null;
  program_name: string | null;
  department:   string | null;
  award_value:  number | null;
  award_fmt:    string;
  start_date:   string | null;
  end_date:     string | null;
  naics_code:   string | null;
  description:  string | null;
}

export interface RecipientProfile {
  entity_id:          string;
  recipient_name:     string | null;
  recipient_bn:       string | null;
  province:           string | null;
  city:               string | null;
  total_funding:      number;
  total_funding_fmt:  string;
  grant_count:        number;
  first_year:         string | null;
  latest_year:        string | null;
  by_year:            Record<string, number>;
  top_programs:       Record<string, number>;
  top_departments:    Record<string, number>;
  awards:             AwardRow[];
}

export interface TimelineYearly {
  fy: string;
  value: number;
  count: number;
}

export interface TimelineRecipient {
  rank: number;
  entity_id: string;
  recipient_name: string;
  province: string | null;
  sector_code: string;
  sector_label: string;
  total_funding: number;
  total_funding_fmt: string;
  grant_count: number;
  first_year: string | null;
  latest_year: string | null;
  top_program: string | null;
  top_department: string | null;
  yearly: TimelineYearly[];
}

export interface TimelineData {
  recipients: TimelineRecipient[];
  years: string[];
}

export interface QaRow {
  rule: string;
  description: string;
  severity: "error" | "warning";
  flagged: number;
  pct: number;
}

export const api = {
  stats:              ()                          => get<Stats>("/stats"),
  naicsSectors:       ()                          => get<NaicsSector[]>("/naics-sectors"),
  competitorMap:      (naics: string, province?: string, topN?: number) =>
                        get<CompetitorRow[]>("/competitor-map", { naics, province, top_n: topN }),
  fundingTrend:       (naics: string, province?: string) =>
                        get<TrendRow[]>("/funding-trend", { naics, province }),
  programIntelligence:(naics: string, topN?: number) =>
                        get<ProgramRow[]>("/program-intelligence", { naics, top_n: topN }),
  topRecipients:      (province?: string, topN?: number) =>
                        get<TopRecipientRow[]>("/top-recipients", { province, top_n: topN }),
  programs:           (status?: string, programType?: string) =>
                        get<ProgramMetadata[]>("/programs", { status, program_type: programType }),
  recipient:          (entityId: string)           => get<RecipientProfile>(`/recipient/${entityId}`),
  timeline:           (topN?: number, sectors?: string, minAward?: number) =>
                        get<TimelineData>("/timeline", { top_n: topN, sectors, min_award: minAward }),
  sectorHeatmap:      ()                          => get<HeatmapData>("/sector-heatmap"),
  qaReport:           ()                          => get<QaRow[]>("/qa-report"),
  health:             ()                          => get<{ status: string; records: number }>("/health"),
};
