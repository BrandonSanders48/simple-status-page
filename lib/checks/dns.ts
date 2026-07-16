import dgram from "node:dgram";
import crypto from "node:crypto";

export function isDnsType(type: string): boolean {
  return type.toLowerCase().includes("dns");
}

function buildQuery(id: number): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2); // standard query, RD=1
  header.writeUInt16BE(1, 4); // QDCOUNT=1
  // ANCOUNT, NSCOUNT, ARCOUNT already zero

  const question = Buffer.from([
    0x00, // root name (zero-length label)
    0x00,
    0x02, // QTYPE = NS
    0x00,
    0x01, // QCLASS = IN
  ]);

  return Buffer.concat([header, question]);
}

/**
 * Real DNS health check: send an actual UDP query and confirm a well-formed DNS
 * response comes back (matching transaction ID, response flag set), rather than just
 * checking whether some port accepts a connection -- most DNS servers don't even listen
 * on TCP, so a raw TCP connect test can misreport a resolver's real health.
 */
export function checkDns(host: string, port = 53, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const id = crypto.randomInt(0, 0xffff);
    const query = buildQuery(id);
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
      if (msg.length < 12) return finish(false);
      const respId = msg.readUInt16BE(0);
      const flags = msg.readUInt16BE(2);
      const qr = (flags >> 15) & 1;
      finish(respId === id && qr === 1);
    });

    socket.send(query, port, host, (err) => {
      if (err) finish(false);
    });
  });
}
