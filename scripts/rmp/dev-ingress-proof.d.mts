export const INGRESS_HEADER: string;
export function readSignedIngressProof(
  token: string | null | undefined,
  secret: string | undefined,
): { peer: string; method: string; path: string; time: number } | null;
export function privateAdminPeer(raw: string | null | undefined): boolean;
export function signIngressProof(
  peer: string,
  method: string,
  path: string,
  secret: string,
  now?: number,
): string;
export function validIngressProof(
  token: string | null | undefined,
  method: string,
  path: string,
  secret: string | undefined,
  now?: number,
): boolean;
