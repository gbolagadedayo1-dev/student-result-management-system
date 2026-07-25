import mysql from "mysql2/promise";
import { env } from "./env.js";

const poolOptions = {
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  decimalNumbers: true,
  timezone: "Z",
};

export const db = env.databaseUrl
  ? mysql.createPool(env.databaseUrl)
  : mysql.createPool({
      host: env.dbHost,
      port: env.dbPort,
      user: env.dbUser,
      password: env.dbPassword,
      database: env.dbName,
      ...poolOptions,
    });

export async function checkDatabase() {
  const connection = await db.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}