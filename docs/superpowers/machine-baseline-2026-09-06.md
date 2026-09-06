> **Pre-P3 snapshot, and the first COMPLETE one.** Taken 2026-09-06, before P3's
> Task 1, with the platform **up** (`make up`, builder profile down). It should
> differ from [`machine-baseline-2026-09-05.md`](machine-baseline-2026-09-05.md)
> only in uptimes and in the four sections that one never reached. It was taken
> **before** the pre-flight pulled `anchore/syft:v1.51.1` and
> `anchore/grype:v0.118.0`, so those two images are deliberately absent here — that
> is the state P3 starts from.
>
> **Read this before comparing against either earlier baseline.** Both of them are
> **truncated**, and neither says so. `scripts/snapshot-machine.sh` had a
> `\'` inside a single-quoted string on line 121 — which POSIX shells cannot escape —
> so `bash` 3.2 died at parse time and the script emitted **11 of its 15 sections**
> while exiting 2. The four it never reached were:
>
> - **Loopback alias `127.0.0.2`**
> - **Resolvers in `/etc/resolver`**
> - **Valet (must not be disturbed)**
> - **Repository**
>
> Which is to say: the document whose entire job is to prove the machine is
> unchanged was blind to **all three of P1's host changes** and to the Valet
> evidence. `machine-baseline-2026-09-05.md` even has the interpreter's syntax
> error pasted into it verbatim, at the bottom, and was committed that way.
> Fixed 2026-09-06 in P3's pre-flight; measured as `bash -n` exit 2 → exit 0 and
> 11 sections → 15, with `=== end ===` now printing. The earlier baselines are
> **left exactly as they are** — they are dated evidence, and this note is the
> correction rather than an edit to them.
>
> **A truncated snapshot is detectable**: it has no `=== end ===` marker and the
> script exits non-zero. Neither was checked. P3 Task 19 adds a `bash -n` sweep of
> `scripts/` and `infra/` to `make doctor` so this whole class fails loudly.

Manifest machine snapshot
taken: 2026-09-06 10:35:23 PDT
host:  Richs-MacBook-Pro.local
user:  rich

=== Platform ===
macOS       26.6.2 (build 25G83)
arch        arm64
cores       12
RAM         36 GiB
free disk   158Gi
bash        3.2.57(1)-release

=== Host toolchain — things that genuinely live on this machine ===
node         v24.12.0
pnpm         11.24.0
npm          11.6.2
docker       Docker version 29.7.2, build a7dcaa6
git          git version 2.50.1 (Apple Git-155)
make         GNU Make 3.81
openssl      OpenSSL 3.6.3 9 Jun 2026 (Library: OpenSSL 3.6.3 9 Jun 2026)
ollama       ollama version is 0.33.3
  models     qwen3.8:27b nemotron3:33b qwen3.6:27b gemma4:31b gemma4:e4b gemma4:26b gpt-oss:20b qwen3.5:4b qwen3.5:9b ministral-3:latest glm-4.7-flash:latest nomic-embed-text:latest 
.nvmrc       24

=== Docker daemon ===
daemon      up
engine      29.7.2
API         1.55 (min 1.40)
storage     overlayfs
VM memory   8319238144 bytes
security    [name=seccomp,profile=builtin name=cgroupns]

=== Containers (all states) ===
canvas-bridge-app-1	canvas-bridge-app	Exited (0) 7 weeks ago
canvas-bridge-nginx-1	nginx:1.27-alpine	Exited (0) 7 weeks ago
canvas-bridge-tusd-1	tusproject/tusd:v2.6.0	Exited (0) 7 weeks ago
codercom-coder-1	ghcr.io/coder/coder:latest	Exited (0) 8 days ago
codercom-database-1	postgres:17	Exited (0) 8 days ago
course-directory-db-1	postgres:16-alpine	Exited (255) 3 months ago
course-directory-web-1	course-directory-web	Exited (255) 3 months ago
credit-card-helper-app-1	credit-card-helper-app	Exited (0) 9 days ago
credit-card-helper-frontend-1	node:20-alpine	Exited (0) 9 days ago
docker-simple-saml-saml-idp-1	docker-simple-saml-saml-idp	Exited (0) 42 hours ago
fakeacademicapi-academic-api-fake-1	fakeacademicapi-academic-api-fake	Exited (143) 7 weeks ago
manifest-caddy	manifest-caddy:local	Up 17 hours (healthy)
manifest-dns-containers	manifest-dnsmasq:local	Up 17 hours
manifest-dns-host	manifest-dnsmasq:local	Up 17 hours
manifest-egress	manifest-egress:local	Up 17 hours
manifest-idp	manifest-idp:local	Up 17 hours
manifest-litellm	ghcr.io/berriai/litellm:main-stable	Up 17 hours (healthy)
manifest-postgres	postgres:16-alpine	Up 12 hours (healthy)
manifest-registry	registry:2	Up 17 hours (healthy)
manifest-verdaccio	verdaccio/verdaccio:6	Up 17 hours (healthy)
mongo-express	mongo-express:latest	Up 42 hours
mongodb	mongodb/mongodb-community-server:7.0.28-ubi8	Up 42 hours
openwebui-openwebui-1	ghcr.io/open-webui/open-webui:main	Exited (137) 12 days ago
qdrant-local-dev	qdrant/qdrant:v1.17.1	Up 42 hours
ubc-document-parsing-api-clamav-1	clamav/clamav:latest	Exited (143) 12 days ago
ubc-document-parsing-api-gateway-1	ubc-document-parsing-api-gateway	Exited (0) 12 days ago
ubc-document-parsing-api-minio-1	minio/minio	Exited (0) 12 days ago
ubc-document-parsing-api-redis-1	redis:7-alpine	Exited (0) 12 days ago
ubc-document-parsing-api-vlmstub-1	python:3.12-slim	Exited (137) 12 days ago
ubc-document-parsing-api-worker-1	ubc-document-parsing-api-worker	Exited (0) 12 days ago
ubc-document-parsing-api-worker-2	ubc-document-parsing-api-worker	Exited (0) 12 days ago

