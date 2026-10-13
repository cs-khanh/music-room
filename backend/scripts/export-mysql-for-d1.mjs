import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, "backend/.env"),
    resolve(cwd, ".env"),
    resolve(cwd, "../.env"),
    resolve(cwd, "../backend/.env"),
  ];
  for (const file of [...new Set(candidates)]) {
    try {
      const source = await readFile(file, "utf8");
      const line = source
        .split(/\r?\n/)
        .find((item) => /^\s*DATABASE_URL\s*=/.test(item));
      if (!line) continue;
      const raw = line.slice(line.indexOf("=") + 1).trim();
      process.env.DATABASE_URL = raw.replace(/^(["'])(.*)\1$/, "$2");
      return;
    } catch {
      /* Try the next conventional env-file location. */
    }
  }
}

await loadDatabaseUrl();
const prisma = new PrismaClient();
const outputPath = resolve(process.argv[2] ?? "d1/mysql-export.sql");

function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "bigint" || typeof value === "number")
    return String(value);
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

function insert(table, columns, row, overrides = {}) {
  const values = columns.map((column) =>
    literal(Object.hasOwn(overrides, column) ? overrides[column] : row[column]),
  );
  return `INSERT INTO ${table} (${columns.join(",")}) VALUES (${values.join(",")});`;
}

async function main() {
  const tables = [
    [
      "users",
      [
        "id",
        "email",
        "username",
        "password_hash",
        "avatar_url",
        "provider",
        "created_at",
        "updated_at",
      ],
    ],
    [
      "rooms",
      [
        "id",
        "code",
        "name",
        "owner_id",
        "is_private",
        "current_video_id",
        "current_queue_item_id",
        "current_time",
        "player_status",
        "started_at",
        "allow_member_add_song",
        "allow_member_remove_own_song",
        "created_at",
        "updated_at",
      ],
    ],
    [
      "room_members",
      [
        "id",
        "room_id",
        "user_id",
        "role",
        "is_online",
        "joined_at",
        "last_seen_at",
      ],
    ],
    [
      "room_queue",
      [
        "id",
        "room_id",
        "video_id",
        "title",
        "channel_title",
        "thumbnail_url",
        "duration_seconds",
        "added_by",
        "position",
        "status",
        "created_at",
        "updated_at",
      ],
    ],
    [
      "personal_history",
      [
        "id",
        "user_id",
        "video_id",
        "title",
        "channel_title",
        "thumbnail_url",
        "played_at",
      ],
    ],
    [
      "favorites",
      [
        "id",
        "user_id",
        "video_id",
        "title",
        "channel_title",
        "thumbnail_url",
        "created_at",
      ],
    ],
    [
      "youtube_video_cache",
      [
        "id",
        "video_id",
        "title",
        "channel_title",
        "thumbnail_url",
        "duration_seconds",
        "embeddable",
        "raw_json",
        "created_at",
        "updated_at",
      ],
    ],
    [
      "youtube_search_cache",
      [
        "id",
        "query_hash",
        "query_text",
        "result_json",
        "expires_at",
        "created_at",
      ],
    ],
  ];
  const data = new Map();
  for (const [table] of tables)
    data.set(
      table,
      await prisma.$queryRawUnsafe(`SELECT * FROM ${table} ORDER BY id`),
    );

  const statements = [
    "-- Generated from the configured MySQL DATABASE_URL. Import only into an empty D1 database.",
    "-- Review row counts before applying; this file contains user PII and password hashes.",
  ];
  for (const [table, columns] of tables) {
    for (const row of data.get(table)) {
      statements.push(
        table === "rooms"
          ? insert(table, columns, row, { current_queue_item_id: null })
          : insert(table, columns, row),
      );
    }
  }
  for (const room of data.get("rooms")) {
    if (room.current_queue_item_id !== null) {
      statements.push(
        `UPDATE rooms SET current_queue_item_id=${literal(room.current_queue_item_id)} WHERE id=${literal(room.id)};`,
      );
    }
  }
  await writeFile(outputPath, `${statements.join("\n")}\n`, { flag: "wx" });
  for (const [table] of tables)
    console.log(`${table}: ${data.get(table).length} rows`);
  console.log(`SQL export written to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
