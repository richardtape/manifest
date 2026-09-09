Manifest machine snapshot
taken: 2026-09-09 11:09:42 PDT
host:  host168-126.vpn.ubc.ca
user:  rich

=== Platform ===
macOS       26.6.2 (build 25G83)
arch        arm64
cores       12
RAM         36 GiB
free disk   149Gi
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
canvas-bridge-app-1	canvas-bridge-app	Exited (0) 8 weeks ago
canvas-bridge-nginx-1	nginx:1.27-alpine	Exited (0) 8 weeks ago
canvas-bridge-tusd-1	tusproject/tusd:v2.6.0	Exited (0) 8 weeks ago
codercom-coder-1	ghcr.io/coder/coder:latest	Exited (0) 11 days ago
codercom-database-1	postgres:17	Exited (0) 11 days ago
course-directory-db-1	postgres:16-alpine	Exited (255) 4 months ago
course-directory-web-1	course-directory-web	Exited (255) 4 months ago
credit-card-helper-app-1	credit-card-helper-app	Exited (0) 12 days ago
credit-card-helper-frontend-1	node:20-alpine	Exited (0) 12 days ago
docker-simple-saml-saml-idp-1	docker-simple-saml-saml-idp	Exited (0) 4 days ago
fakeacademicapi-academic-api-fake-1	fakeacademicapi-academic-api-fake	Exited (143) 8 weeks ago
manifest-caddy	573a48fe7a5d	Up 11 minutes (healthy)
manifest-dns-containers	manifest-dnsmasq:local	Up About an hour
manifest-dns-host	manifest-dnsmasq:local	Up About an hour
manifest-egress	414c587fbf4b	Up 46 hours
manifest-idp	700194d4fb6a	Up 17 hours
manifest-litellm	ghcr.io/berriai/litellm:main-stable	Up 46 hours (healthy)
manifest-postgres	postgres:16-alpine	Up 46 hours (healthy)
manifest-registry	registry:2	Up 46 hours (healthy)
manifest-verdaccio	verdaccio/verdaccio:6	Up 46 hours (healthy)
mf-fixture-app-staging-711c7bcb-app	127.0.0.1:7107/local/fixture-app	Up 8 minutes (healthy)
mf-fixture-app-staging-db	56d07a0227ce	Up 2 hours (healthy)
mf-fixture-app-staging-egress	414c587fbf4b	Up 2 hours
mongo-express	mongo-express:latest	Up 4 days
mongodb	mongodb/mongodb-community-server:7.0.28-ubi8	Up 4 days
openwebui-openwebui-1	ghcr.io/open-webui/open-webui:main	Exited (137) 2 weeks ago
qdrant-local-dev	qdrant/qdrant:v1.17.1	Up 4 days
ubc-document-parsing-api-clamav-1	clamav/clamav:latest	Exited (143) 2 weeks ago
ubc-document-parsing-api-gateway-1	ubc-document-parsing-api-gateway	Exited (0) 2 weeks ago
ubc-document-parsing-api-minio-1	minio/minio	Exited (0) 2 weeks ago
ubc-document-parsing-api-redis-1	redis:7-alpine	Exited (0) 2 weeks ago
ubc-document-parsing-api-vlmstub-1	python:3.12-slim	Exited (137) 2 weeks ago
ubc-document-parsing-api-worker-1	ubc-document-parsing-api-worker	Exited (0) 2 weeks ago
ubc-document-parsing-api-worker-2	ubc-document-parsing-api-worker	Exited (0) 2 weeks ago

=== Must-survive containers (ORIENTATION §4) ===
docker-simple-saml-saml-idp-1      exited
qdrant-local-dev                   running
mongodb                            running
mongo-express                      running

