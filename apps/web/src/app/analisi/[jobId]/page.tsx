import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalysisView } from "@/components/AnalysisView";

export const metadata: Metadata = {
  title: "Analisi",
  robots: { index: false, follow: false },
};

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function AnalysisPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!JOB_ID.test(jobId)) notFound();
  return (
    <div className="container-page py-12">
      <AnalysisView jobId={jobId} />
      <noscript>
        <p className="mt-6">Per seguire l&apos;analisi serve JavaScript attivo nel browser.</p>
      </noscript>
    </div>
  );
}
