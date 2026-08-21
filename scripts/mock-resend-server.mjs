import { createServer } from "node:http";

const messages = [];
const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("access-control-allow-origin", "*");
  if (request.method === "GET" && request.url === "/messages") {
    response.end(JSON.stringify({ messages }));
    return;
  }
  if (request.method === "DELETE" && request.url === "/messages") {
    messages.length = 0;
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method === "POST" && request.url === "/emails") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw || "{}");
    if ((payload.to ?? []).some((recipient) => String(recipient).includes("email-failure"))) {
      response.statusCode = 422;
      response.end(JSON.stringify({ message: "Forced E2E rejection" }));
      return;
    }
    const message = { id: `mock-${crypto.randomUUID()}`, receivedAt: new Date().toISOString(), ...payload };
    messages.push(message);
    response.statusCode = 200;
    response.end(JSON.stringify({ id: message.id }));
    return;
  }
  if (request.method === "POST" && request.url === "/v2/directions/driving-car/geojson") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const coordinates = JSON.parse(raw || "{}").coordinates ?? [[-17.427, 14.669], [-17.45, 14.72]];
    response.end(JSON.stringify({ features: [{ geometry: { type: "LineString", coordinates }, properties: { summary: { distance: 6400, duration: 1080 } } }] }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "NOT_FOUND" }));
});

server.listen(3110, "127.0.0.1");
