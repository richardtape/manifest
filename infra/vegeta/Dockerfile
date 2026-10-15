# §24's load generator — vegeta's official release binary on the mirrored alpine, BUILT HERE by `make seed`
# (infra/seed/build-vegeta.sh), never pulled (Rich, 2026-10-03: "Build it locally"). The build script has
# already checked the archive against infra/vegeta/vegeta.lock AND vegeta's published checksums file; the
# build checks it again, against the lock's sha256 passed in, so an image is never built from an archive
# the lock does not name.
#
# FROM BY DIGEST — the digest infra/images.lock holds for alpine:3.22, passed in by the build script, so the
# base is the one the daemon already has and the build needs no network once the archive is cached.
ARG ALPINE_DIGEST
FROM alpine:3.22@${ALPINE_DIGEST}

ARG VEGETA_VERSION
ARG VEGETA_SHA256
LABEL org.opencontainers.image.title="manifest load generator" \
      org.opencontainers.image.version="${VEGETA_VERSION}" \
      org.opencontainers.image.licenses="MIT" \
      manifest.vegeta.sha256="${VEGETA_SHA256}"

COPY vegeta.tar.gz /tmp/vegeta.tar.gz
RUN echo "${VEGETA_SHA256}  /tmp/vegeta.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/vegeta.tar.gz -C /usr/local/bin vegeta \
 && rm /tmp/vegeta.tar.gz \
 && chmod 0755 /usr/local/bin/vegeta \
 && vegeta --version \
 && adduser -D -H -u 10001 vegeta

# NON-ROOT. The control plane runs it with every capability dropped and a read-only root; its results go on
# a tmpfs at /work (launch/load.ts).
USER 10001
WORKDIR /work
ENTRYPOINT ["/bin/sh"]
