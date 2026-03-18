import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // For now, allow all routes — auth will be handled client-side
  // TODO: Add proper server-side auth check once deployment is stable
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};