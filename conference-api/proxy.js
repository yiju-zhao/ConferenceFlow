import { NextResponse } from "next/server";

export function proxy(request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    "https://conferenceflow.vercel.app",
    "https://conference-flow.vercel.app",
  ];

  const response = NextResponse.next();

  if (allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
