import dgram from "node:dgram";

// Standard NTP client request first byte: LI=0 (no warning), VN=4 (NTPv4), Mode=3
// (client) -- 0b00_100_011 = 0x23. The rest of the 48-byte packet can be zeros for a
// bare reachability probe; a real NTP client would also fill in a transmit timestamp,
// but this is the same minimal-request technique most simple NTP checkers use.
const NTP_CLIENT_REQUEST = Buffer.alloc(48);
NTP_CLIENT_REQUEST[0] = 0x23;

/**
 * Real NTP client/server exchange (not just a port-open test): sends a standard
 * client-mode request and confirms a well-formed server reply comes back (48+ bytes,
 * Mode field = 4/server). NTP servers reply to any client, no shared secret or
 * allowlisting involved, so unlike DHCP/RADIUS this gives a definitive yes/no.
 */
export function checkNtp(host: string, port = 123, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.once("error", () => finish(false));
    socket.once("message", (msg) => {
      if (msg.length < 48) return finish(false);
      const mode = msg[0]! & 0b111;
      finish(mode === 4);
    });

    socket.send(NTP_CLIENT_REQUEST, port, host, (err) => {
      if (err) finish(false);
    });
  });
}
