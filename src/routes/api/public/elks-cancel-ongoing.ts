import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/elks-cancel-ongoing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = process.env.ELKS_API_USERNAME!;
        const p = process.env.ELKS_API_PASSWORD!;
        const auth = "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (id) {
          const get = await fetch(`https://api.46elks.com/a1/calls/${id}`, {
            headers: { Authorization: auth },
          }).then((r) => r.json());
          return Response.json(get);
        }
        const list = await fetch("https://api.46elks.com/a1/calls?state=ongoing&limit=100", {
          headers: { Authorization: auth },
        }).then((r) => r.json());
        const calls = (list.data || []) as Array<{ id: string; state: string }>;
        const truly = calls.filter((c) => c.state === "ongoing");
        const results: any[] = [];
        for (const c of truly) {
          const r = await fetch(`https://api.46elks.com/a1/calls/${c.id}`, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
            body: 'next=' + encodeURIComponent(JSON.stringify({ play: "https://api.46elks.com/static/sound/busy.mp3" })),
          });
          results.push({ id: c.id, status: r.status, body: (await r.text()).slice(0, 300) });
        }
        return Response.json({ totalReturned: calls.length, trulyOngoing: truly.length, results });
      },
    },
  },
});
