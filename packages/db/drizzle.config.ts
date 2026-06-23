import { defineConfig } from "drizzle-kit";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  // drizzle-kit check validates migration/schema parity — no live DB needed.
  // dbCredentials.url is required by defineConfig but unused for check.
  dbCredentials: {
    url: `${__dirname}/drizzle/test.sqlite`,
  },
});