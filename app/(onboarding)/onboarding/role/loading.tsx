import { Skeleton } from "@/components/ui/skeleton";

export default function RoleLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl" aria-busy="true" aria-live="polite">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
