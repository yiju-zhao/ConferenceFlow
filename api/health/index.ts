import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { HealthResponse } from "@/types/api";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({ status: "ok" } satisfies HealthResponse);
}
