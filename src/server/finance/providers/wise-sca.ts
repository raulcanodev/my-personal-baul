// Wise Strong Customer Authentication for personal API tokens: some endpoints (balance
// statements for EU/UK profiles) answer 403 with a one-time token in `x-2fa-approval`.
// The request is repeated with that token signed (RSA-SHA256) by a key whose public half is
// registered in Wise → Settings → API tokens → Manage public keys.
// https://docs.wise.com/api-docs/features/strong-customer-authentication-2fa/personal-token-sca

const toBase64 = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromPem = (pem: string) =>
  Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s+/g, "")), (c) =>
    c.charCodeAt(0),
  );
const toPem = (label: string, bytes: ArrayBuffer) =>
  `-----BEGIN ${label}-----\n${toBase64(bytes)
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END ${label}-----`;

const ALGORITHM = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

/** A fresh key pair: the private key (PKCS#8 PEM) stays encrypted in D1, the public one goes to Wise */
export async function generateScaKeyPair() {
  const pair = await crypto.subtle.generateKey(
    {
      ...ALGORITHM,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  return {
    privateKeyPem: toPem(
      "PRIVATE KEY",
      await crypto.subtle.exportKey("pkcs8", pair.privateKey),
    ),
    publicKeyPem: toPem(
      "PUBLIC KEY",
      await crypto.subtle.exportKey("spki", pair.publicKey),
    ),
  };
}

async function sign(oneTimeToken: string, privateKeyPem: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    fromPem(privateKeyPem),
    ALGORITHM,
    false,
    ["sign"],
  );
  return toBase64(
    await crypto.subtle.sign(
      ALGORITHM,
      key,
      new TextEncoder().encode(oneTimeToken),
    ),
  );
}

export class WiseScaError extends Error {}

/** fetch that answers Wise's SCA challenge when a signing key is available */
export async function wiseFetch(
  url: string,
  apiKey: string,
  privateKeyPem?: string,
) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const response = await fetch(url, { headers });
  const oneTimeToken = response.headers.get("x-2fa-approval");
  if (response.status !== 403 || !oneTimeToken) return response;
  if (!privateKeyPem) {
    throw new WiseScaError(
      "Wise pide firma SCA: añade la clave pública de esta conexión en Wise",
    );
  }
  const retried = await fetch(url, {
    headers: {
      ...headers,
      "x-2fa-approval": oneTimeToken,
      "X-Signature": await sign(oneTimeToken, privateKeyPem),
    },
  });
  if (retried.status === 403) {
    throw new WiseScaError(
      "Wise rechazó la firma SCA: comprueba que la clave pública de esta conexión está añadida en Wise",
    );
  }
  return retried;
}
