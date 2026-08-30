# S2 — Does inserting a row into SimpleSAMLphp's SQL metadata store register a functioning Service Provider?

**Answer:** **Yes** — with one significant caveat that changes a §9 claim rather than
the design.

Inserting a row into `saml20_sp_remote` registers a working SP that completes a full
SAML login on the **very next HTTP request**: no file writes, no reload, no restart,
no cache TTL. `INSERT`, `UPDATE` and `DELETE` all take effect immediately, a
read-only database user is sufficient for SimpleSAMLphp, per-app certificates and
signed AuthnRequests work from the row, and per-SP attribute naming works from the
row. **Manifest writes no PHP.** The caveat: **enforced attribute release is not
on by default and fails open**. SimpleSAMLphp treats the row's `attributes` list as
advisory unless `core:AttributeLimit` is added to `authproc`, and even then a row
with a missing or empty `attributes` key releases everything. §9's "An app cannot
receive an attribute it did not declare" is true only with a config change Manifest
must make and a registration-time validation Manifest must enforce.

| | |
|---|---|
| **Spike** | S2 |
| **Run by** | Claude Opus 5 (Claude Code), for Rich Tape |
| **Dates** | 2026-08-29 |
| **Timebox** | 2 days — **used: ~0.5 h wall clock** |
| **Branch** | `spike/S2` |
| **Verdict** | **Yes.** Proceed with the SQL metadata source. Do not write a PHP metadata source module. |

---

## Versions

Every finding below is a property of these exact versions.

