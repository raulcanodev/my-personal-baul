// AES-GCM with a key derived from BETTER_AUTH_SECRET (Web Crypto, works in Workers).
// Same idea as papra's encryptApiKey, so bank API keys never sit in D1 in clear text.
const encoder = new TextEncoder();

async function getKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function encryptSecret(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getKey(secret),
    encoder.encode(value),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(value: string, secret: string) {
  const [iv, data] = value.split(".");
  if (!iv || !data) throw new Error("Malformed encrypted value");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await getKey(secret),
    fromBase64(data),
  );
  return new TextDecoder().decode(plain);
}
