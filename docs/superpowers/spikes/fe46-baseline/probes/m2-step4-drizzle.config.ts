// fe46 [M2] probe: no import, so it resolves from the scratch directory.
export default {
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.PROBE_URL },
}