=== Must-survive containers (ORIENTATION §4) ===
docker-simple-saml-saml-idp-1      exited
qdrant-local-dev                   running
mongodb                            running
mongo-express                      running

=== Images (repo:tag @ digest) ===
127.0.0.1:7107/alpine:3.22	<none>
127.0.0.1:7107/base/alpine:3.22	<none>
127.0.0.1:7107/base/curl:8.11.1	<none>
127.0.0.1:7107/base/mongodb-community-server:7.0.28-ubi8	<none>
127.0.0.1:7107/base/node:22-alpine	<none>
127.0.0.1:7107/curl:8.11.1	<none>
127.0.0.1:7107/mongodb-community-server:7.0.28-ubi8	<none>
127.0.0.1:7107/node:22-alpine	<none>
alpine:3.20	sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
alpine:3.22	sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce
canvas-bridge-app:latest	sha256:d1775cbb6c9f30912ed0652bdb9c54a0ae0f3aed8347468daa3d6cc554fc0677
clamav/clamav:latest	sha256:7f5389ccaa2368c383fa80e167ccfe44348d71e685f926fce4755eed1757673a
course-directory-web:latest	sha256:589bc433f3fef4d69699c3920109b3da1bab059bbf1478d061cdf2f2fa9baa02
credit-card-helper-app:latest	sha256:ac982b6188a588635a8f553ca2036dbaf13248b697c7105aecac0c35e402c9c9
curlimages/curl:8.11.1	sha256:c1fe1679c34d9784c1b0d1e5f62ac0a79fca01fb6377cdd33e90473c6f9f9a69
docker-simple-saml-saml-idp:latest	sha256:96663d37630d9ade98b40dee24c515c75189dc7f3485d37aed8a742d0efa0ea6
fakeacademicapi-academic-api-fake:latest	sha256:88c21b82ae1c919266e4526b07ab250bf6b9d9f30b269509bd6bc232ed4d4f76
ghcr.io/berriai/litellm:main-stable	sha256:20b5044b619055374061a6d5b7b08754cad75aeabbf82ddf4f69cc0cf80ddaf4
ghcr.io/coder/coder:latest	sha256:e71d75fac8743c1295ab5394a3ec05aeb9849c997fd670c914c27334bb8a7761
ghcr.io/open-webui/open-webui:main	sha256:a26effeb220e132482bf7e0560b3404843e7bc40d23051144e062960df8df6b0
ghcr.io/yannh/kubeconform:latest	sha256:faffaf43f95aa6425306e1ab8d6fcad72acb9049158f38e574c085ea1ec0f64e
manifest-caddy:local	sha256:573a48fe7a5d7666b3a34ae4b384e795bcc04a0be9c2de006eb82964e271dcb2
manifest-dnsmasq:local	sha256:eedbc572a589e7ab134c473b6f48afae39aeb7f959ddb225d6befb2f516d571d
manifest-egress:local	sha256:414c587fbf4bd7368ddd11fc4f6c7c9c57e0222d219f0479271ebf177b403dcb
manifest-idp:local	sha256:18f362a767b2fef8c7d4949c6e46667ad0b6934c68bbc26d68fa9da31191e4c3
minio/minio:latest	sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e
moby/buildkit:v0.27.0-rootless	sha256:586cf37ba4bafd151058aa9c857fe06036942a2a765d7dc5630098cf31834200
moby/buildkit:v0.32.2-rootless	sha256:504731e577c20559c00f968f33219f30115e70be29ab96728d1d06e963fc494b
mongo-express:latest	sha256:1b23d7976f0210dbec74045c209e52fbb26d29b2e873d6c6fa3d3f0ae32c2a64
mongodb/mongodb-community-server:7.0.28-ubi8	sha256:56d07a0227ceeb04ba763bfe5681660c465114d2f6fb943e8e8f3718134b5436
nginx:1.27-alpine	sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
node:20-alpine	sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
node:22-alpine	sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
php:8.2-cli	sha256:90db578653480744d7137d42e26055bc12c75099eab0cbb38bc8da79a94b1443
postgres:16-alpine	sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50
postgres:17	sha256:67f41722b7a8cbdb868a44a4995c846eddfdc2973bccb291ce937dce88ad5675
python:3.11-slim	sha256:b27df5841f3355e9473f9a516d38a6783b6c8dfeacaf2d14a240f443b368ddb6
python:3.12-slim	sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de
qdrant/qdrant:v1.17.1	sha256:94728574965d17c6485dd361aa3c0818b325b9016dac5ea6afec7b4b2700865f
redis:7-alpine	sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99
registry:2	sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373
tusproject/tusd:v2.6.0	sha256:b00c762725d6840394541f2bfcb3c1ca8072070d3d207be9885aac5e78d32710
ubc-document-parsing-api-gateway:latest	sha256:f7d9f58e368e10cfa72a0466ab00fdfad018f8295392c385c258d3a91914afaa
ubc-document-parsing-api-worker:latest	sha256:9d7030a29152505419cfe550321b17039cd01647819e6aa11cd94fa28065af3a
verdaccio/verdaccio:6	sha256:fcb86134563534e2f634752e6c6c3edcdb78242ec16578c73ce39d1dadbaa801
vimagick/tinyproxy:latest	sha256:72b441b95ee1e641af948f68f09492f9f795ead72b73954414e339168c98ad8c

