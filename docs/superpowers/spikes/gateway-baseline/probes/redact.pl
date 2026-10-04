#!/usr/bin/perl
# The UBC AI Gateway plan's Task 1: EVERY captured body passes through this before it is written (Global Constraints).
# Replaces, in order: the gateway key's value and the probe key's (read from the ENVIRONMENT, never an argument), any
# `Bearer <token>`, any `sk-…` that is not one of this probe's own canaries, and any 64-hex digest (a LiteLLM key hash
# names a key as surely as the key does). A LiteLLM 401 echoes the key it was sent as `sk-...<last 4>`: that form is
# kept as `sk-...[REDACTED]`, so the record can say WHERE a fragment landed without saying what it was.
#   usage: some-command | perl redact.pl
use strict;
use warnings;

my @secrets = grep { defined && length >= 8 } ($ENV{UBC_AI_GATEWAY_API_KEY}, $ENV{GW_PROBE_KEY});

while (my $line = <STDIN>) {
  for my $s (@secrets) {
    my $i;
    while (($i = index($line, $s)) >= 0) {
      substr($line, $i, length $s) = '[REDACTED-KEY]';
    }
  }
  $line =~ s/(Bearer\s+)(?!\[REDACTED)\S+/$1\[REDACTED]/gi;
  $line =~ s/sk-\.\.\.[A-Za-z0-9_-]{2,}/sk-...[REDACTED-FRAGMENT]/g;
  $line =~ s/sk-(?!canary-|\.\.\.\[REDACTED)[A-Za-z0-9._-]{4,}/sk-[REDACTED]/g;
  $line =~ s/\b[0-9a-f]{64}\b/[REDACTED-HASH]/g;
  # [M2] found the gateway naming each model's UPSTREAM in `x-litellm-model-api-base` (LiteLLM's leak, tracked for
  # before production) and the provider's own headers as `llm_provider-*` (OpenAI's organisation and project ids, a
  # Cloudflare cookie). M9: LTIC's upstream addresses are not this repository's to publish — only their CLASS is kept.
  $line =~ s{(x-litellm-model-api-base:\s*)([^;\s]+)}{$1 . upstream($2)}gie;
  $line =~ s{(?<!api-base: )https?://(?!ai-gateway\.apps\.ltic\.ubc\.ca)[A-Za-z0-9.-]+\.ubc\.ca[^\s;"',]*}{[UPSTREAM: a UBC host]}g;
  $line =~ s/(llm_provider-set-cookie:).*?(?=;(?:llm_provider-|x-litellm-)|$)/$1 …/gi;
  $line =~ s/(llm_provider-(?:openai-organization|openai-project|x-request-id|cf-ray|x-litellm-call-id|req-arrive-time|resp-start-time):)[^;\n]*/$1 …/gi;
  $line =~ s/\bproj_[A-Za-z0-9]+/proj_[REDACTED]/g;
  $line =~ s/\bresp_[A-Za-z0-9_-]{20,}/resp_[REDACTED-ID]/g;
  print $line;
}

sub upstream {
  my ($url) = @_;
  return $url if $url =~ m{^https://ai-gateway\.apps\.ltic\.ubc\.ca(/|$)}i;    # the gateway itself: public, and ours to name
  return '[UPSTREAM: OpenAI\'s public API]' if $url =~ m{^https?://api\.openai\.com}i;
  return '[UPSTREAM: a UBC host]' if $url =~ m{^https?://[^/]*\.ubc\.ca}i;
  return '[UPSTREAM: other]';
}
