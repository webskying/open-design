/**
 * foxpre AES-256-GCM 加密/解密工具
 *
 * 设计约束：
 * - 密钥来源：Node.js 内置 crypto 模块
 * - 加密算法：aes-256-gcm（32 字节密钥，256 位）
 * - IV：每次加密随机生成 16 字节
 * - 认证标签：16 字节 GCM auth tag
 * - 输出编码：base64（格式：IV(16B) + authTag(16B) + ciphertext 拼接后 base64）
 * - 密钥存储：环境变量 FOXPRE_ENCRYPTION_KEY → scrypt 派生；未设置时使用默认派生密钥
 * - 数据库存储：TEXT 列，存储 base64 编码的完整密文
 */

import crypto from 'node:crypto';

/** 加密算法 */
const ALGORITHM = 'aes-256-gcm';

/** IV 长度（字节） */
const IV_LENGTH = 16;

/** 认证标签长度（字节） */
const AUTH_TAG_LENGTH = 16;

/**
 * 获取当前使用的加密密钥。
 *
 * 优先级：
 *   1. FOXPRE_ENCRYPTION_KEY 环境变量（scrypt 派生为 32 字节）
 *   2. 默认派生密钥（scrypt('foxpre-default-salt', 'foxpre', 32)）
 *
 * 模块加载时计算一次，所有 encrypt/decrypt 调用共享。
 */
const DEFAULT_KEY = (() => {
  return getEncryptionKey();
})();

/**
 * 返回当前使用的加密密钥（32 字节 Buffer）。
 *
 * 优先级：FOXPRE_ENCRYPTION_KEY 环境变量 → scrypt 派生密钥
 */
export function getEncryptionKey(): Buffer {
  const envKey = process.env['FOXPRE_ENCRYPTION_KEY'];
  if (envKey) {
    return crypto.scryptSync(envKey, 'foxpre-salt', 32);
  }
  return crypto.scryptSync('foxpre-default-salt', 'foxpre', 32);
}

/**
 * AES-256-GCM 加密。
 *
 * @param plaintext - 明文（为空时返回空字符串）
 * @param key       - 可选 32 字节密钥，不传则使用默认派生密钥
 * @returns base64 编码的密文
 */
export function encrypt(plaintext: string, key?: Buffer): string {
  if (!plaintext) return '';

  const encryptionKey = key ?? DEFAULT_KEY;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * AES-256-GCM 解密。
 *
 * @param encoded - base64 编码的密文（为空时返回空字符串）
 * @param key     - 可选 32 字节密钥，不传则使用默认派生密钥
 * @throws {Error} 解密失败（密钥不匹配或数据损坏）
 * @returns 明文
 */
export function decrypt(encoded: string, key?: Buffer): string {
  if (!encoded) return '';

  const encryptionKey = key ?? DEFAULT_KEY;
  const buffer = Buffer.from(encoded, 'base64');

  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('解密失败：数据长度无效');
  }

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    throw new Error('解密失败：密钥不匹配或数据已损坏');
  }
}
