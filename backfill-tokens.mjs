import pg from "pg";
import crypto from "crypto";
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_Tx3qKFVUSiE8@ep-royal-sunset-a10na1ix-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

const { rows } = await client.query(
  "SELECT id FROM inquiries WHERE access_token IS NULL"
);

console.log(`토큰 없는 문의: ${rows.length}건`);

for (const row of rows) {
  const token = crypto.randomBytes(10).toString("hex");
  await client.query(
    "UPDATE inquiries SET access_token = $1 WHERE id = $2",
    [token, row.id]
  );
  console.log(`  ${row.id} → ${token}`);
}

await client.end();
console.log("완료");
