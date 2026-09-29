import { HeaderSkeleton, PanelSkeleton } from "@/components/app/page-skeleton";
import { PageMain } from "@/components/app/frame";
import { LoadingNote } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <PageMain>
      <LoadingNote label="Loading projects" />
      <HeaderSkeleton />
      <div className="space-y-6">
        <PanelSkeleton rows={3} />
        <PanelSkeleton rows={2} />
      </div>
    </PageMain>
  );
}
