import { checkDns } from "./dns";
import { checkTcp } from "./tcp";

/** `type` matches exactly "ad" (case-insensitive, trimmed) - not a substring test
 * like isHttpType/isDnsType use, since "ad" is short enough to false-positive inside
 * unrelated type strings (e.g. "radius", "load"). */
export function isAdType(type: string): boolean {
  return type.trim().toLowerCase() === "ad";
}

export interface AdCheckResult {
  name: string;
  port: number;
  ok: boolean;
}

/** The definitive, (almost) always-present ports on a real domain controller: name
 * resolution, Kerberos auth, LDAP/LDAPS directory, SMB, and Global Catalog. NTP and
 * NPS/RADIUS are deliberately excluded here (unlike the ad-hoc Test Network tool) -
 * not every DC is configured as a time source or a RADIUS server, so including them
 * would flag perfectly healthy DCs as down; these are safe to require on any real
 * domain controller. */
const AD_TCP_CHECKS: { name: string; port: number }[] = [
  { name: "Kerberos", port: 88 },
  { name: "LDAP", port: 389 },
  { name: "LDAPS", port: 636 },
  { name: "SMB", port: 445 },
  { name: "Global Catalog", port: 3268 },
  { name: "Global Catalog (SSL)", port: 3269 },
];

/**
 * Active Directory service health, with a per-check breakdown: up only if every one
 * of the core AD ports responds - DNS is a real query/response check (see
 * checkDns), the rest are TCP reachability (see checkTcp). The overall service tile
 * is still a single up/down (a missing LDAP is treated as the service being down,
 * same as this app's single up/down model for every other service type), but the
 * per-check results are also returned so the public page can show which specific
 * piece failed, rather than just an opaque "down".
 */
export async function checkActiveDirectoryDetailed(host: string): Promise<{ up: boolean; checks: AdCheckResult[] }> {
  const [dnsOk, ...tcpResults] = await Promise.all([
    checkDns(host, 53),
    ...AD_TCP_CHECKS.map((c) => checkTcp(host, c.port)),
  ]);

  const checks: AdCheckResult[] = [
    { name: "DNS", port: 53, ok: dnsOk },
    ...AD_TCP_CHECKS.map((c, i) => ({ name: c.name, port: c.port, ok: tcpResults[i]! })),
  ];

  return { up: checks.every((c) => c.ok), checks };
}
