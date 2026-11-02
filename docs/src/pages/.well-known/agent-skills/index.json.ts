import type { APIRoute } from "astro";
import { SKILL_DESCRIPTION, SKILL_DIGEST, SKILL_NAME } from "../../../lib/skill";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        skills: [
          {
            name: SKILL_NAME,
            type: "archive",
            description: SKILL_DESCRIPTION,
            url: `${SKILL_NAME}.tar.gz`,
            digest: SKILL_DIGEST,
          },
        ],
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json" } },
  );
