-- §21: one server, three databases. POSTGRES_DB creates manifest_control; these
-- two are the others. initdb scripts run once, on an empty data directory only.
CREATE DATABASE litellm;
CREATE DATABASE manifest_idp;
