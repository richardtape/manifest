# `ubc-clf-7` — the UBC Common Look and Feel, on Manifest's practice IdP

**What this is.** A SimpleSAMLphp 2.x theme module that makes the Manifest IdP's sign-in
pages look like UBC's Common Look and Feel (CLF 7) instead of SimpleSAMLphp's default red
one — so that a person integrating CWL into their own application can see what the real
thing *will* look like before they have real approvals.

**It is not real CWL, and it says so on every page.** `themes/ubc-clf-7/core/_layout.twig`
renders a red band above the UBC header on every page the theme touches. Rich's call,
2026-09-19: this gets deployed as a service for other teams, so the warning cannot live
only on the login form.

**The login heading reads `CWL Authentication`, not a warning.** The source's
`DEFINITELY NOT CWL Authentication` was removed on 2026-09-19, also Rich's call: with the
band saying it on every page, the page itself should look like the thing people came here
to preview. `.fake-cwl-make-red`, which styled that heading, went with it — no template
referenced it any more.

## Where it came from

Copied from `docker-simple-saml` (`modules/ubc-clf-7/`), which is **read-only** — this is a
copy, and that repository was not modified. Both IdPs run `simplesamlphp:^2.0`, so the Twig
API matches; Manifest's is v2.5.3.1.

**What was changed from that source, and why:**

1. **Asset URLs use SimpleSAMLphp's `asset()` helper.** The source hardcodes
   `/simplesaml/module.php/ubc-clf-7/assets/...`, which is right only where SimpleSAMLphp
   is served *under* `/simplesaml/`. The Manifest IdP serves at the root of
   `idp.manifest.internal`, so those URLs 404 and the page renders unstyled. `asset()`
   resolves the base path itself and is correct in both deployments.
2. **The warning band**, described above, and the `DEFINITELY NOT CWL Authentication`
   heading removed in its favour.
3. **An error message on a failed sign-in.** The source template had none, so a wrong
   password re-rendered the form saying nothing at all — measured 2026-09-19. This is
   SimpleSAMLphp's own `errorcode`/`errorcodes` reporting, in the CLF's alert markup.
4. **`core/welcome.twig` and `core/error.twig` are themed too.** `welcome` is where an
   IdP-initiated logout lands, and stock it advertises the SimpleSAMLphp documentation;
   it now says the person is signed out and what this service is. **`error.twig` is
   written but UNVERIFIED** — SimpleSAMLphp sends malformed state to a low-level
   "Unhandled exception" page outside the theme system, and the authproc failure codes
   this template handles need a deliberately failing auth source to reach.
5. **Six asset files were ADDED.** They are listed below, and the reason is in the next
   section.

`public/assets/clf.css` is **vendored UBC CLF 7 (Bootstrap 2.3.2)** and is kept
byte-identical to its source, so it can be re-synced with a plain copy. Manifest's own CSS
goes in `public/assets/style.css` instead.

## The six files the source was missing

`clf.css` references a font and three images that **were never copied into
docker-simple-saml's module** — so in that setup they 404 silently and the icons simply do
not render. They are fetched here once and committed, so the theme is complete *and* works
with the network off, which the rest of this platform requires.

Downloaded 2026-09-19 from `https://cdn.ubc.ca/clf/7.0.5/` — the version `www.ubc.ca`
itself was loading that day:

| File (under `public/`) | Size | SHA-256 |
|---|---|---|
| `font/font-v4/fontawesome-webfont-ubc-v4.eot` | 198528 bytes | `2973f7461d0b03c6981a1e39c6a41847e04ce3474b7325d1e7eea31ce9b75bb0` |
| `font/font-v4/fontawesome-webfont-ubc-v4.ttf` | 198428 bytes | `d39bef85a045ab4e5010a14c68522c0e5415fdf67b766d96a72db4791f29d7ef` |
| `font/font-v4/fontawesome-webfont-ubc-v4.woff` | 51704 bytes | `b2a89d8840890218d665cc947a655cc862bc7c702184ccf6ec07a52bfe728c24` |
| `img/glyphicons-halflings.png` | 12799 bytes | `d99e3fa32c641032f08149914b28c2dc6acf2ec62f70987f2259eabbfa7fc0de` |
| `img/glyphicons-halflings-white.png` | 8777 bytes | `f0e0d95a9c8abcdfabf46348e2d4285829bb0491f5f6af0e05af52bffb6324c4` |
| `img/ubc7-clf-sprite-white.png` | 18003 bytes | `9720f353cde3e96e77798ae42bf70606a51e4cb30f055a829c85759c1ad0f8c2` |

Each was checked to be what it claims — `file` reports EOT, TrueType and WOFF for the
three font files and three PNGs of sensible dimensions for the images — because a saved
404 page is a silent failure of exactly this kind.

**Licensing.** The FontAwesome webfont is **SIL Open Font License 1.1** (its own `name`
table says so). `clf.css` is Bootstrap 2.3.2, **Apache License 2.0**, per its own banner
comment. The CLF imagery is UBC's.

## How it is wired up

Nothing is baked into the image. The module is **bind-mounted read-only**, exactly as the
IdP's config, metadata and certificates already are (`infra/compose.yaml`), and
`infra/idp/config/config.php` sets `'theme.use' => 'ubc-clf-7:ubc-clf-7'`. So changing the
theme needs no image rebuild, no `composer`, and no network.
