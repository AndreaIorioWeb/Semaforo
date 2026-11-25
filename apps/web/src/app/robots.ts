import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { publicBaseUrl } from "@/lib/owner";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const base = publicBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/analisi/", "/api/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
