import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/elks-test")({
  server: { handlers: { GET: async ({ request }) => {
    const u = process.env.ELKS_API_USERNAME!;
    const p = process.env.ELKS_API_PASSWORD!;
    const auth = "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
    const url = new URL(request.url);
    const id = url.searchParams.get("id")!;
    const body = url.searchParams.get("body")!;
    const r = await fetch(`https://api.46elks.com/a1/calls/${id}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return Response.json({ status: r.status, body: await r.text() });
  }}}});
