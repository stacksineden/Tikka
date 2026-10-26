import "server-only";

import { isDbId } from "./business-db";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Tikka Studio enquiries and Spark early access (PRD B11, B12; TECH_PLAN §19). Visitors' writes
// go through server-only functions after the app's rate limit; owners act for their own business;
// only admins read the lists. Demo businesses keep Spark's state in memory.

export interface EnquiryInput {
  name: string;
  businessName: string;
  phone: string;
  services: string[];
  budgetRange?: string;
  note?: string;
  sourceCaseStudy?: string;
  businessId?: string;
}

export async function dbSubmitEnquiry(e: EnquiryInput): Promise<boolean> {
  const { error } = await adminClient().rpc("submit_studio_enquiry", {
    p_name: e.name,
    p_business_name: e.businessName,
    p_phone: e.phone,
    p_services: e.services,
    p_budget_range: e.budgetRange ?? null,
    p_note: e.note ?? null,
    p_source_case_study: e.sourceCaseStudy ?? null,
    p_business: e.businessId && isDbId(e.businessId) ? e.businessId : null,
  });
  return !error;
}

/** A signed-out visitor's email or WhatsApp number, already normalised. Twice changes nothing. */
export async function dbJoinEarlyAccessContact(contact: string): Promise<boolean> {
  const { error } = await adminClient().rpc("join_early_access_contact", { p_feature: "spark", p_contact: contact });
  return !error;
}

export type Teaser = "spark_builder" | "spark_dashboard";
export interface SparkState {
  onList: boolean;
  dismissed: Teaser[];
}

// DEMO: Spark state for demo businesses, which aren't in the database.
const demoSpark: Map<string, SparkState> = ((globalThis as { __tikkaSpark?: Map<string, SparkState> }).__tikkaSpark ??= new Map());

export async function sparkState(businessId: string): Promise<SparkState> {
  if (!isDbId(businessId)) return demoSpark.get(businessId) ?? { onList: false, dismissed: [] };
  const sb = await createClient();
  const { data, error } = await sb.rpc("spark_state", { p_business: businessId });
  const row = (data as { on_list: boolean; dismissed: Teaser[] }[] | null)?.[0];
  return error || !row ? { onList: false, dismissed: [] } : { onList: row.on_list, dismissed: row.dismissed ?? [] };
}

/** The owner signs their own business up (the database checks it's theirs). */
export async function joinSparkForBusiness(businessId: string): Promise<boolean> {
  if (!isDbId(businessId)) {
    const s = await sparkState(businessId);
    demoSpark.set(businessId, { ...s, onList: true });
    return true;
  }
  const sb = await createClient();
  const { error } = await sb.rpc("join_early_access", { p_feature: "spark", p_business: businessId });
  return !error;
}

export async function dismissTeaser(businessId: string, teaser: Teaser): Promise<boolean> {
  if (!isDbId(businessId)) {
    const s = await sparkState(businessId);
    demoSpark.set(businessId, { ...s, dismissed: [...new Set([...s.dismissed, teaser])] });
    return true;
  }
  const sb = await createClient();
  const { error } = await sb.rpc("dismiss_teaser", { p_business: businessId, p_teaser: teaser });
  return !error;
}

/* ------------------------------------------------------------------ admin */

export interface AdminEnquiry {
  id: string;
  name: string;
  businessName: string;
  phone: string;
  services: string[];
  budgetRange?: string;
  note?: string;
  sourceCaseStudy?: string;
  tikkaBusiness?: string;
  status: "new" | "contacted" | "converted" | "closed";
  createdAt: string;
}

export async function dbAdminEnquiries(): Promise<AdminEnquiry[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_studio_enquiries");
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    name: String(e.name),
    businessName: String(e.business_name),
    phone: String(e.phone),
    services: (e.services as string[]) ?? [],
    budgetRange: e.budget_range ? String(e.budget_range) : undefined,
    note: e.note ? String(e.note) : undefined,
    sourceCaseStudy: e.source_case_study ? String(e.source_case_study) : undefined,
    tikkaBusiness: e.tikka_business ? String(e.tikka_business) : undefined,
    status: e.status as AdminEnquiry["status"],
    createdAt: String(e.created_at),
  }));
}

export async function dbAdminSetEnquiryStatus(id: string, status: AdminEnquiry["status"]): Promise<void> {
  const sb = await createClient();
  await sb.rpc("admin_set_enquiry_status", { p_enquiry: id, p_status: status });
}

export async function dbAdminEarlyAccess(): Promise<{ count: number; list: { businessName?: string; businessSlug?: string; contact?: string; createdAt: string }[] }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_early_access", { p_feature: "spark" });
  if (error || !data) return { count: 0, list: [] };
  const j = data as { count: number; list: Record<string, unknown>[] };
  return {
    count: Number(j.count),
    list: (j.list ?? []).map((r) => ({
      businessName: r.business_name ? String(r.business_name) : undefined,
      businessSlug: r.business_slug ? String(r.business_slug) : undefined,
      contact: r.contact ? String(r.contact) : undefined,
      createdAt: String(r.created_at),
    })),
  };
}
