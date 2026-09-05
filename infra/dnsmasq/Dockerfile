# bind-tools is not decoration: `dig` inside this container is how you debug the
# split horizon when it misbehaves, and `docker logs` on each of the two
# containers separates host queries from container queries (S7).
FROM alpine:3.22
RUN apk add --no-cache dnsmasq bind-tools
ENTRYPOINT ["dnsmasq"]
