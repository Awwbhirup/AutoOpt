import { PanelSkeleton, HeaderSkeleton, StatsSkeleton } from "@/components/app/page-skeleton";
import { PageMain } from "@/components/app/frame";
import { LoadingNote } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageMain>
      <LoadingNote label="Loading the workspace" />
      <HeaderSkeleton />
      <StatsSkeleton />
      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <PanelSkeleton rows={8} />
        <PanelSkeleton rows={2} columns={1} />
      </div>
    </PageMain>
  );
}
