import { createHash } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import { InputError } from './manifest.mjs';

const HEADER_LIMIT = 1024 * 1024;

export function sameStat(a, b) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
}

// Читается только заголовок и поток байтов PACK; объекты не распаковываются.
export async function inspectBundle(filename) {
  const file = await open(filename, 'r');
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new InputError('Bundle должен быть обычным файлом.');
    let header = Buffer.alloc(0), headerEnd = -1;
    const buffer = Buffer.alloc(64 * 1024);
    while (headerEnd < 0 && header.length < HEADER_LIMIT) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, HEADER_LIMIT - header.length), header.length);
      if (!bytesRead) break;
      header = Buffer.concat([header, buffer.subarray(0, bytesRead)]);
      headerEnd = header.indexOf('\n\n');
    }
    let format = 'sha1', prerequisites = [], headerValid = headerEnd >= 0;
    if (headerValid) {
      const lines = header.subarray(0, headerEnd).toString('utf8').split('\n');
      const signature = lines.shift();
      headerValid = signature === '# v2 git bundle' || signature === '# v3 git bundle';
      const capabilities = lines.filter(line => line.startsWith('@'));
      if (capabilities.some(line => !['@object-format=sha1', '@object-format=sha256'].includes(line))
          || capabilities.length > 1 || (signature === '# v2 git bundle' && capabilities.length)) headerValid = false;
      if (capabilities.includes('@object-format=sha256')) format = 'sha256';
      const oid = new RegExp(`^[a-f0-9]{${format === 'sha256' ? 64 : 40}}(?: |$)`);
      for (const line of lines) {
        if (line.startsWith('@')) continue;
        if (!oid.test(line.startsWith('-') ? line.slice(1) : line)) headerValid = false;
        if (line.startsWith('-') && oid.test(line.slice(1))) prerequisites.push(line.slice(1).split(' ')[0]);
      }
    }
    prerequisites = [...new Set(prerequisites)];
    if (prerequisites.length > 128) headerValid = false;
    const digest = createHash('sha256');
    const packDigest = createHash(format);
    const trailerLength = format === 'sha256' ? 32 : 20;
    const packStart = headerEnd + 2;
    let position = 0, tail = Buffer.alloc(0), packPrefix = Buffer.alloc(0), packBytes = 0;
    while (BigInt(position) < before.size) {
      const remaining = before.size - BigInt(position);
      const { bytesRead } = await file.read(buffer, 0, Number(remaining < BigInt(buffer.length) ? remaining : BigInt(buffer.length)), position);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      digest.update(chunk);
      if (headerValid && position + bytesRead > packStart) {
        const pack = chunk.subarray(Math.max(0, packStart - position));
        packBytes += pack.length;
        if (packPrefix.length < 12) packPrefix = Buffer.concat([packPrefix, pack.subarray(0, 12 - packPrefix.length)]);
        const pending = Buffer.concat([tail, pack]);
        if (pending.length > trailerLength) packDigest.update(pending.subarray(0, pending.length - trailerLength));
        tail = Buffer.from(pending.subarray(Math.max(0, pending.length - trailerLength)));
      }
      position += bytesRead;
    }
    const packChecksum = headerValid && packBytes >= 12 + trailerLength
      && packPrefix.subarray(0, 4).toString('ascii') === 'PACK'
      && [2, 3].includes(packPrefix.readUInt32BE(4))
      && packDigest.digest('hex') === tail.toString('hex');
    const after = await file.stat({ bigint: true });
    const named = await stat(filename, { bigint: true });
    return { sha256: digest.digest('hex'), headerValid, format, prerequisites,
      packChecksum, stable: sameStat(before, after) && sameStat(after, named), snapshot: after };
  } finally {
    await file.close();
  }
}
