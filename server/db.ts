import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

console.log("🔍 DATABASE_URL exists?", !!process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
}

let db: ReturnType<typeof drizzle> | null = null;

try {
  if (process.env.DATABASE_URL) {
    console.log("🔗 Creating database pool with standard pg driver...");
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    db = drizzle(pool, { schema });
    console.log("✅ Database pool created successfully");
  } else {
    console.error("❌ Cannot create pool: DATABASE_URL missing");
  }
} catch (error) {
  console.error("❌ Failed to initialize database pool:", error);
}

export { db };
