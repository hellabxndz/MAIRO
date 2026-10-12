// Checks the fetch every customer-supplied web address goes through can only
// reach the public internet: private and reserved addresses, local names,
// odd schemes, ports and embedded passwords are refused before any request,
// and the socket's own DNS lookup refuses private answers too (so a name
// can't resolve publicly first and privately at connection time).
//
//   npm run check:safe-fetch   (local only; nothing leaves this machine)

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { guardedLookup, isPrivateAddress, safeFetch, urlProblem } from "../src/lib/net/safe-fetch";
import { fetchPublicPage, probeLandingPage } from "../src/lib/campaigns/landing-probe";
import { readShop } from "../src/lib/catalog/read-shop";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

async function main() {
  console.log("— addresses —");
  await check("private, loopback, link-local, metadata, CGNAT, multicast and documentation ranges are private", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "192.0.2.10", "198.51.100.1", "203.0.113.5", "198.18.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:169.254.169.254", "64:ff9b::10.0.0.1", "2001:db8::1", "not-an-ip"]) {
      assert.equal(isPrivateAddress(a), true, a);
    }
  });
  await check("ordinary public addresses are public", () => {
    for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "100.128.0.1", "2606:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808"]) assert.equal(isPrivateAddress(a), false, a);
  });

  console.log("\n— addresses refused before any request —");
  await check("schemes, embedded passwords, odd ports and local names are refused", () => {
    assert.equal(urlProblem("ftp://example.com/"), "scheme");
    assert.equal(urlProblem("file:///etc/passwd"), "scheme");
    assert.equal(urlProblem("javascript:alert(1)"), "scheme");
    assert.equal(urlProblem("https://user:pw@example.com/"), "credentials");
    assert.equal(urlProblem("https://example.com:8443/"), "port");
    assert.equal(urlProblem("http://example.com:6379/"), "port");
    for (const u of ["http://localhost/", "http://localhost./", "http://LOCALHOST/", "http://printer.local/", "http://db.internal/", "http://metadata.google.internal/", "http://app.localhost/"]) assert.equal(urlProblem(u), "local-name", u);
    for (const u of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://10.0.0.5/", "http://[::ffff:127.0.0.1]/"]) assert.equal(urlProblem(u), "private-address", u);
    assert.equal(urlProblem("not a url"), "not-a-url");
    assert.equal(urlProblem("https://example.com/page?x=1"), null);
    assert.equal(urlProblem("http://example.com:80/"), null);
  });

  // A real server on this machine, standing in for anything internal.
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><title>internal</title>secret</html>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  try {
    console.log("\n— nothing internal is ever reached —");
    await check("a server on this machine can't be read by address, by name, or through the website reader, probe or shop reader", async () => {
      for (const u of [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`]) {
        const r = await safeFetch(u);
        assert.equal(r.ok, false, u);
        if (!r.ok) assert.equal(r.reason, "blocked", u);
      }
      const page = await fetchPublicPage(`http://127.0.0.1:${port}/`);
      assert.equal(page.ok, false);
      const probe = await probeLandingPage(`http://localhost:${port}/`);
      assert.equal(probe.ok, false);
      if (!probe.ok) assert.equal(probe.reason, "blocked");
      const shop = await readShop(`http://127.0.0.1:${port}/`);
      assert.equal(shop.ok, false);
    });
    await check("the socket's own lookup refuses a name that resolves privately", async () => {
      const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup("localhost", { all: true }, (e) => resolve(e)));
      assert.ok(err);
      assert.equal(err?.code, "EPRIVATEADDRESS");
    });
    await check("an address that isn't a URL says so, plainly", async () => {
      const r = await safeFetch("my website");
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.reason, "invalid");
        assert.match(r.message, /isn't a web address/);
      }
    });
  } finally {
    server.close();
  }
  console.log(`\nSafe fetch: ${passed} checks passed. Nothing left this machine.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
