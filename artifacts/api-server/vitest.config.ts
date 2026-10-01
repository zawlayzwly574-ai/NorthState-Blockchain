import { defineConfig } from "vitest/config";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
process.env.CORS_ALLOWED_ORIGINS = "https://member.example.test,https://admin.example.test";

export default defineConfig({});