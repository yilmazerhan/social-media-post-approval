export type SamlRejectionReason =
  | "RELAY_STATE_INVALID"
  | "VALIDATION_FAILED"
  | "NO_PROFILE"
  | "IN_RESPONSE_TO_MISMATCH"
  | "WEAK_SIGNATURE_ALGORITHM"
  | "MISSING_ASSERTION_ID"
  | "REPLAYED"
  | "ATTRIBUTE_MAPPING_FAILED"
  | "ACCOUNT_INACTIVE"
  | "NO_ACCOUNT_PROVISIONED"
  | "LOCAL_LINK_FORBIDDEN";

export class SamlRejectedError extends Error {
  constructor(
    public readonly reason: SamlRejectionReason,
    message: string,
  ) {
    super(message);
  }
}

export class SamlDisabledError extends Error {
  constructor() {
    super("SAML sign-in is not enabled.");
  }
}
