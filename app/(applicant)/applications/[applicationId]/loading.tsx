import { Skeleton } from "@/components/ui/skeleton";

export default function ApplicationDetailLoading() {
  return (
    <div className="max-w-3xl space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
