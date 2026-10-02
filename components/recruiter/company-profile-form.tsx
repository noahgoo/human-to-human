"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateCompanyProfile } from "@/app/(recruiter)/recruiter/company/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CompanyProfileForm({
  name,
  website,
  description,
}: {
  name: string;
  website: string;
  description: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setFields({});
    try {
      const result = await updateCompanyProfile({
        name: String(data.get("name") ?? ""),
        website: String(data.get("website") ?? ""),
        description: String(data.get("description") ?? ""),
      });
      if (!result.ok) {
        setFields(result.error.fields ?? {});
        toast.error(result.error.message);
        return;
      }
      toast.success("Company profile saved.");
      router.refresh();
    } catch {
      toast.error("Something went wrong on our side.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-name">Company name</Label>
        <Input id="company-name" name="name" defaultValue={name} required className="h-[38px] rounded-md" aria-invalid={!!fields.name} />
        {fields.name && <p className="text-small text-destructive">{fields.name}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-website">
          Website <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="company-website"
          name="website"
          defaultValue={website}
          placeholder="https://brightforge.io"
          inputMode="url"
          className="h-[38px] rounded-md"
          aria-invalid={!!fields.website}
        />
        {fields.website && <p className="text-small text-destructive">{fields.website}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="company-description" name="description" defaultValue={description} rows={4} className="rounded-md" aria-invalid={!!fields.description} />
        {fields.description && <p className="text-small text-destructive">{fields.description}</p>}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
