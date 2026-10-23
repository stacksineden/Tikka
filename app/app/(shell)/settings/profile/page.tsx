import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { ProfileEditor } from "@/components/setup/SettingsEditors";
import { getBusiness } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Business profile" };

async function Editor() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  return <ProfileEditor key={`${user.id}:${b.id}`} business={b} />;
}

export default function ProfilePage() {
  return (
    <SettingsPage title="Business profile" intro="What people see when they open your card: Overview, Services and Video.">
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Editor />
      </Suspense>
    </SettingsPage>
  );
}
