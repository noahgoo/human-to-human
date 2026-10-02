import { Skeleton } from "@/components/ui/skeleton";

export default function AdminCompaniesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
