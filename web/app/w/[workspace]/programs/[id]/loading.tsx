import { HeaderSkeleton, PanelSkeleton } from "@/components/app/page-skeleton";
import { PageMain } from "@/components/app/frame";
import { LoadingNote, Skeleton } from "@/components/ui/skeleton";

export default function ProgramLoading() {
  return (
    <PageMain>
      <LoadingNote label="Loading the program" />
      <HeaderSkeleton lead={false} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="glass glass--card rounded-xl p-4">
          <Skeleton className="h-3 w-20" />
          <div className="mt-4 flex flex-col gap-2">
            {Array.from({ length: 12 }, (_, index) => (
              <Skeleton key={index} className="h-3" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <div className="glass glass--card rounded-xl p-4">
            <Skeleton className="h-9 w-64 max-w-full" />
          </div>
          <PanelSkeleton rows={4} />
        </div>
      </div>
    </PageMain>
  );
}
