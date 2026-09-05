/** Maps a validated SAML Profile to our internal shape using the configured claim URIs — AUTHENTICATION.md §3. */
import type { Profile } from "@node-saml/node-saml";
import { config } from "@/server/config";

export interface MappedSamlAttributes {
  externalIdentityId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  jobTitle?: string;
  department?: string;
  groups: string[];
}

function attr(profile: Profile, key: string): string | undefined {
  const value = profile[key];
  if (Array.isArray(value))
    return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

function attrList(profile: Profile, key: string): string[] {
  const value = profile[key];
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

export function mapProfileAttributes(profile: Profile): MappedSamlAttributes {
  const externalIdentityId =
    attr(profile, config.SAML_ATTR_OBJECT_ID) ?? profile.nameID;
  const email = (
    attr(profile, config.SAML_ATTR_EMAIL) ??
    profile.email ??
    profile.nameID
  )?.toLowerCase();

  if (!externalIdentityId) {
    throw new Error(
      "SAML assertion did not include an object identifier attribute",
    );
  }
  if (!email) {
    throw new Error("SAML assertion did not include an email attribute");
  }

  return {
    externalIdentityId,
    email,
    firstName: attr(profile, config.SAML_ATTR_FIRST_NAME),
    lastName: attr(profile, config.SAML_ATTR_LAST_NAME),
    displayName: attr(profile, config.SAML_ATTR_DISPLAY_NAME),
    jobTitle: attr(profile, config.SAML_ATTR_JOB_TITLE),
    department: attr(profile, config.SAML_ATTR_DEPARTMENT),
    groups: attrList(profile, config.SAML_ATTR_GROUPS),
  };
}