| Component | Version / digest |
|---|---|
| macOS | 26.5.2 (build 25F84), arm64 |
| Docker Desktop | 4.87.0 |
| Docker Engine | 29.7.2 (client and server) |
| Docker Compose | v5.4.0 |
| **SimpleSAMLphp** | **2.4.9** (`Configuration::VERSION`); composer root reports `v2.4.9.3` |
| `simplesamlphp/saml2` | v5.0.8 (with `saml2-legacy` v4.19.3) |
| PHP | 8.1.34, base image `php:8.1-apache` |
| `pdo_pgsql` | linked against libpq 17.11 |
| Spike IdP image | `sha256:b8ff2810f26cee4051dcb27fd9a864d87fe45495b4016316e3e246341424ad11` |
| Postgres | `postgres:16-alpine`, server 16.13, `sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50` |
| `passport-ubcshib` | 0.1.6 (on `passport-saml` ^3.2.4) |
| Node (SP) | v24.12.0 |
| MongoDB (SP's store) | 7.0.28 |
| `docker-simple-saml` | commit `d6a093c`, worked on as a **copy**, never modified in place |

Ports used: IdP **7122**, Postgres **7103** — both per §21, both confirmed free.

---

## Evidence

### 1. `pdo_pgsql` builds into the image

The Dockerfile needed `libpq-dev` as well as the extension — the brief only
mentioned the extension.

```
$ docker exec s2-idp php -r 'print_r(PDO::getAvailableDrivers());'
Array
(
    [0] => sqlite
    [1] => mysql
    [2] => pgsql
)
```

**Verdict: pass.** Image builds clean, no other change needed.

### 2. What creates the schema — and its exact shape

It is a **CLI script shipped with SimpleSAMLphp**: `bin/initMDSPdo.php`, which calls
`MetaDataStorageHandlerPdo::initDatabase()`.

```
$ docker exec -e MANIFEST_DB_USER=manifest_cp -e MANIFEST_DB_PASS=cp_pw \
      s2-idp php /var/www/simplesamlphp/bin/initMDSPdo.php
Initializing Metadata Database...
Successfully initialized metadata database.
```

It creates **five** tables, not the eleven the shipped documentation
(`docs/simplesamlphp-metadata-pdostoragehandler.md`) claims:

```
 Schema |       Name        | Type  |    Owner
--------+-------------------+-------+-------------
 public | adfs_idp_hosted   | table | manifest_cp
 public | adfs_sp_remote    | table | manifest_cp
 public | saml20_idp_hosted | table | manifest_cp
 public | saml20_idp_remote | table | manifest_cp
 public | saml20_sp_remote  | table | manifest_cp
```

Every table has the same two columns. **This is the schema P2 writes against:**

```sql
CREATE TABLE public.saml20_sp_remote (
    entity_id   character varying(255) NOT NULL,
    entity_data text NOT NULL
);
ALTER TABLE ONLY public.saml20_sp_remote
    ADD CONSTRAINT saml20_sp_remote_pkey PRIMARY KEY (entity_id);
```

`entity_data` is **the JSON encoding of exactly the PHP array that would have gone
into `saml20-sp-remote.php`**. Table names are the metadata set name with `-`
replaced by `_`, prefixed by `database.prefix`.

Note the **`VARCHAR(255)` limit on `entity_id`**. Manifest's derived entityID
(`https://manifest.ubc.ca/sp/{slug}/{env}`) is far short of that, so this is not a
constraint in practice — but it is a hard limit P2 should assert against.

**Verdict: pass.** The schema is discovered, not designed. `initMDSPdo.php` is
idempotent (`CREATE TABLE IF NOT EXISTS`), so it is safe in `make seed`.

### 3. The config that works

Two things here are easy to get wrong and cost time if you do.

**(a) The `pdo` entry in `metadata.sources` carries no connection details.**
`MetaDataStorageHandlerPdo::__construct()` ignores its `$config` argument entirely
(it is annotated `@scrutinizer ignore-unused`) and calls
`\SimpleSAML\Database::getInstance()`. The connection comes from the **global
`database.*` block**:

```php
'metadata.sources' => array(
    array( 'type' => 'flatfile' ),
    array( 'type' => 'flatfile', 'directory' => 'config' ),
    array( 'type' => 'pdo' ),          // no dsn here — it would be ignored
),

'database.dsn'        => 'pgsql:host=postgres;port=5432;dbname=manifest_idp',
'database.username'   => 'ssp_ro',
'database.password'   => '…',
'database.prefix'     => '',
'database.persistent' => false,
```

**(b) `database.*` and `store.sql.*` are different subsystems with different
credentials.** `store.sql.dsn` (line 66 of the original config) is the **session and
data store**; `SQLStore` reads `store.sql.username` / `store.sql.password`, never
`database.username`. The brief warned about this and the warning is correct: they
never touch each other. Consequence for §21 below.

**Verdict: pass.**

### 4. The negative control — no row, no SP

Before inserting anything, a login attempt for the Manifest-derived entityID:

```
[1 GET /login] 500
    302 -> http://localhost:7122/simplesaml/saml2/idp/SSOService.php?SAMLRequest=…
<h2>Metadata not found</h2>
Unable to locate metadata for https://manifest.test/sp/spike-demo/sandbox
```

**Verdict: pass.** The IdP fails closed for an unregistered entityID. This matters:
it means the later success is attributable to the row and nothing else.

### 5. One `INSERT` registers a working SP — no restart

Row inserted by the **control-plane** user (`manifest_cp`), entityID shaped per D15:

```sql
INSERT INTO saml20_sp_remote (entity_id, entity_data) VALUES (
  'https://manifest.test/sp/spike-demo/sandbox',
  '{"AssertionConsumerService":[{"index":0,
      "Binding":"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
      "Location":"http://localhost:5001/auth/saml/callback"}],
    "SingleLogoutService":[{"Binding":"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
      "Location":"http://localhost:5001/auth/logout"}],
    "NameIDFormat":"urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
    "simplesaml.attributes":true,
    "attributes":["ubcEduCwlPuid","mail","eduPersonAffiliation"],
    "saml20.sign.assertion":true,"saml20.sign.response":true,
    "validate.authnrequest":false,"validate.logout":false}'
);
```

The **next** login, with no restart, produced a signed assertion and reached the
app's dashboard. Key fragments of the assertion:

```xml
<saml:Subject>
  <saml:NameID SPNameQualifier="https://manifest.test/sp/spike-demo/sandbox"
               Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">_19d5b30a…</saml:NameID>
  <saml:SubjectConfirmationData NotOnOrAfter="2026-08-30T06:17:13Z"
       Recipient="http://localhost:5001/auth/saml/callback" InResponseTo="_67531fc4…"/>
</saml:Subject>
<saml:Conditions NotBefore="…" NotOnOrAfter="…">
  <saml:AudienceRestriction>
    <saml:Audience>https://manifest.test/sp/spike-demo/sandbox</saml:Audience>
```

and the app's own view of the session:

```json
{"user":{"displayName":"Bianca Professor","email":"bio_prof@ubc.ca",
         "ubcEduCwlPuid":"23456789"},"role":"Faculty", …}
```

Throughout the entire spike — every INSERT, UPDATE and DELETE below included:

```
$ docker inspect -f 'StartedAt {{.State.StartedAt}} / RestartCount {{.RestartCount}}' s2-idp
StartedAt 2026-08-30T06:08:09.917182342Z / RestartCount 0
```

**Verdict: pass.** This is the spike's central claim, and it holds.

### 6. No cache, no TTL — propagation is bounded by the next request

`MetaDataStorageHandlerPdo::$cachedMetadata` is a **plain instance property**, so it
lives for one PHP request and dies. Every lookup is a fresh query. With
`log_statement='all'`:

```
LOG:  execute pdo_stmt_00000002: SELECT entity_id, entity_data FROM saml20_sp_remote WHERE entity_id = $1
LOG:  execute pdo_stmt_00000002: SELECT entity_id, entity_data FROM saml20_sp_remote WHERE entity_id = $1
```

Measured: a freshly inserted row was visible **106 ms** after the `INSERT`, that
figure being one PHP process start, not a cache expiry. `DELETE` was equally
immediate — the next login returned "Unable to locate metadata".

**Verdict: pass.** There is no TTL to design around. The flip side: **every SP
lookup is a synchronous database round-trip**, so the IdP hard-depends on Postgres
being up. Worth a `make doctor` check and a health-check ordering constraint in P1.

### 7. A read-only database user is sufficient

SimpleSAMLphp ran the whole spike as `ssp_ro`, holding `CONNECT`, `USAGE ON SCHEMA
public` and `SELECT` — nothing else.

```
LOG:  connection authorized: user=ssp_ro database=manifest_idp
LOG:  connection authorized: user=ssp_ro database=manifest_idp

$ psql -U ssp_ro -c "INSERT INTO saml20_sp_remote VALUES ('x','{}');"
ERROR:  permission denied for table saml20_sp_remote
$ psql -U ssp_ro -c "SELECT entity_id FROM saml20_sp_remote;"
 https://manifest.test/sp/spike-demo/sandbox
```

**Verdict: pass.** §9's "The SimpleSAMLphp database user is read-only" holds
**for the metadata source**. See *Spec actions* — it does not hold for the session
store, which is a different subsystem and does write.

### 8. Per-app keypair and signed AuthnRequests work from the row

An RSA-4096 keypair was minted for the app, its certificate placed in the row as
`certData`, and `validate.authnrequest` / `validate.logout` set to `true`. The SP
then signed its AuthnRequest (HTTP-Redirect binding, `SigAlg` + `Signature`):

```
query params: ['SAMLRequest', 'SigAlg', 'Signature']
<samlp:AuthnRequest … Destination="http://localhost:7122/simplesaml/saml2/idp/SSOService.php"
  AssertionConsumerServiceURL="http://localhost:5001/auth/saml/callback">
  <saml:Issuer>https://manifest.test/sp/spike-demo/sandbox</saml:Issuer>
```

Login succeeded. Two negative controls prove the validation is real, not nominal:

```
# SP stops signing, row still says validate.authnrequest = true
SimpleSAML\Error\Exception: Validation of received messages enabled,
                            but no signature found on message.

# SP signs with a key whose certificate is NOT in the row
<title>Invalid certificate signature</title>
Unable to validate certificate signature.
```

**Verdict: pass.** §9's "Both must be `true` in staging and production… requiring
signed AuthnRequests costs nothing" is confirmed, from a SQL row, with a per-app
keypair.

### 9. Attribute release — the caveat

**Out of the box it is not enforced.** With the row listing exactly three
attributes, the assertion carried **all thirteen** the auth source produced:

```
uid, cwlLoginName, cwlLoginKey, ubcEduCwlPuid, eduPersonAffiliation, mail,
eduPersonPrincipalName, eduPersonEntitlement, employeeNumber, givenName, sn,
eduPersonTargetedId, isMemberOf
```

The cause is in `core:AttributeLimit`: the `attributes` key in SP metadata is only
consulted **by that filter**, and the filter is not in the default `authproc` chain.
Adding it fixes the problem completely:

```php
'authproc.idp' => array(
    50 => array( 'class' => 'core:AttributeLimit' ),
),
```

Re-running the same login, again with no restart:

```
saml:Attribute Name="eduPersonAffiliation"
saml:Attribute Name="mail"
saml:Attribute Name="ubcEduCwlPuid"
```

and the app correctly lost the ability to render a display name, because
`givenName` and `sn` were withheld:

```json
{"user":{"displayName":"undefined undefined", …},
 "attributes":{"ubcEduCwlPuid":"23456789","eduPersonAffiliation":"faculty","mail":"bio_prof@ubc.ca"}}
```

**Verdict: pass, conditional on a config change Manifest must make.**

### 10. Per-SP attribute *naming* — the opportunity, taken

`attributes.NameFormat` is read from **SP metadata first**, falling back to the IdP
(`modules/saml/src/IdP/SAML2.php:1089–1103`), and `authproc` in SP metadata is
merged into the processing chain (`Auth/ProcessingChain.php:86`). So both halves of
the URN question are settable **per SP, from the row**.

Row fields added — nothing outside the row changed:

```json
"attributes.NameFormat": "urn:oasis:names:tc:SAML:2.0:attrname-format:uri",
"authproc": {"60": {"class": "core:AttributeMap", "0": "name2oid",
                    "ubcEduCwlPuid": "urn:oid:1.3.6.1.4.1.60.6.1.6"}}
```

Result, on the next request:

```
<saml:Attribute Name="urn:oid:1.3.6.1.4.1.60.6.1.6"       NameFormat="…attrname-format:uri"
<saml:Attribute Name="urn:oid:1.3.6.1.4.1.5923.1.1.1.1"   NameFormat="…attrname-format:uri"
<saml:Attribute Name="urn:oid:0.9.2342.19200300.100.1.3"  NameFormat="…attrname-format:uri"
<saml:Attribute Name="urn:oid:2.5.4.42"                   NameFormat="…attrname-format:uri"
<saml:Attribute Name="urn:oid:2.5.4.4"                    NameFormat="…attrname-format:uri"
```

Note `ubcEduCwlPuid` is **not in any attribute map SimpleSAMLphp ships**
(`grep -r ubcEdu attributemap/` returns nothing), so Manifest must supply its OID
inline — as above — or ship its own map file.

`AttributeLimit` runs at 50 on friendly names, `AttributeMap` at 60 converts them,
so the row's `attributes` list stays in the friendly vocabulary `auth.attributes`
uses. That ordering is load-bearing; reverse it and the limit matches nothing.

**Verdict: pass. The opportunity is real and cheap — take it.** See the next section
for the condition attached.

### 11. `passport-ubcshib` 0.1.6 does **not** cope with URN naming unaided

This is the condition. With OID-named attributes and the example app's default
configuration, login **fails**:

```
Error: Missing ubcEduCwlPuid attribute
RAW PROFILE KEYS: [… "urn:oid:1.3.6.1.4.1.60.6.1.6", "urn:oid:1.3.6.1.4.1.5923.1.1.1.1", …]
```

`index.js:196` only runs `mapAttributes` when `options.attributeConfig` is
**non-empty**; the example app passes nothing, so the OID keys reach the app raw.
Supplying it fixes the OID case completely:

```
MAPPED ATTRIBUTES: {"ubcEduCwlPuid":"23456789","mail":"bio_prof@ubc.ca",
                    "eduPersonAffiliation":"faculty","givenName":"Bianca","sn":"Professor"}
```

**But two gaps remain, and one is a bug in the library.**

- **MACE format does not work at all for `ubcEduCwlPuid`.** `ATTRIBUTE_MAPPINGS`
  contains both `urn:mace:dir:attribute-def:ubcEduCwlPuid` and
  `urn:oid:1.3.6.1.4.1.60.6.1.6` mapping to the same friendly name, with a comment
  saying "UBC IdP may return either format". `mapAttributes` builds a **reverse**
  map, friendly → OID, so the second entry overwrites the first and the MACE key
  becomes unreachable:

  ```
  reverse map ubcEduCwlPuid -> urn:oid:1.3.6.1.4.1.60.6.1.6
  ```

  Tested against a MACE-named assertion: `Error: Missing ubcEduCwlPuid attribute`.

- **The map covers six friendly names only:** `displayName`,
  `eduPersonAffiliation`, `givenName`, `mail`, `sn`, `ubcEduCwlPuid`. An app
  requesting `eduPersonPrincipalName` gets `urn:oid:1.3.6.1.4.1.5923.1.1.1.6` and
  cannot read it. Confirmed empirically.

This is exactly the gap §9 says `tlef-starter`'s `saml-attributes.ts` exists to
bridge, now measured rather than asserted.

**Verdict: pass with a condition.** Adopt URN naming **and** make the blueprint
pass `attributeConfig` and carry a complete map. Choose **OID** rather than MACE for
`ubcEduCwlPuid`, which sidesteps the library bug without patching it.

**Corroborated after the spike, from the existing consumers.** Two independent
pieces of evidence say the bug is **latent rather than active**:

1. `tlef-starter/server/src/components/auth/saml-attributes.ts` documents the
   *identical* reverse-map collision, found in practice by whoever wrote it — "the
   second (the OID) overwrites the first (MACE), so a MACE-named PUID matches
   nothing and is silently discarded." It also names a **second gap that is
   arguably worse**: `uid` and `eduPersonPrincipalName` have **no OID entries at
   all**, so they survive only when the IdP sends friendly names.
2. Of the seven `passport-ubcshib` consumers, **exactly one is evidence about real
   Shibboleth**: `tlef-biocbot` passes
   `attributeConfig: ['ubcEduCwlPuid', 'mail', 'eduPersonAffiliation']` and has no
   bridge of its own. **Rich confirms it works against UBC Shibboleth in both
   staging and production**, and the OID is its only reachable key for
   `ubcEduCwlPuid` — therefore **UBC sends OID**. This is now confirmed, not
   inferred. The four apps on `SAML_ENVIRONMENT=LOCAL` prove nothing —
   `docker-simple-saml` sends friendly names, which take the library's fallback
   path, not the OID path — and `tlef-starter`/`tlef-financebot` carry the bridge,
   so they work either way.

**Consequence: the library needs no fix for Manifest to work.** `tlef-starter` is
the first blueprint and already carries a bridge handling both formats, so Manifest
inherits a correct one. Under C6 a library change must never be a prerequisite
anyway. A fix would benefit the *other* consumers, is purely additive (a discarded
attribute starts resolving; nothing working stops), and should ship as **0.2.0** so
the `^0.1.6` ranges mean each app adopts deliberately rather than silently.

### 12. Malformed and partial rows — fails closed structurally, **fails open on attributes**

Each case is one `UPDATE` to the row followed by one login attempt.

| Row defect | Outcome | Attributes released |
|---|---|---|
| complete row (baseline) | **login OK** | 3 — as listed |
| invalid JSON | **refused**, `UNHANDLEDEXCEPTION` | 0 |
| `{}` | **refused**, `UNHANDLEDEXCEPTION` | 0 |
| missing `AssertionConsumerService` | **refused**, `UNHANDLEDEXCEPTION` | 0 |
| ACS present, `Location: null` | **refused**, `UNHANDLEDEXCEPTION` | 0 |
| missing `certData` while `validate.authnrequest: true` | **refused**, `UNHANDLEDEXCEPTION` | 0 |
| **missing `attributes` key** | **login OK** | **10** — falls back to the IdP-hosted list |
| **empty `attributes` list** | **login OK** | **13 — everything** |

The two fail-open rows are the finding. `AttributeLimit::process()` returns early
with the comment `// No limit on attributes` whenever the resolved allow-list is
empty, and `getSPIdPAllowed()` falls back to `$state['Source']['attributes']` — the
IdP's own list — when the SP row has no `attributes` key.

**Verdict: pass on structure, fail on attributes.** Everything that makes an SP
*addressable* is validated by SimpleSAMLphp and fails closed. The one field that
governs *what personal information leaves the IdP* is the one field whose absence is
silently permissive. Manifest must reject a row without a non-empty `attributes`
list before writing it, and P2 should carry a `CHECK` constraint or a NOT-NULL
generated column so a half-written row cannot exist.

### 13. Flatfile and PDO coexist — but **the first source wins**

Both source types active simultaneously, 16 SPs visible (15 flatfile + 1 row):

```
sources configured: 3
saml20-sp-remote entities visible: 16
  https://manifest.test/sp/spike-demo/sandbox     <- the PDO row
  https://tlef-biocbot … http://localhost:3000/saml/metadata   <- flatfile
```

With `flatfile` listed **before** `pdo` and the same entityID defined in both, the
**flatfile entry wins**:

```
lookup 'http://localhost:6118' -> ACS http://localhost:6118/auth/ubcshib/callback
   attributes: ["uid","eduPersonAffiliation","eduPersonPrincipalName","givenName","sn"]
                                  (the PDO row said http://PDO-ROW-WINS/acs)
```

**Verdict: pass, with a deployment rule.** A stale `saml20-sp-remote.php` silently
shadows a control-plane-written row, and nothing reports it. Manifest's IdP instance
must either list `pdo` **first** or — better — ship **no** `saml20-sp-remote.php`
at all, so there is exactly one place an SP can be defined.

---

## Sub-question answers

| Sub-question | Answer | Evidence | Consequence |
|---|---|---|---|
| Does a newly inserted row take effect **without a restart or reload**, and is there a metadata cache TTL? | **Yes; no TTL.** Visible on the next request, ~106 ms. `INSERT`/`UPDATE`/`DELETE` all immediate. `RestartCount 0` throughout. | §Evidence 5, 6 | §9's "no file writes, no container reload, no restart" **stands unchanged**. New: the IdP hard-depends on Postgres for every SP lookup — add to `make doctor` and to P1's health-check ordering. |
| Can `attributes` be scoped **per SP** from the row, and is release actually *enforced*? | **Per-SP: yes. Enforced: only after adding `core:AttributeLimit`, and it fails open on an empty/missing list.** | §Evidence 9, 12 | §9's "An app cannot receive an attribute it did not declare" **needs qualifying**. Two concrete requirements fall out — see *Spec actions*. |
| Do `validate.authnrequest => true` and `validate.logout => true` work from a SQL row, given a per-app keypair? | **Yes**, and provably — unsigned requests and wrong-key signatures are both rejected. | §Evidence 8 | §9 **stands unchanged**. |
| Is a **read-only** database user sufficient for SimpleSAMLphp's own operation? | **Yes for the metadata source.** `SELECT` + `CONNECT` + schema `USAGE` only. | §Evidence 7 | §9 stands, but must say *metadata* user: the session store (`store.sql.*`) is a separate subsystem with separate credentials and **does** write. |
| Can an SP's public certificate be carried in the row, so per-app keypairs work? | **Yes**, as `certData` (base64 body, no PEM armour). | §Evidence 8 | §9's per-app keypairs **stand unchanged**. Rotation is one `UPDATE`. |
| What happens on a **malformed or partial** row — fail closed, or a broken SP? | **Structurally: fails closed.** Bad JSON, missing/`null` ACS, missing `certData` under `validate.authnrequest` all refuse to issue an assertion. **On attributes: fails open.** | §Evidence 12 | Registration hardening needs a validation step Manifest owns, plus a database constraint. |
| *(the opportunity)* Can `NameFormat` be URN, and set **per SP** from a row? | **Yes**, via `attributes.NameFormat` plus a per-SP `authproc` `core:AttributeMap`, both in the row. `ubcEduCwlPuid` needs an inline OID — SSP ships no UBC map. | §Evidence 10 | Take it. Sandbox and staging then exercise production's attribute naming. |
| *(the opportunity)* Does `passport-ubcshib`'s `LOCAL` preset cope with URN attributes? | **Not unaided.** Needs `attributeConfig`; then OID works, **MACE for `ubcEduCwlPuid` still fails** (library bug), and only six friendly names are mapped at all. | §Evidence 11 | The blueprint must pass `attributeConfig` and carry a complete map. Prefer **OID** over MACE. Does **not** retire D21. |

---

## What survives

All four artefacts are reproduced verbatim below, because the branch is thrown away.

- **The metadata schema as SQL** → §Evidence 2 above; also the `initMDSPdo.php`
  route, which means P2 can *run* the initialiser in `make seed` rather than
  maintaining its own DDL. Recommended: run the initialiser, then add Manifest's own
  constraints on top.

- **The `pdo_pgsql` image change** → against `docker-simple-saml` @ `d6a093c`:

  ```diff
  --- a/Dockerfile
  +++ b/Dockerfile
   @@ -9,8 +9,9 @@
        wget \
        openssl \
        libsqlite3-dev \
  +     libpq-dev \
        && docker-php-ext-install xml \
  -     && docker-php-ext-install mysqli pdo pdo_mysql pdo_sqlite \
  +     && docker-php-ext-install mysqli pdo pdo_mysql pdo_sqlite pdo_pgsql \
        && a2enmod ssl rewrite
  ```

  `libpq-dev` is required and is **not** mentioned in the brief.

- **The config change** (the parts that are findings, not spike scaffolding):

  ```php
  'metadata.sources' => array(
      array( 'type' => 'flatfile' ),                 // see Evidence 13 — order matters
      array( 'type' => 'flatfile', 'directory' => 'config' ),
      array( 'type' => 'pdo' ),
  ),

  // \SimpleSAML\Database — what the pdo metadata source actually uses.
  // Distinct from store.sql.*, which is the SESSION and DATA store.
  'database.dsn'        => 'pgsql:host=postgres;port=5432;dbname=manifest_idp',
  'database.username'   => 'ssp_ro',      // read-only, per §9
  'database.password'   => '…',
  'database.prefix'     => '',
  'database.persistent' => false,

  // Without this the row's 'attributes' list is ADVISORY ONLY.
  'authproc.idp' => array(
      50 => array( 'class' => 'core:AttributeLimit' ),
  ),
  ```

- **One worked registration, as a fixture for P4.** This row produced a complete
  login with enforced attribute release, a per-app keypair, signed AuthnRequests and
  UBC-style OID attribute naming:

  ```json
  {
    "AssertionConsumerService": [
      {"index": 0,
       "Binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
       "Location": "http://localhost:5001/auth/saml/callback"}],
    "SingleLogoutService": [
      {"Binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
       "Location": "http://localhost:5001/auth/logout"}],
    "NameIDFormat": "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
    "simplesaml.attributes": true,
    "attributes": ["ubcEduCwlPuid", "mail", "eduPersonAffiliation", "givenName", "sn"],
    "attributes.NameFormat": "urn:oasis:names:tc:SAML:2.0:attrname-format:uri",
    "authproc": {"60": {"class": "core:AttributeMap", "0": "name2oid",
                        "ubcEduCwlPuid": "urn:oid:1.3.6.1.4.1.60.6.1.6"}},
    "saml20.sign.assertion": true,
    "saml20.sign.response": true,
    "validate.authnrequest": true,
    "validate.logout": true,
    "certData": "<base64 body of the per-app certificate, no PEM armour>"
  }
  ```

  Written with `entity_id = 'https://manifest.test/sp/spike-demo/sandbox'`.

- **The `NameFormat` decision** → adopt URN/OID naming, per SP, from the row
  (§Evidence 10), **conditional** on the blueprint passing `attributeConfig` and
  carrying a complete attribute map (§Evidence 11). Prefer OID over MACE for
  `ubcEduCwlPuid`.

- **§9 sentences needing revision** → *Spec actions*, below.

---

## What did not work

- **Nothing was abandoned.** The hypothesis held on the first attempt and the spike
  finished well inside its timebox. What follows are the traps that cost time or
  would have.

- **Two false starts worth recording, both trivial but both time-wasting:**
  `docker-php-ext-install pdo_pgsql` fails without `libpq-dev`; and the example SP
  resolves `SAML_CERT_PATH` relative to `src/config/`, not to the project root.

- **The route not taken:** I did not test the row against `saml20-idp-remote` or the
  ADFS sets. Manifest only writes SPs, so this is out of scope, but note the same
  table shape and the same handler serve all five sets if that ever changes.

- **`entity_data` is `TEXT`, not `jsonb`.** The handler builds the DDL itself and
  hard-codes `TEXT` (`MEDIUMTEXT` on MySQL). Manifest cannot query inside the JSON
  server-side without a cast, and cannot add a `jsonb` `CHECK` constraint without
  one either. This is a constraint on P2's validation design, not a blocker — a
  `CHECK (entity_data::jsonb ? 'attributes')` works, at the cost of a cast per write.

---

## Spec actions

Do not edit the spec; these are for the human's decision.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §9, *Enforced attribute release* | "Attribute release is enforced **at the IdP**, populated from `auth.attributes`. An app cannot receive an attribute it did not declare." | "Attribute release is enforced at the IdP by `core:AttributeLimit`, populated from `auth.attributes`. **The filter is not enabled by default and is silently permissive when the list is absent or empty**, so Manifest's IdP configuration must enable it, and registration must reject a row whose `attributes` list is missing or empty." | The claim is achievable but not free, and its failure mode is silent over-release of personal information — the opposite of what the sentence promises. Evidence 9 and 12. |
| §9, *Registration hardening* | "The SimpleSAMLphp database user is read-only." | "The SimpleSAMLphp **metadata** database user is read-only. SimpleSAMLphp's session and data store is a separate subsystem (`store.sql.*`) with its own credentials, and it writes." | True as written only for the metadata source. Someone reading it as "SimpleSAMLphp never writes to Postgres" would mis-provision §21's shared server. Evidence 3, 7. |
| §9, *Registration hardening* | *(add a bullet)* | "**The deployed IdP ships no `saml20-sp-remote.php`.** A flatfile entry for the same entityID shadows the SQL row silently, because the first matching `metadata.sources` entry wins." | Evidence 13. This is a live footgun: `docker-simple-saml`'s current file defines 15 SPs, and Manifest inherits that file unless the packaging removes it. |
| §9, *Risk* | "SimpleSAMLphp's SQL metadata source is an **unverified property of third-party software**…" | Replace with the S2 verdict: verified against 2.4.9; Manifest writes no PHP; the residual risk is a SimpleSAMLphp major upgrade changing `MetaDataStorageHandlerPdo` or the `authproc` contract. | The unknown is now known. The brief already anticipated softening this paragraph; it can be closed out rather than softened. |
| §19, status line for this item | *(status: unverified)* | Mark verified, dated 2026-08-29, against SimpleSAMLphp 2.4.9. | Same. |
| §9, *Local behaviour* | "`docker-simple-saml` releases friendly attribute names (`saml20-idp-hosted.php` sets `attributes.NameFormat => basic`), while real UBC Shibboleth sends OID and MACE URNs." | Add: "Manifest's own IdP instance sets URN/OID naming **per SP from the metadata row**, so sandbox and staging exercise production's attribute vocabulary. The blueprint must pass `attributeConfig` to `passport-ubcshib` and carry a complete attribute map; the library's own map covers six names and its MACE entry for `ubcEduCwlPuid` is unreachable." | Evidence 10, 11. Turns a stated divergence into a closed one, and names the precise remaining gap. |
| §7, *Validation* | "Note `uid` is **not** a UBC attribute…" | No change — but record that the IdP's inherited default *does* release `uid`, and that Manifest's per-SP list is what prevents it. Confirmed: with a Manifest-written row, `uid` is not released. | The spec is right; the evidence now backs it. Evidence 9. |
| §21, *Platform inventory* | "Postgres 7103 — **One server, three databases**: control plane, LiteLLM, IdP metadata" | Add: "SimpleSAMLphp needs **two roles** on the IdP metadata database — a read-only one for the metadata source and, if its session store is moved off SQLite, a writing one for `store.sql.*`. Keeping the session store on SQLite inside the container avoids the second role." | This is the finding S7 asked S2 to hand back. Evidence 3, 7. |

---

## Open questions

- ~~Which attribute name format does real UBC Shibboleth send?~~ **Closed: OID.**
  `tlef-biocbot` works against UBC Shibboleth in staging and production with no
  bridge, and the OID is its only reachable key for `ubcEduCwlPuid`. Configure OID.

- **Should `passport-ubcshib` be fixed upstream?** **Not needed for Manifest** —
  `tlef-starter`, the first blueprint, already bridges both formats, and C6 forbids
  a library change being a prerequisite. It remains worth doing *for the other
  consumers*, especially the missing `uid` and `eduPersonPrincipalName` OID entries,
  which bite any app that requests them against real Shibboleth. **A decision, not a
  spike**, and no longer on the critical path. Ship as 0.2.0 so adoption is
  deliberate; the library is live in several running apps.

- **Where does registration-time validation live?** Rejecting an empty `attributes`
  list is a control-plane concern (§7 validation), a database constraint, or both.
  **A P2/P4 design decision**, informed by Evidence 12.

- **What happens on a SimpleSAMLphp major upgrade?** `MetaDataStorageHandlerPdo` is
  not a documented stable API and its shipped documentation is already stale by six
  tables. **Nothing now** — but P2 should own a fixture test that a known-good row
  still produces a known-good assertion, so an upgrade fails in CI rather than in
  staging.

- **`entity_data` is `TEXT`.** Whether P2 accepts that and validates in the control
  plane, or adds a cast-based `CHECK`, is a **decision** for P2.

---

## Manual steps that could not be automated

Every one of these is automatable; none was blocked. Listed as the input to
`make seed` and `make doctor`.

- **`php bin/initMDSPdo.php` must run once, as a role with `CREATE` on the schema** —
  not as the read-only role SimpleSAMLphp then runs as. Two identities in `make seed`.
  It is idempotent, so re-running is safe.
- **The read-only grant must be re-applied for tables created later.** Handled here
  with `ALTER DEFAULT PRIVILEGES FOR ROLE manifest_cp IN SCHEMA public GRANT SELECT
  ON TABLES TO ssp_ro`, which is the automation, not a manual step — but it is easy
  to omit and the failure is a runtime "permission denied" long after seeding.
- **Removing `saml20-sp-remote.php` from Manifest's IdP image** is a packaging step
  someone must remember (Evidence 13). Better: assert its absence in `make doctor`.
- **Port 6122 is occupied** by the standalone `docker-simple-saml`, as the brief
  said. 7122 and 7103 were free and were used. `make doctor` should check both.
- **Nothing required `sudo`.** The whole spike ran unprivileged.

---

## Notes for whoever runs the next spike

- **Ports 80 and 443 are in use on this machine by `nginx` on `127.0.0.1`** —
  confirmed, and relevant to S7 rather than S2.
- **The IdP's `Issuer` is wrong on a non-default port.** Running on 7122, assertions
  were still issued with
  `<saml:Issuer>http://localhost:6122/simplesaml/saml2/idp/metadata.php</saml:Issuer>`,
  because `saml20-idp-hosted.php` keys that entry on `'host' => 'localhost'` and
  hard-codes the port in the entityID. Harmless here — the SP trusts the certificate,
  not the issuer string — but Manifest's IdP entityID must be set deliberately, and
  a mismatch will break any SP that pins `idp.entityID`. Not chased further; out of
  S2's scope, but P4 will trip over it.
- **Everything ran against a copy.** `/Users/rich/Developer/docker-simple-saml` was
  not modified; its working tree is as it was, on `main` at `d6a093c`.
