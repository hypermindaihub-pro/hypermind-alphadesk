import {
  DESK_STORAGE_VERSION,
  parseStoredDeskState,
  type PersistedDeskState,
} from "./desk-storage";

export const DESK_VAULT_FORMAT = "hypermind.alphadesk.encrypted-vault";
export const DESK_VAULT_VERSION = 1;
const PBKDF2_ITERATIONS = 180_000;

type DeskVaultEnvelope = {
  format: typeof DESK_VAULT_FORMAT;
  version: typeof DESK_VAULT_VERSION;
  deskVersion: typeof DESK_STORAGE_VERSION;
  kdf: "PBKDF2-SHA256";
  cipher: "AES-GCM";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy.buffer;
}

async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
    },
    baseKey,
    {
      length: 256,
      name: "AES-GCM",
    },
    false,
    ["decrypt", "encrypt"],
  );
}

function assertPassphrase(passphrase: string): void {
  if (passphrase.trim().length < 12) {
    throw new Error("Vault passphrase must be at least 12 characters.");
  }
}

export async function encryptDeskVault(
  state: PersistedDeskState,
  passphrase: string,
  createdAt = new Date().toISOString(),
): Promise<string> {
  assertPassphrase(passphrase);

  const encoder = new TextEncoder();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveVaultKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    {
      iv: toArrayBuffer(iv),
      name: "AES-GCM",
    },
    key,
    toArrayBuffer(encoder.encode(JSON.stringify(state))),
  );
  const envelope: DeskVaultEnvelope = {
    cipher: "AES-GCM",
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt,
    deskVersion: DESK_STORAGE_VERSION,
    format: DESK_VAULT_FORMAT,
    iterations: PBKDF2_ITERATIONS,
    iv: bytesToBase64(iv),
    kdf: "PBKDF2-SHA256",
    salt: bytesToBase64(salt),
    version: DESK_VAULT_VERSION,
  };

  return JSON.stringify(envelope, null, 2);
}

export async function decryptDeskVault(
  rawVault: string,
  passphrase: string,
  fallback: PersistedDeskState,
): Promise<PersistedDeskState> {
  assertPassphrase(passphrase);

  const envelope = JSON.parse(rawVault) as Partial<DeskVaultEnvelope>;

  if (
    envelope.format !== DESK_VAULT_FORMAT ||
    envelope.version !== DESK_VAULT_VERSION ||
    envelope.cipher !== "AES-GCM" ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    typeof envelope.iterations !== "number" ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("Unsupported AlphaDesk vault format.");
  }

  const decoder = new TextDecoder();
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveVaultKey(passphrase, salt, envelope.iterations);
  const plaintext = await crypto.subtle.decrypt(
    {
      iv: toArrayBuffer(iv),
      name: "AES-GCM",
    },
    key,
    toArrayBuffer(ciphertext),
  );

  return parseStoredDeskState(decoder.decode(plaintext), fallback);
}
