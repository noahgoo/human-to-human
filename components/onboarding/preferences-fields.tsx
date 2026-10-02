"use client";

import { WORK_MODE_LABEL } from "@/lib/copy";
import type { WorkMode } from "@/lib/types";
import { SENIORITY_OPTIONS } from "./preferences";

const selectClass =
  "mt-1.5 h-[38px] w-full rounded-md border border-border bg-card px-3 text-body text-foreground shadow-1 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function PreferencesFields({
  seniority,
  location,
  onSeniority,
  onLocation,
  seniorityError,
  locationError,
  idPrefix = "pref",
}: {
  seniority: string;
  location: "" | WorkMode;
  onSeniority: (value: string) => void;
  onLocation: (value: "" | WorkMode) => void;
  seniorityError?: string;
  locationError?: string;
  idPrefix?: string;
}) {
  const seniorityId = `${idPrefix}-seniority`;
  const locationId = `${idPrefix}-location`;
  const seniorityHint = seniorityError ? `${seniorityId}-error` : undefined;
  const locationHint = locationError ? `${locationId}-error` : undefined;
  const seniorityOptions = SENIORITY_OPTIONS.includes(seniority as (typeof SENIORITY_OPTIONS)[number])
    ? SENIORITY_OPTIONS
    : seniority
      ? [seniority, ...SENIORITY_OPTIONS]
      : SENIORITY_OPTIONS;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={seniorityId} className="text-small font-semibold text-foreground">
          Target seniority
        </label>
        <select
          id={seniorityId}
          value={seniority}
          onChange={(event) => onSeniority(event.target.value)}
          aria-invalid={seniorityError ? true : undefined}
          aria-describedby={seniorityHint}
          className={selectClass}
        >
          <option value="">No preference</option>
          {seniorityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {seniorityError && (
          <p id={seniorityHint} className="mt-1 text-small text-destructive">
            {seniorityError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={locationId} className="text-small font-semibold text-foreground">
          Work location preference
        </label>
        <select
          id={locationId}
          value={location}
          onChange={(event) => onLocation(event.target.value as "" | WorkMode)}
          aria-invalid={locationError ? true : undefined}
          aria-describedby={locationHint}
          className={selectClass}
        >
          <option value="">No preference</option>
          {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {WORK_MODE_LABEL[mode]}
            </option>
          ))}
        </select>
        {locationError && (
          <p id={locationHint} className="mt-1 text-small text-destructive">
            {locationError}
          </p>
        )}
      </div>
    </div>
  );
}
