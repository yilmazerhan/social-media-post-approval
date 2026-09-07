/**
 * TLS certificate management — Administration -> TLS Certificate,
 * API.md's `/api/v1/admin/certificate`.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  getCurrentCertificate,
  uploadCertificate,
  type CertificateInfoDto,
} from "./service";
export { receiveJksUpload, type ReceivedJksUpload } from "./receive-upload";
