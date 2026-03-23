import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/m/login"];
// API routes handle their own auth — don't interfere
const API_PREFIX = "/api/";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // API routes handle their own auth — let them through
  if (pathname.startsWith(API_PREFIX)) {
    return NextResponse.next();
  }

  // Create Supabase client for server-side session check
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options as any);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // No session — redirect to appropriate login
    if (pathname.startsWith("/m")) {
      return NextResponse.redirect(new URL("/m/login", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Role-based route protection
  const role = user.user_metadata?.role || "freelancer";

  // Freelancers can only access /m/* (mobile) routes
  if (role === "freelancer" && !pathname.startsWith("/m") && !pathname.startsWith("/api")) {
    return NextResponse.redirect(new URL("/m", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
