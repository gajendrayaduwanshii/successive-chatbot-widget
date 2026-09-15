export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface WordPressItem {
  id: number;
  type?: string;
  slug?: string;
  status?: string;
  date?: string;
  modified?: string;
  link?: string;
  title?: { rendered?: string } | string;
  excerpt?: { rendered?: string } | string;
  content?: { rendered?: string } | string;
  featured_image?: string | { url?: string; source_url?: string };
  author?: number;
  author_name?: string;
  parent?: number;
  menu_order?: number;
  categories?: number[];
  tags?: number[];
  taxonomy?: Record<string, Array<number | string>>;
  _links?: Record<string, Array<{ href?: string; taxonomy?: string; embeddable?: boolean }>>;
  avatar_urls?: Record<string, string>;
  description?: string;
  url?: string;
  _embedded?: {
    author?: Array<{ name?: string; description?: string; link?: string }>;
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
  };
  acf?: JsonValue;
}

export interface NormalizedContent {
  id: number;
  type: string;
  slug: string;
  title: string;
  excerpt: string;
  plainText: string;
  url: string;
  image?: string;
  modified?: string;
  acfText: string;
  extractedUrls: string[];
  service_type?: string;
  score?: number;
}
