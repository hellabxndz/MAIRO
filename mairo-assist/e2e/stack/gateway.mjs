// E2E ONLY: stands in for Supabase's API gateway. Routes /auth/v1 to GoTrue
// and /rest/v1 to PostgREST, and serves supabase/templates/* (the same email
// templates production uses) for GoTrue to fetch.
import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const routes = [
  { prefix: "/auth/v1", port: Number(process.env.GOTRUE_PORT ?? 9999) },
  { prefix: "/rest/v1", port: Number(process.env.POSTGREST_PORT ?? 54330) },
];

http
  .createServer((req, res) => {
    if (req.url.startsWith("/templates/")) {
      const name = req.url.slice("/templates/".length).replace(/[^a-z_.]/g, "");
      try {
        res.writeHead(200, { "content-type": "text/html" }).end(readFileSync(join(here, "../../supabase/templates", name)));
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    const route = routes.find((r) => req.url.startsWith(r.prefix));
    if (!route) return res.writeHead(404).end("no route");
    const upstream = http.request(
      { host: "127.0.0.1", port: route.port, method: req.method, path: req.url.slice(route.prefix.length) || "/", headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => res.writeHead(502).end(String(e)));
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway on ${PORT}`));
