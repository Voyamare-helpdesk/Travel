// Voyamare backend
// Run: DUFFEL_TOKEN=duffel_test_xxx node server.js   (Node 18+, no packages needed)
// Open http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DUFFEL_TOKEN;
const PORT = process.env.PORT || 3000;
if (!TOKEN) { console.error("Set DUFFEL_TOKEN first (use a duffel_test_ token in the sandbox)."); process.exit(1); }

const duffel = (p, opts = {}) => fetch("https://api.duffel.com" + p, {
  ...opts,
  headers: { Authorization: "Bearer " + TOKEN, "Duffel-Version": "v2", "Content-Type": "application/json", Accept: "application/json" },
});

const readBody = req => new Promise(res => { let b = ""; req.on("data", c => b += c); req.on("end", () => res(b ? JSON.parse(b) : {})); });
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }

    if (req.method === "POST" && req.url === "/api/search") {
      const { from, to, departure, ret, adults, cabin } = await readBody(req);
      const slices = [{ origin: from, destination: to, departure_date: departure }];
      if (ret) slices.push({ origin: to, destination: from, departure_date: ret });
      const body = { data: { slices, passengers: Array.from({ length: adults || 1 }, () => ({ type: "adult" })), cabin_class: cabin || "economy" } };
      const r = await duffel("/air/offer_requests?return_offers=true", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) return send(res, 400, { error: j.errors?.[0]?.message || "Search failed." });
      const offers = (j.data.offers || []).sort((a, b) => a.total_amount - b.total_amount).slice(0, 30);
      return send(res, 200, { offers });
    }

    if (req.method === "POST" && req.url === "/api/book") {
      // TODO (Phase 3): 1) re-fetch the offer to confirm its price, 2) authorize the customer's
      // card with your payment gateway, 3) create the Duffel order (POST /air/orders) with
      // passenger ids from the offer, 4) capture the payment only if the order succeeds,
      // 5) email the confirmation. Release the card hold if any step fails.
      return send(res, 501, { error: "Booking is not connected yet: payment gateway still to be added." });
    }

    send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Server error." });
  }
}).listen(PORT, () => console.log("Running on http://localhost:" + PORT));
