import type { Metadata } from "next";
import { RoleForm } from "./role-form";

export const metadata: Metadata = { title: "Choose your role · NexusPulse" };

export default function RolePage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-h1">Choose your role</h1>
      <p className="mt-2 max-w-xl text-body text-copy">You can&apos;t change this later.</p>
      <div className="mt-8">
        <RoleForm />
      </div>
    </div>
  );
}
