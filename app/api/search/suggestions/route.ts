import { typesenseEnabled } from "@/lib/typesense/config";
import { searchTypesenseContractors } from "@/lib/typesense/search";
import { readFilterParams, SearchInputError } from "@/lib/search/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  if (!typesenseEnabled()) return Response.json({ suggestions: [] }, { headers });
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ suggestions: [] }, { headers });
  if (query.length > 200) return Response.json({ suggestions: [] }, { status: 400, headers });
  try {
    const result = await searchTypesenseContractors(query, 1, 5, readFilterParams(Object.fromEntries(params)));
    return Response.json({ suggestions: result.results.map(({ contractor }) => ({
      licenseNumber: contractor.licenseNumber, businessName: contractor.businessName, city: contractor.city,
    })) }, { headers });
  } catch (error) {
    return Response.json({ suggestions: [] }, { status: error instanceof SearchInputError ? 400 : 503, headers });
  }
}
