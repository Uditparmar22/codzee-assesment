import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/** Address ranges a webhook must never reach: loopback, private, link-local (cloud metadata), etc. */
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) must be checked as the IPv4 address it maps to.
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return blocked.check(mapped[1], 'ipv4');
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** Hostname without IPv6 brackets or the trailing root dot (`localhost.` is `localhost`). */
const normaliseHost = (hostname: string) => hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();

/** Cheap registration-time check: rejects internal hostnames and blocked IP literals without DNS. */
export function isAllowedWebhookUrl(raw: string): boolean {
  // Zod runs refinements even after the URL check fails, so the input may not parse.
  if (!URL.canParse(raw)) return false;
  const host = normaliseHost(new URL(raw).hostname);
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  return isIP(host) === 0 || !isBlockedAddress(host);
}

export type HostLookup = (hostname: string) => Promise<string[]>;

export const defaultLookup: HostLookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * Delivery-time check: resolves the host and refuses if any address is internal, so a public
 * hostname that later points at an internal address (DNS rebinding) is mostly blocked.
 *
 * Known gap: fetch resolves the host again, so a hostile DNS server with TTL 0 can still answer
 * differently between the two lookups. Closing it needs an undici Agent whose `connect.lookup`
 * validates and pins the address; tracked as a follow-up.
 */
export async function assertPublicDestination(raw: string, lookup: HostLookup): Promise<void> {
  const host = normaliseHost(new URL(raw).hostname);
  const addresses = isIP(host) ? [host] : await lookup(host);
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new Error(`Destination ${host} resolves to a blocked address`);
  }
}
