# packages/github-fake/Dockerfile — the GitHub FAKE (D5 plan, Task 5). NOT GitHub.
FROM node:22-alpine
# git at IMAGE BUILD, which is `make seed`'s step 2 — the one step with the network (C1).
# There is no apk mirror (ORIENTATION §8), so this line cannot run offline, and a fake with
# no git cannot be repaired offline either. upload-pack/receive-pack --stateless-rpc are
# core git; Alpine's package has no git-http-backend and the fake needs none (Task 1, [M4]).
RUN apk add --no-cache git
WORKDIR /app
COPY package.json resolve-ts.mjs ./
COPY src ./src
RUN mkdir -p /data && chown node:node /data
# Non-root. Its three credentials are bind-mounted `600` and owned by the host user (uid
# 501); measured 2026-09-24 (Task 5, Step 1), Docker Desktop presents them to the container
# as root-owned `600` and uid 1000 reads them anyway — file sharing does not enforce the
# host's modes. On a Linux host it would, and the fake would not start: that is a finding
# for Phase 5, not a reason to run as root here.
USER node
ENV FAKE_PORT=7110 FAKE_DATA_DIR=/data
EXPOSE 7110
# busybox wget is in the image (NOT curl — LiteLLM's healthcheck trap, compose.yaml).
HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD wget -qO- http://127.0.0.1:7110/_fake/health || exit 1
CMD ["node", "--import", "./resolve-ts.mjs", "src/main.ts"]
