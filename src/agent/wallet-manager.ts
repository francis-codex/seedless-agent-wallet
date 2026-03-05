import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { AgentWallet } from "../shared/types.js";
import { SOLANA_RPC_URL } from "../shared/constants.js";
import { getVaultPda } from "../vault/index.js";
import fs from "fs";
import path from "path";

const connection = new Connection(SOLANA_RPC_URL, "confirmed");

// File-based wallet store for persistence across CLI invocations
const STORE_DIR = path.join(process.cwd(), ".seedless");
const STORE_FILE = path.join(STORE_DIR, "wallets.json");

interface StoredWallet {
  id: string;
  label: string;
  publicKey: string;
  secretKey: number[];
  createdAt: number;
  vaultPda?: string;
}

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function loadStore(): Map<string, StoredWallet> {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
      return new Map(Object.entries(data));
    }
  } catch {
    // Corrupt file, start fresh
  }
  return new Map();
}

function saveStore(store: Map<string, StoredWallet>): void {
  ensureStoreDir();
  const obj: Record<string, StoredWallet> = {};
  for (const [k, v] of store) {
    obj[k] = v;
  }
  fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2));
}

function storedToWallet(stored: StoredWallet): AgentWallet {
  const keypair = Keypair.fromSecretKey(new Uint8Array(stored.secretKey));
  return {
    id: stored.id,
    label: stored.label,
    publicKey: stored.publicKey,
    keypair,
    createdAt: stored.createdAt,
    vaultPda: stored.vaultPda,
  };
}

export function createWallet(label?: string): AgentWallet {
  const keypair = Keypair.generate();
  const id = randomBytes(4).toString("hex");

  const wallet: AgentWallet = {
    id,
    label: label || `agent-${id}`,
    publicKey: keypair.publicKey.toBase58(),
    keypair,
    createdAt: Date.now(),
  };

  const store = loadStore();
  store.set(id, {
    id: wallet.id,
    label: wallet.label,
    publicKey: wallet.publicKey,
    secretKey: Array.from(keypair.secretKey),
    createdAt: wallet.createdAt,
  });
  saveStore(store);

  return wallet;
}

export function getWallet(id: string): AgentWallet | undefined {
  const store = loadStore();
  const stored = store.get(id);
  if (!stored) return undefined;
  return storedToWallet(stored);
}

export function getKeypair(id: string): Keypair | undefined {
  const wallet = getWallet(id);
  return wallet?.keypair;
}

export function listWallets(): AgentWallet[] {
  const store = loadStore();
  return Array.from(store.values()).map(storedToWallet);
}

export async function getBalance(publicKey: string): Promise<number> {
  try {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

export function setVaultPda(walletId: string, vaultPda: string): void {
  const store = loadStore();
  const stored = store.get(walletId);
  if (stored) {
    stored.vaultPda = vaultPda;
    store.set(walletId, stored);
    saveStore(store);
  }
}

// Import a wallet from a secret key (base64 or uint8array)
export function importWallet(secretKey: Uint8Array, label?: string): AgentWallet {
  const keypair = Keypair.fromSecretKey(secretKey);
  const id = randomBytes(4).toString("hex");

  const wallet: AgentWallet = {
    id,
    label: label || `imported-${id}`,
    publicKey: keypair.publicKey.toBase58(),
    keypair,
    createdAt: Date.now(),
  };

  const store = loadStore();
  store.set(id, {
    id: wallet.id,
    label: wallet.label,
    publicKey: wallet.publicKey,
    secretKey: Array.from(keypair.secretKey),
    createdAt: wallet.createdAt,
  });
  saveStore(store);

  return wallet;
}

// Get the authority keypair (from Solana CLI config)
export function getAuthorityKeypair(): Keypair {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const configPath = `${home}/.config/solana/id.json`;
  const secretKey = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}
