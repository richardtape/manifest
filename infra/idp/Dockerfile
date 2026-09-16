# Based on the proven docker-simple-saml image (S2), with the ONE change S2
# identified: pdo_pgsql, which ALSO needs libpq-dev — the ext-install alone fails.
FROM php:8.3-apache

# TWO extensions, not one. S2 recorded that pdo_pgsql needs libpq-dev, and that
# is still true. It did NOT need bcmath — but simplesamlphp/xml-common v2.8.2 now
# requires ext-bcmath, so `composer create-project` fails outright without it:
#   simplesamlphp/xml-common v2.8.2 requires ext-bcmath * -> it is missing
# Measured 2026-09-05. bcmath needs no extra system library.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq-dev unzip git \
 && docker-php-ext-install pdo_pgsql bcmath \
 && apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
# A RANGE, ON PURPOSE — do not pin it. `make seed` rebuilds this image from nothing,
# so each seed takes the newest SimpleSAMLphp 2.x: v2.5.3.1 on 2026-09-16, where S2
# measured 2.4.9. Rich's call that day: keep it current. What catches an upgrade that
# breaks a CWL login is §16's identity-path tier (`sso/login.docker.test.ts`) and the
# demos, not a pin. After a seed, record the version in the sitting's notes:
#   docker exec manifest-idp grep -m1 '"version"' /var/simplesamlphp/composer.json
RUN composer create-project simplesamlphp/simplesamlphp:^2.0 /var/simplesamlphp --no-interaction

ENV SIMPLESAMLPHP_CONFIG_DIR=/var/simplesamlphp/config
RUN sed -ri 's!DocumentRoot /var/www/html!DocumentRoot /var/simplesamlphp/public!' \
      /etc/apache2/sites-available/000-default.conf \
 && printf '<Directory /var/simplesamlphp/public>\n  AllowOverride All\n  Require all granted\n</Directory>\n' \
      > /etc/apache2/conf-available/ssp.conf \
 && a2enconf ssp

# The dist config points cachedir, loggingdir, tempdir and datadir at paths that
# do not exist in the image and must be writable by Apache's user. Without them
# the first request after `cachedir` is satisfied fails on the next one.
RUN mkdir -p /var/cache/simplesamlphp /var/log/simplesamlphp /var/lib/simplesamlphp \
 && chown -R www-data:www-data /var/cache/simplesamlphp /var/log/simplesamlphp \
      /var/lib/simplesamlphp /var/simplesamlphp

COPY docker-entrypoint.sh /usr/local/bin/manifest-idp-entrypoint
RUN chmod +x /usr/local/bin/manifest-idp-entrypoint
ENTRYPOINT ["manifest-idp-entrypoint"]
CMD ["apache2-foreground"]
