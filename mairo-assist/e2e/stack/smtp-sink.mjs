// E2E ONLY: a minimal SMTP server that keeps every email in memory and
// exposes them over HTTP (GET /messages?to=addr) so tests can click links.
import http from "node:http";
import net from "node:net";

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 54325);
const HTTP_PORT = Number(process.env.SMTP_HTTP_PORT ?? 54326);
const messages = [];

function decodeQuotedPrintable(s) {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

net
  .createServer((sock) => {
    let data = false;
    let buf = "";
    let to = [];
    const reply = (l) => sock.write(`${l}\r\n`);
    reply("220 sink ESMTP");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\r\n")) >= 0) {
        if (data) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const raw = buf.slice(0, end);
          buf = buf.slice(end + 5);
          data = false;
          let body = raw;
          if (/content-transfer-encoding:\s*quoted-printable/i.test(raw)) body = decodeQuotedPrintable(raw);
          const b64 = /content-transfer-encoding:\s*base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/i.exec(raw);
          if (b64) body += "\n" + Buffer.from(b64[1].replace(/\s/g, ""), "base64").toString("utf8");
          const subject = /^subject:\s*(.*)$/im.exec(raw)?.[1] ?? "";
          messages.push({ to, subject, body, at: Date.now() });
          to = [];
          reply("250 OK");
          continue;
        }
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") reply("250 sink");
        else if (cmd === "MAIL") reply("250 OK");
        else if (cmd === "RCPT") {
          to.push((/<([^>]+)>/.exec(line)?.[1] ?? "").toLowerCase());
          reply("250 OK");
        } else if (cmd === "DATA") {
          data = true;
          reply("354 go ahead");
        } else if (cmd === "QUIT") {
          reply("221 bye");
          sock.end();
        } else reply("250 OK");
      }
    });
  })
  .listen(SMTP_PORT, "127.0.0.1");

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    // A stand-in for Resend's API (POST /emails) so app emails land here too.
    if (req.method === "POST" && url.pathname === "/emails") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const b = JSON.parse(raw || "{}");
        if (req.headers.authorization !== "Bearer re_e2e") return res.writeHead(401).end();
        const to = (Array.isArray(b.to) ? b.to : [b.to]).map((t) => String(t).toLowerCase());
        messages.push({ to, subject: b.subject ?? "", body: `${b.text ?? ""}\n${b.html ?? ""}`, at: Date.now() });
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `email_${messages.length}` }));
      });
      return;
    }
    const to = url.searchParams.get("to")?.toLowerCase();
    const list = to ? messages.filter((m) => m.to.includes(to)) : messages;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(list));
  })
  .listen(HTTP_PORT, "127.0.0.1", () => console.log(`smtp sink ${SMTP_PORT}, http ${HTTP_PORT}`));
