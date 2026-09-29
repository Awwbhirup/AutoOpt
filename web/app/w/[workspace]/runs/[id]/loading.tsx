import { HeaderSkeleton } from "@/components/app/page-skeleton";
import { PageMain } from "@/components/app/frame";
import { LoadingNote, Skeleton } from "@/components/ui/skeleton";

export default function RunLoading() {
  return (
    <PageMain>
      <LoadingNote label="Loading the trace" />
      <HeaderSkeleton lead={false} />
      <div className="glass glass--card rounded-xl p-4">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2 h-5 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="glass glass--card mt-4 divide-y divide-line rounded-xl">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="px-4 py-3">
            <Skeleton className="h-3.5 w-56 max-w-full" />
            <Skeleton className="mt-2.5 h-4 w-40" />
          </div>
        ))}
      </div>
    </PageMain>
  );
}
