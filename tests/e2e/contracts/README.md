# Consumer Contracts for External Fakes (§10 / FR-T6, ex-OQ-T5)

Third parties outside the SUT boundary (Stripe, SendGrid, …) are replaced at the
network edge by deterministic fakes reachable at `FAKES_URL`. Trust on that seam is
restored by consumer contracts:

- One contract file per external, Pact-style: the requests the app makes + the
  responses the fake pins.
- CI re-verifies every contract against the real provider's sandbox **on every fake
  change and weekly** (fake images are version-pinned in the flow manifests).
- A contract mismatch is a failing test, surfaced in the handback like any FAILING
  entry — it means the fake (and therefore every green that relied on it) has drifted
  from reality.

Until the first external is pinned this directory stays empty and `FAKES_URL` stays
unset; global-setup skips the fakes health check.
