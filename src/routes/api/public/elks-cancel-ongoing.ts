import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/elks-cancel-ongoing")({
  server: {
    handlers: {
      GET: async () => {
        const u = process.env.ELKS_API_USERNAME!;
        const p = process.env.ELKS_API_PASSWORD!;
        const auth = "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
        const list = await fetch("https://api.46elks.com/a1/calls?state=ongoing&limit=100", {
          headers: { Authorization: auth },
        }).then((r) => r.json());
        const calls = (list.data || []) as Array<{ id: string; state: string }>;
        const results: any[] = [];
        for (const c of calls) {
          const r = await fetch(`https://api.46elks.com/a1/calls/${c.id}`, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
            body: "next=hangup",
          });
          results.push({ id: c.id, status: r.status, body: (await r.text()).slice(0, 120) });
        }
        return Response.json({ found: calls.length, results });
      },
    },
  },
});
