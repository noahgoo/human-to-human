import { Skeleton } from "@/components/ui/skeleton";

export default function ApplicantOnboardingLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
