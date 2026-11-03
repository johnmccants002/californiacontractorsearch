import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { claimsEnabled, claimsOrigin, userSupabaseConfig } from "./config";
import { safeNext } from "./validation";

export async function createUserClient() {
  const store = await cookies();
  const { url, key } = userSupabaseConfig();
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: claimsOrigin().startsWith("https:"),
      path: "/",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* Rendering cannot set cookies; proxy refreshes them first. */
        }
      },
    },
  });
}
export async function requireAccount(next = "/account") {
  if (!claimsEnabled()) notFound();
  const db = await createUserClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user?.email_confirmed_at)
    redirect(`/account/sign-in?next=${encodeURIComponent(safeNext(next))}`);
  return { db, user: data.user };
}
