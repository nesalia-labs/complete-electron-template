import { defineConfig } from "drizzle-kit";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: resolve(__dirname, "./drizzle"),
  dbCredentials: {
    url: resolve(__dirname, "../../apps/desktop/data/database.sqlite"),
  },
});