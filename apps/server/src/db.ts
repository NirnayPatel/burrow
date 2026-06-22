import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@burrow/core";

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://burrow:burrow@localhost:5433/burrow",
});

export const db = drizzle(pool, { schema });
