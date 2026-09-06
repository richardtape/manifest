# Built, not pulled, for one reason: vimagick/tinyproxy is amd64-ONLY, so on this
# arm64 machine the egress proxy ran under emulation (`uname -m` inside it said
# x86_64 on an arm64 host, and `make up` warned "the requested image's platform
# (linux/amd64) does not match the detected host platform"). Measured 2026-09-05.
# An emulated container in the baseline of a Mac-first platform is worth removing,
# and this also drops a single-maintainer external image from the supply chain in
# favour of alpine, which `make seed` already mirrors.
FROM alpine:3.22
RUN apk add --no-cache tinyproxy
EXPOSE 8888
ENTRYPOINT ["tinyproxy", "-d", "-c", "/etc/tinyproxy/tinyproxy.conf"]
