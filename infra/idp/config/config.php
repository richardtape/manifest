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
    'database.username' => 'manifest',
    'database.password' => getenv('POSTGRES_PASSWORD'),

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