=== Networks ===
bridge	bridge	local
canvas-bridge_default	bridge	local
codercom_default	bridge	local
course-directory_default	bridge	local
credit-card-helper_default	bridge	local
docker-simple-saml_default	bridge	local
fakeacademicapi_default	bridge	local
host	host	local
idp_default	bridge	local
manifest-build-internal	bridge	local
manifest-platform	bridge	local
none	null	local
openwebui_default	bridge	local
tlef-mongodb-docker_default	bridge	local
tlef-qdrant_default	bridge	local
ubc-document-parsing-api_default	bridge	local

=== Volumes ===
06ffed49e8f3bbf06d9d15966cadb5f179b374644418ec73b237bd9d925a006e
17dc1fc0555af6d0e8c81de8ae23610c8d5dc5c9f83fa2aeb17d750af2160086
1b2037bcca3488f5fa6631f7eadeb001e16860215f12fe8f6c3ba4425259e1ab
1c3eb8bb1f1ee21bfd61d9fb20fdda1c5d08fc0b43e48ee4bcf810d7656f98b2
1d4ebbc9b2d6d9e5047065136b021a5c5fcc994aa5d98b1e644ce99052e9ebd5
1db75a2f813ed1582c6dfdf229fa39613d91b0dde9deed92ce966f1fe51ece05
3036ed1d6e96decade9bb37105e31e6a2d251018d0f21c8e48ea820f4a352cce
31f7c2aefbc7756a782a2f732a2aac2bceb2ec5bd12bb6a831cfb209468ff4ba
35e59b440490333a565e42022a47e80842ce48ee8e43ed792ae29780982bf74d
394477a9a73923cba85710e8775a868076416ec74c7d614882ef963f58087218
3996cf941003474864bffe3721977cfe88ed186ebbb2a842a9b7aff637465678
3e89a6903e26a2df85c2dc46e0eff892b49552ea6d3107718ff17a8df8a41894
467bd5400b2e8aa1944d4929f95f9055bc99ad83e37257edacd24275185d9fb4
4e90a7ee480cf7a6acc5cf3a0e207f10fdb3ef209eb2dec48543c8b7ec0fd8a0
53a988d08ab6e47e8e1a143aef636cb3576e2048d62f72628d09403a7007b8cd
54847075a6c61951f07a31d834fd73bdb1fe3afddf1b5fb5ff85446e1a23902c
57ef2e899150110f60a4d0c3dfec2e585f7c5a9d630ca187f043b059ef56cd8f
62df224dd7e64513b2214a5e386a156673615a33016d2ed8b11de43c6a89c25c
71ad966bebcfb83cc4a70dcd6c9ebeb17be3ef9d77094840e821001c70ad09cc
76f01ff48e2c6f8159d023ea41ea04e7489cd176659684af3e89d8bd05a747c1
897340de35387848ba3fbbe79ace5f5612eada43660fcd7576bdf3d588c9a564
9053df9487b5ac30b0faf99d5f5f6c997566c6b8e18b5c9661991e28b0b5454a
9e19769fb9e26fdc66287d71df21539e3b7d14bf80eeb4ac063c840f0348fc90
9f5e8fda5c56c31ccc8e1f8e0cfa1d0597cdb888a8b580a226b49ddcd831fd94
a0e2f54b6e035b6b9dc255fd6f0e8c205e77008b5a26e35fe40983704d296581
a56d49a24dfbbd2f22aa025bc35b9c37ebe4b756c3e7d8d6ec10e3a6718c4449
a9e594f6e31876fa40424541df0ffda0fa8c9b93787bb7160bcf794bd15d1641
adc8d82c8e561b64bf91ad3c9e98a90bf903b139cf6e7a601f7a03bf0249ecc2
b04b794872c2cf2b999787ebb92af534398585ff6a518f1d24231320b5431710
b1ee60bec101eff058d4783050dbdc3a21d9dc09aa55704d98d49d47d2ddaef1
c9ed8e9e2657bb430c0e77f7caa07c173b51824138e84b92691a06e8a9275684
ce9b20a6cfb202235544f332660d42c1778a87ab5e491a17f4ef4cb64d8df547
codercom_coder_data
codercom_coder_home
course-directory_db-data
d0a1b124ec89811db84dd3b687d319082f43f04c3af19f94c7c3eab81a22c9b0
d91323f56cd44bb6ac3dd8f3f2c01e212a7ebd9d80dcab5e01ee7179116ba2e2
d9a947bb7988b983eaa061ffcddde428dc0be043b0a1cd3013e3a84ee9212209
dad52f1e04fa65475272f56ead89c00a6de36eb975c4c36543f4317c09b01c47
dfa42b3f283bef6c119d767f5c21c0578c305a07cef4113d4946907e995f3cb9
docker-simple-saml_simplesaml_metadata
e06a3f1afb43f94a92ba55b0922bd58522cd72273b364c61935aae8a66bf4f2a
e24866ee9adc606d51eb00ae32b91d9a874bceb92107339167be946bde1f0581
e31274c712adeed8c2a55d31fcc7e813852a4a9f7638c2148fb2caadc3517657
ffd6077ca702bdf36b6022443b05abc3b90c3ad3bb0a6e6d65041a68c7f65894
manifest-buildkit-cache
manifest-caddy-data
manifest-pgdata
manifest-registry-data
manifest-verdaccio-storage
openwebui_open-webui
saml-sso-pip-cache
tlef-mongodb-docker_mongodb_data
ubc-document-parsing-api_minio-data

