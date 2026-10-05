import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import { config } from "./config.ts";

/** The single database client shared by the whole API. */
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.databaseUrl, max: config.databasePoolMax, idleTimeoutMillis: 1000 }),
});
