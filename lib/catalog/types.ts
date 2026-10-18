import type { Database } from "@/lib/supabase/database.types";

export type CatalogPhoto = { id: string; position: number; url: string };
export type CatalogListing = Database["public"]["Tables"]["listings"]["Row"] & {
  photos: CatalogPhoto[];
};
export type CatalogPage = {
  data: CatalogListing[];
  pagination: { page: number; pageSize: number; total: number };
};
