import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/elks-cancel-ongoing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = process.env.ELKS_API_USERNAME!;
        const p = process.env.ELKS_API_PASSWORD!;
        const auth = "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "list";

        const list = await fetch("https://api.46elks.com/a1/calls?state=ongoing&limit=100", {
          headers: { Authorization: auth },
        }).then((r) => r.json());
        const calls = (list.data || []) as Array<{ id: string; state: string; from: string; to: string; created: string }>;

        if (action === "list") {
          return Response.json({ found: calls.length, calls });
        }

        const results: any[] = [];
        for (const c of calls) {
          const r = await fetch(`https://api.46elks.com/a1/calls/${c.id}`, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
            body: 'next=' + encodeURIComponent(JSON.stringify({ hangup: "manual-cancel" })),
          });
          results.push({ id: c.id, status: r.status, body: (await r.text()).slice(0, 200) });
        }
        return Response.json({ found: calls.length, results });
      },
    },
  },
});
