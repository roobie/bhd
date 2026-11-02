---
status: accepted
date: 2026-11-02
read_if:
  - deploying the signalling Worker, changing ICE or TURN delivery, ALLOWED_ORIGINS, or running rooms beyond local-*
refs:
  - worker/index.ts
  - src/client/shell/config.ts
---

# D-RNMUVBD5VT4WHZCI Signalling origin is configured and absent by default; ICE servers travel in the room joined message

## Context
The Worker is deployed only by B, so the page cannot know its address at build time, and the first design had a public endpoint minting TURN credentials.

## Decision
The signalling origin is supplied by a hash parameter or a build-time variable and has no default. Without it only local-* rooms work and the page says so. ICE servers, including TURN credentials, are delivered in the joined message of the room, and the public credential endpoint was removed. An allowed-origins setting limits room creation and sockets to listed origins; unset allows every origin.

## Why
Credentials handed out only to room members cannot be scraped from a public URL, and a missing config fails loudly instead of pointing at someone else's server. Origin checks are not authentication, so they only limit casual abuse.

## Consequences
Internet play awaits B deploying the Worker, setting the TURN secret and the allowed origins. Rate limiting is backlog.
