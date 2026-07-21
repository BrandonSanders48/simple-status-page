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
  ports: number[];
  ok: boolean;
}

/** The definitive, (almost) always-present ports on a real domain controller: name
 * resolution, Kerberos auth, LDAP/LDAPS directory, SMB, and Global Catalog. NTP and
 * NPS/RADIUS are deliberately excluded here (unlike the ad-hoc Test Network tool) -
 * not every DC is configured as a time source or a RADIUS server, so including them
 * would flag perfectly healthy DCs as down; these are safe to require on any real
 * domain controller. LDAP/LDAPS (389/636) and Global Catalog/Global Catalog SSL
 * (3268/3269) are each shown as a single tag on the public service card (see
 * ServiceCard.tsx) rather than one tag per port -- both ports in a pair still get
 * checked, "ok" just requires both, so a card with several AD services doesn't end up
 * with 7 crowded tags each when 5 says the same thing more readably. */
const AD_TCP_CHECKS: { name: string; ports: number[] }[] = [
  { name: "Kerberos", ports: [88] },
  { name: "LDAP", ports: [389, 636] },
  { name: "SMB", ports: [445] },
  { name: "Global Catalog", ports: [3268, 3269] },
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
  const [dnsOk, ...groupResults] = await Promise.all([
    checkDns(host, 53),
    ...AD_TCP_CHECKS.map(async (c) => {
      const portResults = await Promise.all(c.ports.map((p) => checkTcp(host, p)));
      return portResults.every(Boolean);
    }),
  ]);

  const checks: AdCheckResult[] = [
    { name: "DNS", ports: [53], ok: dnsOk },
    ...AD_TCP_CHECKS.map((c, i) => ({ name: c.name, ports: c.ports, ok: groupResults[i]! })),
  ];

  return { up: checks.every((c) => c.ok), checks };
}
