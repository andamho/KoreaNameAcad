import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import crypto from "crypto";
import * as schema from "@shared/schema";

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

// ⚠️ host·URL·credential 원문을 로그에 남기지 않는다(배포 로그 유출 방지). host 는 sha256 8자만.
const hostMask = (h: string) => "host#" + crypto.createHash("sha256").update(h.toLowerCase()).digest("hex").slice(0, 8) + "…";

console.log("🔍 NEON_DATABASE_URL exists?", !!process.env.NEON_DATABASE_URL);
console.log("🔍 DATABASE_URL exists?", !!process.env.DATABASE_URL);
console.log("🔍 Using:", process.env.NEON_DATABASE_URL ? "NEON_DATABASE_URL" : "DATABASE_URL");

if (!databaseUrl) {
  console.error("❌ No database URL environment variable is set");
} else {
  try {
    const dbUrl = new URL(databaseUrl);
    console.log("🔍 DB Host:", hostMask(dbUrl.host));  // 마스킹(원문 host 미출력)
    if (dbUrl.host === "helium" || dbUrl.hostname === "helium") {
      console.warn("⚠️ WARNING: Database URL points to 'helium' internal proxy. This may fail in production deployments.");
    } else if (dbUrl.host.includes("neon.tech")) {
      console.log("✅ Using Neon external database - production ready!");
    }
  } catch (e) {
    console.error("❌ Failed to parse database URL:", e);
  }
}

let db: ReturnType<typeof drizzle> | null = null;

try {
  if (databaseUrl) {
    console.log("🔗 Creating database pool with standard pg driver...");
    const pool = new Pool({ 
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 3,
    });
    db = drizzle(pool, { schema });
    console.log("✅ Database pool created successfully");
  } else {
    console.error("❌ Cannot create pool: No database URL available");
  }
} catch (error) {
  console.error("❌ Failed to initialize database pool:", error);
}

export { db };
