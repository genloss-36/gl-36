import type { APIRoute } from "astro";
import { SKILL_ARCHIVE } from "../../../lib/skill";

export const GET: APIRoute = () => new Response(SKILL_ARCHIVE, { headers: { "Content-Type": "application/gzip" } });
