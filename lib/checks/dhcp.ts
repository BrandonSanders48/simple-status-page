import dgram from "node:dgram";
import crypto from "node:crypto";

const MAGIC_COOKIE = Buffer.from([0x63, 0x82, 0x53, 0x63]);

/** Builds a minimal DHCPDISCOVER packet (RFC 2131/2132): 236-byte BOOTP header +
 * magic cookie + a DHCP Message Type option (53 = Discover) + End option (255). */
function buildDiscover(xid: number): Buffer {
  const header = Buffer.alloc(236);
  header[0] = 1; // op = BOOTREQUEST
  header[1] = 1; // htype = Ethernet
  header[2] = 6; // hlen
  header.writeUInt32BE(xid, 4);
  // chaddr (offset 28, 16 bytes): a locally-administered MAC so it can't collide with
  // a real vendor OUI -- only used to identify our own probe, no real host behind it.
  const mac = crypto.randomBytes(6);
  mac[0] = (mac[0]! & 0xfe) | 0x02;
  mac.copy(header, 28);

  const options = Buffer.from([53, 1, 1, 255]); // Message Type = DHCPDISCOVER, then End
  return Buffer.concat([header, MAGIC_COOKIE, options]);
}

/**
 * Sends a real DHCPDISCOVER and listens for a DHCPOFFER, rather than a bare
 * port-open test. Definitively confirms "up" if a reply comes back -- but per RFC
 * 2131, a DHCP server normally replies via broadcast or by ARPing the offered
 * address, not by unicasting back to an arbitrary querying port the way this probe
 * needs; whether a given server implementation does that anyway varies. So a reply
 * is trusted as a real "yes", but no reply within the timeout is reported as
 * inconclusive (`null`), not a confirmed failure -- it may just as easily mean this
 * server (like most) doesn't unicast-reply to a non-relay client as it does mean
 * DHCP is actually down.
 */
export function checkDhcp(host: string, port = 67, timeoutMs = 2000): Promise<boolean | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const xid = crypto.randomInt(0, 0xffffffff);
    const packet = buildDiscover(xid);
    let settled = false;

    const finish = (result: boolean | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.once("error", () => finish(null));
    socket.once("message", (msg) => {
      if (msg.length < 240) return; // shorter than a header + magic cookie -- ignore, keep waiting
      if (!msg.subarray(236, 240).equals(MAGIC_COOKIE)) return;
      if (msg.readUInt32BE(4) !== xid) return; // not a reply to our own request
      finish(true);
    });

    socket.send(packet, port, host, (err) => {
      if (err) finish(null);
    });
  });
}
