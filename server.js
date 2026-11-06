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
const readBody = req => new Promise(res => { let b = ""; req.on("data", c => b += c); req.on("end", () => { try { res(b ? JSON.parse(b) : {}); } catch { res({}); } }); });
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }

    // Airport / city search: every airport, with its country code (the page shows the full country name)
    if (req.method === "GET" && url.pathname === "/api/places") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return send(res, 200, { places: [] });
      const r = await duffel("/places/suggestions?query=" + encodeURIComponent(q));
      const j = await r.json();
      if (!r.ok) return send(res, 400, { error: "Place search failed." });
      const places = (j.data || []).map(p => p.type === "city"
        ? { city: p.name, cc: p.iata_country_code, code: p.iata_code, airports: (p.airports || []).map(a => ({ code: a.iata_code, name: a.name })) }
        : { city: p.city_name || p.name, cc: p.iata_country_code, code: p.iata_code, airports: [{ code: p.iata_code, name: p.name }] });
      return send(res, 200, { places });
    }

    // Search: one-way (1 slice), return (2 slices) or multi-city (2 to 5 slices)
    if (req.method === "POST" && url.pathname === "/api/search") {
      const { slices, adults, children, infants, cabin } = await readBody(req);
      if (!Array.isArray(slices) || !slices.length || slices.length > 5) return send(res, 400, { error: "Invalid flights." });
      const passengers = [
        ...Array.from({ length: adults || 1 }, () => ({ type: "adult" })),
        ...(children || []).map(age => ({ age })),                       // children are sent by age (2 to 11)
        ...Array.from({ length: infants || 0 }, () => ({ type: "infant_without_seat" })),
      ];
      const body = { data: {
        slices: slices.map(s => ({ origin: s.from, destination: s.to, departure_date: s.date })),
        passengers, cabin_class: cabin || "economy",
      } };
      const r = await duffel("/air/offer_requests?return_offers=true", { method: "POST", body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) return send(res, 400, { error: j.errors?.[0]?.message || "Search failed." });
      const offers = (j.data.offers || []).sort((a, b) => a.total_amount - b.total_amount).slice(0, 30);
      return send(res, 200, { offers });
    }

    if (req.method === "POST" && url.pathname === "/api/book") {
      // TODO (Phase 3): 1) re-fetch the offer to confirm its price, 2) authorize the customer's
      // card with your payment gateway, 3) create the Duffel order (POST /air/orders). Use the passenger
      // ids from the offer (offer.passengers) in the same order and type as the search. Each infant
      // needs infant_passenger_id set on the adult it travels with. 4) capture the payment only if the order
      // succeeds, 5) email the confirmation. Release the card hold if any step fails.
      return send(res, 501, { error: "Booking is not connected yet: payment gateway still to be added." });
    }

    send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Server error." });
  }
}).listen(PORT, () => console.log("Voyamare running on http://localhost:" + PORT));
