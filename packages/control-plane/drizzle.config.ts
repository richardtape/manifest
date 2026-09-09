import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // DDL, so the ADMIN url. The control plane's own MANIFEST_DATABASE_URL connects
  // as `manifest_app`, which owns nothing and cannot create a table — that is what
  // makes §20's grant on audit.events mean anything.
  dbCredentials: { url: process.env.MANIFEST_ADMIN_DATABASE_URL! },
})
