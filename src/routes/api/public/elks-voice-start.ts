import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/elks-voice-start")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const url = new URL(request.url);
  let to = url.searchParams.get("to");
  if (!to) {
    // 46elks may POST form data
    try {
      const form = await request.formData();
      to = (form.get("to_param") as string) || null;
    } catch {}
  }
  if (!to) return new Response("Missing to", { status: 400 });
  return Response.json({ connect: to });
}
