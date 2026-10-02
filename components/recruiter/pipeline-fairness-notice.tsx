"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FAIRNESS_NOTICE } from "@/lib/copy";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "np-fairness-notice-collapsed";

export function PipelineFairnessNotice() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <Alert className="border-border bg-muted">
      <Info aria-hidden />
      <AlertDescription className={cn("text-small text-copy", collapsed && "line-clamp-1")}>{FAIRNESS_NOTICE}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="ghost" size="sm" aria-expanded={!collapsed} onClick={toggle}>
          {collapsed ? "Show more" : "Show less"}
        </Button>
      </AlertAction>
    </Alert>
  );
}
