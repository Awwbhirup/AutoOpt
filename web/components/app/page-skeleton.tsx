/**
 * Loading shapes for whole app pages, built to the same boxes as the real
 * ones (PageHeader, Stat, Panel) so nothing moves when the data lands.
 */

import { Skeleton, SkeletonRows, SkeletonText, LoadingNote } from "@/components/ui/skeleton";

import { PageMain } from "./frame";

export function HeaderSkeleton({ lead = true }: { lead?: boolean }) {
  return (
    <div className="mb-8">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="h-8 w-64 max-w-full" />
      {lead ? <SkeletonText lines={1} className="mt-3 max-w-xl" /> : null}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="glass glass--card rounded-xl px-4 py-3">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2.5 h-6 w-12" />
          <Skeleton className="mt-2 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={`glass glass--card min-w-0 rounded-xl ${className ?? ""}`}>
      <div className="flex min-h-11 items-center border-b border-line px-4">
        <Skeleton className="h-3 w-28" />
      </div>
      <SkeletonRows rows={rows} columns={columns} />
    </div>
  );
}

/** A generic page: header and one table panel. */
export function PageSkeleton({ label }: { label?: string }) {
  return (
    <PageMain>
      <LoadingNote label={label} />
      <HeaderSkeleton />
      <PanelSkeleton />
    </PageMain>
  );
}
