<?php
// THE HOSTED IdP ENTITY. Without this file SimpleSAMLphp has `enable.saml20-idp`
// set and no entity to be, and every metadata or SSO request returns 500:
//   "Could not find any default metadata entities in set [saml20-idp-hosted]"
// The image ships only `saml20-idp-hosted.php.dist`, so this was missing from
// P1's IdP entirely (measured 2026-09-07) while `make verify` stayed green.

$entityId = getenv('MANIFEST_IDP_ENTITY_ID') ?: 'https://idp.manifest.internal/idp/shibboleth';

$metadata[$entityId] = [
    // '__DEFAULT__', NOT a hostname. Keying on 'host' is what made the spike's
    // IdP issue assertions from `http://localhost:6122/...` while running on
    // 7122 (S2). The entityID above is configuration; nothing derives it from
    // the request, so the published port can move without breaking an SP that
    // pinned it.
    'host' => '__DEFAULT__',

    // Relative to /var/simplesamlphp/cert/, which the compose file mounts from
    // infra/idp/cert/. `ensure-idp-keypair.sh` mints them.
    'privatekey'  => 'server.pem',
    'certificate' => 'server.crt',

    'auth' => 'manifest-test-users',

    // D6: this IdP serves test users only and never authenticates a real person.
    'authproc' => [],
];