=== Ports — the 7100-7199 block P1 claims ===
IN USE: 7103 7106 7107 7108 7109 7119 7122 7153 

=== Ports other things hold (ORIENTATION §4) ===
53     (nothing visible to this user)
80     tcp:nginx
443    tcp:nginx udp:Google
6122   (nothing visible to this user)
6333   tcp:com.docke
6334   tcp:com.docke
8081   tcp:com.docke
11434  tcp:ollama
27017  tcp:com.docke

(free) is NOT what a blank means here. Without sudo, lsof cannot see sockets
owned by other users, and Valet's dnsmasq runs as 'nobody' — so port 53 reads
as empty on this machine while dnsmasq is plainly listening on it. Confirm
against the Valet section below, or re-run one port under sudo. This script
reports what it can see and says so; it does not claim a port is free.

=== Loopback alias 127.0.0.2 (Caddy binds it; does not survive a reboot) ===
present

=== Resolvers in /etc/resolver (Valet owns .test — never touch it) ===
manifest.internal: nameserver 127.0.0.1 
test: nameserver 127.0.0.1 
vibonarium.local: nameserver 127.0.0.1 

=== Valet (must not be disturbed) ===
dnsmasq     93954 /opt/homebrew/opt/dnsmasq/sbin/dnsmasq --keep-in-foreground -C /opt/homebrew/etc/dnsmasq.conf -7 /opt/homebrew/etc/dnsmasq.d,*.conf
nginx       764 nginx: master process /opt/homebrew/opt/nginx/bin/nginx -g daemon off; XPC_FLAGS=1 ptr_munge=

=== Repository ===
branch      main
HEAD        1694cca docs(p3): reconcile against a running P2, and fix two live P2 defects
dirty       1 file(s)

=== end ===
