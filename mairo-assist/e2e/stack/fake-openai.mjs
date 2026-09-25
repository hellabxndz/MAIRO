// E2E ONLY: a deterministic stand-in for the OpenAI Responses API
// (POST /v1/responses). It picks tools by keyword so tests exercise the real
// SDK, the agent loop, tool execution and persistence without an API key.
//   GET  /__requests   -> every request body received (for assertions)
//   POST /__mode       -> {"mode":"down"} makes it return 503s; {"mode":"up"}
import http from "node:http";

const PORT = Number(process.env.FAKE_OPENAI_PORT ?? 54327);
const requests = [];
let mode = "up";
let seq = 0;

const id = (p) => `${p}_${++seq}`;
const hasTool = (body, name) => (body.tools ?? []).some((t) => t.name === name);

function reply(body) {
  const input = body.input ?? [];
  const last = input.at(-1);
  const userText = String([...input].reverse().find((i) => i.role === "user")?.content ?? "").toLowerCase();
  if (last?.type === "function_call_output") {
    let out = {};
    try { out = JSON.parse(last.output); } catch {}
    if (out.error) return { text: "Sorry, I couldn't do that right now. I can connect you with the team." };
    if (out.verified === true) {
      const orderNo = [...input].reverse().map((i) => /#?(\d{4,})/.exec(String(i.content ?? ""))?.[1]).find(Boolean);
      if (orderNo && hasTool(body, "get_order_status")) return { call: { name: "get_order_status", arguments: { order_number: orderNo } } };
    }
    if (out.verified === false) return { text: out.result };
    if (out.order) {
      const s = out.order.shipments?.[0];
      const t = s?.tracking?.[0];
      return { text: `Order ${out.order.number} is ${s?.status ?? out.order.status}${t ? ` — ${t.company} tracking ${t.number}` : ""}.` };
    }
    if (typeof out.result === "string" && out.result.startsWith("If that order number")) return { text: "I've emailed a 6-digit code to the address on that order. Please type it here." };
    if (Array.isArray(out.results) && out.results[0]?.product_id) {
      if (/(stock|available)/.test(userText) && hasTool(body, "check_availability")) {
        return { call: { name: "check_availability", arguments: { product_id: out.results[0].product_id, variant: /size (\w+)/.exec(userText)?.[1] ?? null } } };
      }
      return { text: `We have ${out.results.map((r) => `${r.title} (${r.price})`).join(", ")}.` };
    }
    if (Array.isArray(out.variants)) return { text: `${out.product}: ${out.variants.map((v) => `size ${v.variant} is ${v.availability.replaceAll("_", " ")}`).join("; ")} (checked ${out.checked}).` };
    if (Array.isArray(out.results) && !out.results.length && /product/.test(out.note ?? "")) return { text: "I couldn't find that product in the store." };
    if (out.result) return { text: out.result.startsWith("PREVIEW") ? "A person from the team will follow up with you here." : "Thanks! A person from the team will follow up with you here." };
    if (Array.isArray(out.results) && out.results.length) return { text: `Here's what I found: ${out.results[0].text}` };
    return { text: "I don't have that information, but I can connect you with the team." };
  }
  const text = String(last?.content ?? "").toLowerCase();
  if (/^\s*\d{6}\s*$/.test(text) && hasTool(body, "verify_order_code")) {
    return { call: { name: "verify_order_code", arguments: { code: text.trim() } } };
  }
  const orderEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(text)?.[0];
  const orderNo = /#?(\d{4,})/.exec(text)?.[1];
  if (/order/.test(text) && orderEmail && orderNo && hasTool(body, "request_order_verification")) {
    return { call: { name: "request_order_verification", arguments: { order_number: orderNo, email: orderEmail } } };
  }
  if (/(person|human|agent)/.test(text) && hasTool(body, "escalate_to_human")) {
    return { call: { name: "escalate_to_human", arguments: { reason: "Customer asked for a person" } } };
  }
  const email = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(text)?.[0];
  if (email && /(contact|notify|email me)/.test(text) && hasTool(body, "capture_lead")) {
    return { call: { name: "capture_lead", arguments: { email, name: null, interest: "Restock notification" } } };
  }
  if (/(boot|tote|bag|sample|buy|sell|recommend|stock|available)/.test(text) && hasTool(body, "search_products")) {
    const query = /(boot|tote|bag|sample)/.exec(text)?.[1] ?? text.slice(0, 60);
    return { call: { name: "search_products", arguments: { query, max_price: null } } };
  }
  if (/(return|refund|shipping|policy|size|sizing|hours)/.test(text) && hasTool(body, "search_knowledge")) {
    return { call: { name: "search_knowledge", arguments: { query: text.slice(0, 120) } } };
  }
  return { text: "Hi! I'm here to help with anything about the store." };
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.url === "/__requests") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(requests));
      if (req.url === "/__mode") {
        mode = JSON.parse(raw || "{}").mode === "down" ? "down" : "up";
        return res.writeHead(200).end(mode);
      }
      if (req.method !== "POST" || !req.url.endsWith("/responses")) return res.writeHead(404).end();
      const body = JSON.parse(raw || "{}");
      requests.push({ auth: req.headers.authorization, body });
      if (mode === "down") return res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "unavailable" } }));

      const r = reply(body);
      const output = r.call
        ? [{ type: "function_call", id: id("fc"), call_id: id("call"), name: r.call.name, arguments: JSON.stringify(r.call.arguments), status: "completed" }]
        : [{ type: "message", id: id("msg"), role: "assistant", status: "completed", content: [{ type: "output_text", text: r.text, annotations: [] }] }];
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          id: id("resp"),
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          status: "completed",
          model: body.model,
          output,
          usage: { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 60, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 1260 },
        }),
      );
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake openai on ${PORT}`));
