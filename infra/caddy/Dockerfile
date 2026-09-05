# The one image built rather than pulled (§20). Rate limiting and Coraza/OWASP-CRS
# are third-party modules and the edge is "the highest-leverage control in the
# platform", so a stock Caddy would ship only part of it.
#
# TWO SUPPLY-CHAIN FACTS, recorded because both constrain future upgrades (S7):
#   1. Coraza PINS Caddy. coraza-caddy/v2@v2.6.0 requires caddy/v2@v2.11.4 and
#      xcaddy refuses any other version. Bumping one means bumping both.
#   2. caddy-ratelimit has exactly ONE published release, ever (v0.1.0) — a
#      single-version, single-maintainer dependency inside our top control.
ARG CADDY_VERSION=2.11.4
FROM caddy:${CADDY_VERSION}-builder AS builder
ARG CADDY_VERSION
RUN xcaddy build v${CADDY_VERSION} \
    --with github.com/mholt/caddy-ratelimit@v0.1.0 \
    --with github.com/corazawaf/coraza-caddy/v2@v2.6.0

FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
