<?php
// BUILD ON THE UPSTREAM TEMPLATE, DO NOT REPLACE IT.
//
// SimpleSAMLphp 2.x ships only `config.php.dist`; there is no `config.php` in
// the image at all. So bind-mounting a partial file at config.php does not
// "override some keys and inherit the rest" — it IS the whole configuration,
// and every key it omits is simply missing. The first casualty is `cachedir`,
// and the symptom is a 303 from `/` to /module.php/core/welcome that then
// returns 500 with `Missing cachedir parameter in config.php`. Measured
// 2026-09-05.
//
// The dist assigns $config and does not return it, so require it for effect and
// merge our deltas over the top. That keeps this file to just what P1 sets while
// still inheriting every upstream default, across SimpleSAMLphp upgrades.
require '/var/simplesamlphp/config/config.php.dist';

$config = array_merge($config, [
    // Caddy terminates TLS; without this SimpleSAMLphp builds `http://` URLs
    // into the SAML flow and the browser is redirected off the trusted origin.
    'baseurlpath' => 'https://idp.manifest.internal/',
    'trusted.url.domains' => ['idp.manifest.internal'],
    'technicalcontact_email' => 'noreply@manifest.internal',
    'secretsalt' => getenv('SSP_SECRET_SALT') ?: 'change-me-locally',
    'auth.adminpassword' => getenv('SSP_ADMIN_PASSWORD') ?: 'change-me-locally',

    // The GLOBAL connection block. The `pdo` entry in metadata.sources carries NO
    // connection details of its own — the handler ignores any it is given and
    // reads THIS (S2). Getting that backwards is a wasted afternoon.
    'database.dsn'      => 'pgsql:host=postgres;port=5432;dbname=manifest_idp',
    // §9: the metadata source's user is READ-ONLY. Note the scope — this is
    // `database.*`. `store.sql.*` below is a different subsystem with its own
    // credentials and it DOES write (S2); reading this as "SimpleSAMLphp never
    // writes to Postgres" would mis-provision §21's shared server.
    // SSP_DB_INIT is set by the entrypoint for ONE command and nothing else.
    // SimpleSAMLphp's own initialiser, bin/initMDSPdo.php, issues CREATE TABLE
    // through `database.*` — the same credentials the request path reads
    // metadata with — so a plain read-only role makes the container die at boot
    // with `permission denied for schema public` and restart-loop (measured
    // 2026-09-08). Scoping the write credential to the init step keeps §9's
    // "the metadata source's user is read-only" true of every request.
    //
    // Deliberately NOT `php_sapi_name() === 'cli'`: that would silently give
    // every CLI probe more privilege than the server has, which is the exact
    // shape — the test constructs it correctly and the running system derives
    // it differently — that has cost this project seven defects in one session.
    'database.username' => getenv('SSP_DB_INIT') ? 'manifest' : 'ssp_ro',
    'database.password' => getenv('SSP_DB_INIT')
        ? getenv('POSTGRES_PASSWORD')
        : (getenv('SSP_RO_PASSWORD') ?: 'change-me-locally'),

    // WITHOUT AN EXPLICIT CHAIN THE ORDERING IS INHERITED AND INVISIBLE. The
    // 2.4.x dist DOES ship `50 => core:AttributeLimit` (measured 2026-09-08 —
    // the plan's finding 2 assumed an empty chain and was wrong about that),
    // but it ships no name2oid map, so nothing converted friendly names to the
    // OIDs real UBC Shibboleth sends.
    //
    // THE PRIORITIES ARE LOAD-BEARING. AttributeLimit at 50 matches the
    // FRIENDLY vocabulary the auth source and a manifest.yaml's
    // `auth.attributes` both use; AttributeMap at 60 converts to OIDs
    // afterwards. Reverse them and the limit matches nothing and releases
    // everything — which looks identical to it working.
    'authproc.idp' => [
        50 => ['class' => 'core:AttributeLimit'],
        60 => ['class' => 'core:AttributeMap', 'name2oid', 'ubcoid'],
    ],

    // DIFFERENT SUBSYSTEM from database.* above: this is the session/data store.
    // Proving one works proves nothing about the other (S2).
    'store.type'    => 'sql',
    'store.sql.dsn' => 'pgsql:host=postgres;port=5432;dbname=manifest_idp',
    'store.sql.username' => 'manifest',
    'store.sql.password' => getenv('POSTGRES_PASSWORD'),

    // ORDER MATTERS. The FIRST matching entry wins, so a stale flatfile would
    // silently shadow a SQL row for the same entityID (S2). SQL goes first.
    'metadata.sources' => [
        ['type' => 'pdo'],
        ['type' => 'flatfile', 'directory' => '/var/simplesamlphp/metadata'],
    ],

    'enable.saml20-idp' => true,
]);