=== Images (repo:tag @ digest) ===
127.0.0.1:7107/alpine:3.22	<none>
127.0.0.1:7107/base/alpine:3.22	sha256:2c9d26f410d032d5b1525aa8a873e238b05b90c4ae8618743d4311f0cc827e37
127.0.0.1:7107/base/curl:8.11.1	<none>
127.0.0.1:7107/base/grype:v0.118.0	<none>
127.0.0.1:7107/base/mongodb-community-server:7.0.28-ubi8	<none>
127.0.0.1:7107/base/node:22-alpine	<none>
127.0.0.1:7107/base/syft:v1.51.1	<none>
127.0.0.1:7107/curl:8.11.1	<none>
127.0.0.1:7107/local/chem-labs:<none>	sha256:6342e80d0c911211a796430f0cc8abf8fca035045eb13d5071773fb0defcbae3
127.0.0.1:7107/local/chem-labs:<none>	sha256:e71b88e5e2548cee4b0925a37bcb3fe9b46f6c6307e42cc0ddad424a4662cca4
127.0.0.1:7107/local/fixture-app:<none>	sha256:2b9c0e5d780c85cf06dcb47fcf1a28c823de6113198d5e5b9d11d4bb6448d6ae
127.0.0.1:7107/local/fixture-app:<none>	sha256:969753e2d40b35eb8ff4412ef5e3ae5e3c74171394817380fed2c28c02e8c28b
127.0.0.1:7107/local/fixture-s6:<none>	sha256:0c450e4b307a924a416722272ea3f1c59887496188aff6e37617d64c86be6d32
127.0.0.1:7107/local/fixture-s6:<none>	sha256:35b31ed2ffd3c839fe24d5c618c9a1387a514b54cf8537c287d8c4c4fd37c002
127.0.0.1:7107/local/saml-probe:<none>	sha256:1c0ca6f3e8434345614d3564ce5140210b7b62df7d35f4165fb2e371d15b356b
127.0.0.1:7107/local/saml-probe:<none>	sha256:59cb91647752d7d9e2aba2a6fa90fc3b3f70b2b06b9af70cfe9fdb8b2a3bed2e
127.0.0.1:7107/local/saml-probe:<none>	sha256:5d18ffce1c12c623da8f7355b2de241f07d65b242a957cabe058590331bc77ed
127.0.0.1:7107/local/saml-probe:<none>	sha256:60a087d8edcc9236819eaa5d65423dca436429b13977461af1c682600fa28642
127.0.0.1:7107/local/saml-probe:<none>	sha256:f195d7b6a2bb4fc3f1b50c961d857c3a7f64676602da66f9dd24f8d5047ef7b2
127.0.0.1:7107/local/saml-unsigned:<none>	sha256:2ac38d6301d627755a91b9dd226cd426f746698d7a7c620c513d83d11516bb4e
127.0.0.1:7107/mongodb-community-server:7.0.28-ubi8	<none>
alpine:3.20	sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
alpine:3.22	sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce
anchore/grype:v0.118.0	sha256:8a93fc48da96bd6ec5981279d099b69de11541dc68fdf222fb9161f8ff284af7
anchore/syft:v1.51.1	sha256:95fe0835e5bebc6f8b1f8acef68d47d63d594ef4c0f25c097ff853b23cbac74c
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
manifest-caddy:local	sha256:dc7f36d30897c87d9ae67ab4e328c3fe904b79a9985d305a806965f5b2b01aef
manifest-dnsmasq:local	sha256:7053470d0811037a450fa80701dd3fee25dbd950b38206f9ed54697c1d64499c
manifest-egress:local	sha256:62201ff56ebd235a7c48bd65748bb208d7355d3131ba3d8896887edb89cac4c5
manifest-idp:local	sha256:bd1d7e62e221fcbf72f6a5a45b2ee24596f4b0bff86b5fec94b708d1f4a18c9b
minio/minio:latest	sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e
moby/buildkit:v0.27.0-rootless	sha256:586cf37ba4bafd151058aa9c857fe06036942a2a765d7dc5630098cf31834200
moby/buildkit:v0.32.2-rootless	sha256:504731e577c20559c00f968f33219f30115e70be29ab96728d1d06e963fc494b
mongo-express:latest	sha256:1b23d7976f0210dbec74045c209e52fbb26d29b2e873d6c6fa3d3f0ae32c2a64
mongodb/mongodb-community-server:7.0.28-ubi8	sha256:56d07a0227ceeb04ba763bfe5681660c465114d2f6fb943e8e8f3718134b5436
nginx:1.27-alpine	sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
node:20-alpine	sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
node:22-alpine	sha256:1ef15d33d74602021f35ec64a4e72f4a21e2cfa68ebecd125fbe0c44af8f604a
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
mf-chem-labs-staging-net	bridge	local
mf-fixture-app-staging-net	bridge	local
mf-fixture-rt-staging-net	bridge	local
mf-fixture-s6-staging-net	bridge	local
mf-fixture-s6nb-staging-net	bridge	local
mf-saml-probe-staging-net	bridge	local
mf-saml-unsigned-staging-net	bridge	local
none	null	local
openwebui_default	bridge	local
tlef-mongodb-docker_default	bridge	local
tlef-qdrant_default	bridge	local
ubc-document-parsing-api_default	bridge	local

=== Volumes ===
1786928a8930935ba67ce189b40db704fc1d57cacc127af184259379e7da2adb
3036ed1d6e96decade9bb37105e31e6a2d251018d0f21c8e48ea820f4a352cce
c9ed8e9e2657bb430c0e77f7caa07c173b51824138e84b92691a06e8a9275684
codercom_coder_data
codercom_coder_home
course-directory_db-data
docker-simple-saml_simplesaml_metadata
ea773354aee9e05bc6070a679007a5ace6a13f8768e7737d1a8fbbefde95669f
manifest-caddy-data
manifest-grype-db
manifest-pgdata
manifest-registry-data
manifest-verdaccio-storage
mf-chem-labs-staging-db-data
mf-fixture-app-staging-db-data
openwebui_open-webui
saml-sso-pip-cache
tlef-mongodb-docker_mongodb_data
ubc-document-parsing-api_minio-data

=== Ports — the 7100-7199 block P1 claims ===
IN USE: 7103 7106 7107 7108 7109 7119 7122 7153 

=== Ports other things hold (ORIENTATION §4) ===
53     (nothing visible to this user)
80     tcp:nginx
443    tcp:nginx udp:Helium
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
HEAD        dc6e0b0 fix: one producer for §8's variables, and MONGODB_DB_NAME is injected
dirty       7 file(s)

=== end ===
