import * as crypto from "crypto";
import { ethers, Wallet } from "ethers";
const { publicKeyConvert, publicKeyCreate } = require("secp256k1");
const createKeccakHash = require("keccak");
import Decimal from 'decimal.js';



import Logger from 'bunyan';
export enum BunyanLevel {
  FATAL = 'fatal',
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  TRACE = 'trace',
}

interface LoggerOptions {
  environment?: string,
  level?: BunyanLevel,
  [custom: string]: any;
}

export function createLogger(
  name: string,
  options?: LoggerOptions
) {

  // TODO: need to check this construction
  return Logger.createLogger({
    name,
    serializers: Logger.stdSerializers,
    level: options?.level || 'debug',
    environment: options?.environment || getEnvironment(),
    ...options
  });
}


export class Key {
  value: Buffer;

  constructor(value?: string | Buffer) {
    if (value) {
      if (value instanceof Buffer) {
        this.value = value;
      } else {
        this.value = Buffer.from(value, "hex");
      }
    } else {
      this.value = crypto.randomBytes(32);
    }
  }

  toString(): string {
    return this.value.toString("hex");
  }

  toAddress(): string {
    return privateKeyToAddress(this.value);
  }

  toSigner(): Wallet {
    return new Wallet(this.toString());
  }
}

function toChecksumAddress(
  address: string,
  chainId: string | null = null
): string {
  if (!/^(0x)?[0-9a-f]{40}$/i.test(address)) {
    throw new Error(
      `Given address "${address}" is not a valid Ethereum address.`
    );
  }

  const stripAddress = stripHexPrefix(address).toLowerCase();
  const prefix = chainId != null ? chainId.toString() + "0x" : "";
  const keccakHash = createKeccakHash("keccak256")
    .update(prefix + stripAddress)
    .digest("hex");
  let checksumAddress = "0x";

  for (let i = 0; i < stripAddress.length; i++) {
    checksumAddress +=
      parseInt(keccakHash[i], 16) >= 8
        ? stripAddress[i].toUpperCase()
        : stripAddress[i];
  }

  return checksumAddress;
}

function stripHexPrefix(value: string): string {
  return value.slice(0, 2) === "0x" ? value.slice(2) : value;
}

function publicKeyToAddress(publicKey: string | Buffer): string {
  if (!Buffer.isBuffer(publicKey)) {
    publicKey = publicKey.slice(0, 2) === "0x" ? publicKey.slice(2) : publicKey;
    publicKey = Buffer.from(publicKey, "hex");
  }

  publicKey = Buffer.from(publicKeyConvert(publicKey, false)).slice(1);
  const hash = createKeccakHash("keccak256").update(publicKey).digest();
  return toChecksumAddress(hash.slice(-20).toString("hex"));
}

export function privateKeyToPublicKey(privateKey: Buffer | string): Buffer {
  if (!Buffer.isBuffer(privateKey)) {
    privateKey =
      privateKey.slice(0, 2) === "0x" ? privateKey.slice(2) : privateKey;
    privateKey = Buffer.from(privateKey, "hex");
  }

  return Buffer.from(publicKeyCreate(privateKey, false));
}

export function privateKeyToAddress(privateKey: Buffer | string): string {
  if (!Buffer.isBuffer(privateKey)) {
    privateKey =
      privateKey.slice(0, 2) === "0x" ? privateKey.slice(2) : privateKey;
    privateKey = Buffer.from(privateKey, "hex");
  }

  return publicKeyToAddress(privateKeyToPublicKey(privateKey));
}

export function eth(n: number) {
    const d = new Decimal(n).mul(10**18);
    return ethers.BigNumber.from(d.toString()); // Math(n)).mul(ethers.BigNumber.from('1'+'0'.repeat(18))
}

export type NomadEnvironment = 'development' | 'staging' | 'production';
export function getEnvironment() {
  return process.env.ENVIRONMENT! as NomadEnvironment;
}