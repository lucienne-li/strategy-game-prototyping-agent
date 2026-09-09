import { createWebProductServer } from "./web/server.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid integer port");

const server = createWebProductServer();
server.listen(port, "0.0.0.0", () => {
  console.log(`Strategy Game Agent Web MVP listening on http://localhost:${port}`);
  console.log(process.env.OPENAI_API_KEY ? "Live Model mode enabled" : "Demo Mode only (OPENAI_API_KEY is not configured)");
});
