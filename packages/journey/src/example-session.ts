import { createManifestClient, unwrap } from '@manifest/contract'

/**
 * Who is signed in. A browser sends its session cookie itself; a client that is not a browser
 * passes the cookie's value, and the client adds the `Origin` header a session needs.
 */
export async function whoAmI(
  origin: string,
  session: string,
): Promise<{ name: string; role: string }> {
  const client = createManifestClient({ origin, session })
  const me = unwrap(await client.GET('/v1/me'), 'getMe')
  return { name: me.displayName, role: me.role }
}
