import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_Tx3qKFVUSiE8@ep-royal-sunset-a10na1ix-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
});

await client.connect();

// 1. access_token 컬럼 확인 및 추가
const colCheck = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'inquiries' AND column_name = 'access_token'
`);
if (colCheck.rows.length === 0) {
  console.log("Adding access_token column to inquiries...");
  await client.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS access_token text UNIQUE`);
  console.log("Done.");
} else {
  console.log("access_token column already exists.");
}

// 2. inquiry_messages 테이블 확인 및 생성
const tableCheck = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'inquiry_messages'
`);
if (tableCheck.rows.length === 0) {
  console.log("Creating inquiry_messages table...");
  await client.query(`
    CREATE TABLE inquiry_messages (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      inquiry_id varchar NOT NULL,
      sender_type text NOT NULL,
      content text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);
  console.log("Done.");
} else {
  console.log("inquiry_messages table already exists.");
}

await client.end();
console.log("Migration complete.");
