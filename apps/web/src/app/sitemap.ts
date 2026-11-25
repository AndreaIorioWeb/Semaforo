import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { publicBaseUrl } from "@/lib/owner";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = publicBaseUrl();
  return ["", "/metodologia", "/privacy", "/contatti"].map((p) => ({ url: `${base}${p}`, changeFrequency: "monthly" }));
}
