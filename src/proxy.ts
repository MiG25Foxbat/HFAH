import { NextResponse, type NextRequest } from "next/server";

// Имя cookie сеанса владельца — как SESSION_COOKIE в src/lib/server/session.ts (там `server-only`, поэтому здесь строка).
const SESSION_COOKIE = "ladno_sid";

/**
 * Анонимный заход в /admin/* получает настоящий 307 на /admin/login: без прокси страница уже отвечает 200 и редиректит внутри потока.
 * Проверяется только наличие cookie, а не её валидность: подлинность сеанса по-прежнему решает requireOwner() на каждой странице и в каждом Server Action.
 * POST (Server Actions) не трогаем: их проверяет сам action, а 307 переслал бы POST на страницу входа.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const open = pathname === "/admin/login" || pathname.startsWith("/admin/login/");
  if (open || request.cookies.has(SESSION_COOKIE) || (request.method !== "GET" && request.method !== "HEAD")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
