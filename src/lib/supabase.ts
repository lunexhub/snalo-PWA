// Supabase Client and Data Layer for Snalo Fast Delivery
// Connects to live Supabase database & Supabase Storage CDN

export const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
  "https://dcmuughdramlrfqbkqli.supabase.co";

export const SUPABASE_ANON_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && (process.env?.SUPABASE_ANON_KEY || process.env?.VITE_SUPABASE_ANON_KEY)) ||
  "";

export interface SupabaseProduct {
  id: string;
  name: string;
  unit: string;
  price: number;
  category: string;
  image_url: string;
  in_stock: boolean;
  description?: string;
}

export interface SupabaseCategory {
  id: string;
  name: string;
  emoji: string;
  display_order: number;
}

export interface SupabaseStore {
  id: string;
  name: string;
  badge?: string;
  delivery_time?: string;
  is_open?: boolean;
}

export const STORAGE_BASE_URL = `${SUPABASE_URL}/storage/v1/object/public/snalo-assets`;

// Fetch products from live Supabase database
export async function getSupabaseProducts(): Promise<SupabaseProduct[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=id.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) {
      console.warn("[Supabase] Products query failed, status:", res.status);
      return [];
    }
    const data = (await res.json()) as SupabaseProduct[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[Supabase] Error fetching products:", err);
    return [];
  }
}

// Fetch categories from live Supabase database
export async function getSupabaseCategories(): Promise<SupabaseCategory[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?select=*&order=display_order.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SupabaseCategory[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[Supabase] Error fetching categories:", err);
    return [];
  }
}

// Fetch stores from live Supabase database
export async function getSupabaseStores(): Promise<SupabaseStore[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=*&order=id.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SupabaseStore[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[Supabase] Error fetching stores:", err);
    return [];
  }
}
