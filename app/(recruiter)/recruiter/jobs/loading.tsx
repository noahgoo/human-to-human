import { Skeleton } from "@/components/ui/skeleton";

export default function RecruiterJobsLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="mt-2 h-4 w-48" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.5rem] rounded-xl" />
        ))}
      </div>
      <div className="mt-6 hidden overflow-hidden rounded-xl border md:block">
        <div className="flex gap-4 border-b px-3 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b px-3 py-4 last:border-b-0">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-3 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
