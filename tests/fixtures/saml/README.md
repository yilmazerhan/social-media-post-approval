# SAML test fixtures

`idp-key.pem` / `idp-cert.pem` are a throwaway, self-signed key pair used
**only** to sign fake SAML responses in the test suite, simulating an
Entra ID IdP without needing a real tenant. They sign nothing real, protect
nothing real, and are committed deliberately — this is the same approach
node-saml/passport-saml's own test suites use. Never reuse them for
anything outside `tests/`.
