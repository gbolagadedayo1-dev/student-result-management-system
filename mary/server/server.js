import { app } from "./app.js";
import { checkDatabase, db } from "./config/database.js";
import { env } from "./config/env.js";

let server;
try {
  await checkDatabase();
  server = app.listen(env.port, () => console.log(`MaryResult API listening on port ${env.port}`));
} catch (error) {
  console.error("Unable to start MaryResult API", error);
  process.exit(1);
}

async function shutdown(signal) {
  console.log(`${signal} received, closing cleanly`);
  server?.close(async () => {
    await db.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));