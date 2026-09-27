import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * A person mints a delegated token for their agent — in their own session, for ONE project,
 * holding the build loop's capabilities and nothing more — and the agent uses it.
 */
export async function mintATokenForAnAgent(
  origin: string,
  session: string,
  projectId: string,
): Promise<{ tokenId: string; secret: string; projectSlug: string }> {
  const person = createManifestClient({ origin, session })
  const minted = unwrap(
    await person.POST('/v1/projects/{projectId}/tokens', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        name: 'claude-code',
        capabilities: [
          'project:read',
          'source:write',
          'secret:write',
          'build:create',
          'release:create',
          'release:deploy',
        ],
        expiresInDays: 7,
      },
    }),
    'mintToken',
  )
  // `secret` is the credential. Hand it to the agent now and keep it nowhere else; revoke the
  // token (`revokeToken`) the moment it is no longer needed.
  const agent = createManifestClient({ origin, token: minted.secret })
  const project = unwrap(
    await agent.GET('/v1/projects/{projectId}', { params: { path: { projectId } } }),
    'getProject',
  )
  return { tokenId: minted.token.id, secret: minted.secret, projectSlug: project.slug }
}
