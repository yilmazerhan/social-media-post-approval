import { apiFetch } from '@shared/api/http';

// Hand-written for the skeleton only. From phase 1 these types are generated from the backend's
// OpenAPI document, so a field rename breaks the build rather than production (ARCHITECTURE.md 2.3).
export interface HealthResponse {
  status: string;
  application: string;
  version: string;
  time: string;
}

export interface AuthMethod {
  id: 'LOCAL' | 'SAML_ENTRA';
  enabled: boolean;
  registrationId?: string;
}

export interface AuthMethodsResponse {
  methods: AuthMethod[];
}

export const fetchHealth = () => apiFetch<HealthResponse>('/system/health');
export const fetchAuthMethods = () => apiFetch<AuthMethodsResponse>('/system/auth-methods');
