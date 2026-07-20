import { checkDns } from "./dns";
import { checkTcp } from "./tcp";

/** `type` matches exactly "ad" (case-insensitive, trimmed) -- not a substring test
 * like isHttpType/isDnsType use, since "ad" is short enough to false-positive inside
 * unrelated type strings (e.g. "radius", "load"). */
export function isAdType(type: string): boolean {
  return type.trim().toLowerCase() === "ad";
}

/** The definitive, (almost) always-present ports on a real domain controller: name
 * resolution, Kerberos auth, LDAP/LDAPS directory, SMB, and Global Catalog. NTP and
 * NPS/RADIUS are deliberately excluded here (unlike the ad-hoc Test Network tool) --
 * not every DC is configured as a time source or a RADIUS server, so including them
 * would flag perfectly healthy DCs as down; these seven are safe to require on any
 * domain controller. */
const AD_TCP_PORTS = [88, 389, 636, 445, 3268, 3269];

/**
 * Active Directory service health: up only if every one of the core AD ports
 * responds -- DNS is a real query/response check (see checkDns), the rest are TCP
 * reachability (see checkTcp). A single missing piece (say, LDAP down but Kerberos
 * still up) is treated as the service being down, same as this app's single up/down
 * model for every other service type -- there's no partial-credit tile.
 */
export async function checkActiveDirectory(host: string): Promise<boolean> {
  const results = await Promise.all([checkDns(host, 53), ...AD_TCP_PORTS.map((port) => checkTcp(host, port))]);
  return results.every(Boolean);
}
