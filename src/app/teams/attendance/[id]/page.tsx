import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPracticeDetail } from "@/actions/attendance";
import { PageHeader } from "@/components/layout/page-header";
import { AttendanceList } from "@/components/attendance/attendance-list";
import { formatDateTime } from "@/lib/utils";

export default async function PracticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const practice = await getPracticeDetail(id);
  if (!practice) notFound();

  return (
    <div className="space-y-4">
      <Link href="/teams/attendance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> All practices
      </Link>
      <PageHeader title="Practice attendance" subtitle={formatDateTime(practice.date)} />
      <AttendanceList practiceId={practice.id} notes={practice.notes} rows={practice.rows} />
    </div>
  );
}
