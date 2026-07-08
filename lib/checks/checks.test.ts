import { describe, it, expect, beforeAll, afterAll } from "vitest";
import net from "node:net";
import http from "node:http";
import { checkTcp } from "./tcp";
import { checkHttp } from "./http";
import { checkDns } from "./dns";
import { checkPing } from "./ping";

describe("checkTcp", () => {
  let server: net.Server;
  let port: number;

  beforeAll(async () => {
    server = net.createServer((sock) => sock.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as net.AddressInfo).port;
  });

  afterAll(() => server.close());

  it("reports up for an open port", async () => {
    expect(await checkTcp("127.0.0.1", port)).toBe(true);
  });

  it("reports down for a closed port", async () => {
    expect(await checkTcp("127.0.0.1", 1)).toBe(false);
  });
});

describe("checkHttp", () => {
  let server: http.Server;
  let port: number;
  let shouldError = false;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (shouldError) {
        res.writeHead(503);
        res.end("unavailable");
      } else {
        res.writeHead(200);
        res.end("ok");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as net.AddressInfo).port;
  });

  afterAll(() => server.close());

  it("reports up on a 2xx response", async () => {
    shouldError = false;
    expect(await checkHttp("127.0.0.1", port, "http")).toBe(true);
  });

  it("reports down on a 5xx response, even though the TCP port is open", async () => {
    shouldError = true;
    expect(await checkHttp("127.0.0.1", port, "http")).toBe(false);
  });

  it("reports down when nothing is listening", async () => {
    expect(await checkHttp("127.0.0.1", 1, "http")).toBe(false);
  });
});

describe("checkDns", () => {
  it("reports up for a real public resolver", async () => {
    expect(await checkDns("8.8.8.8", 53)).toBe(true);
  });

  it("reports down when nothing answers on that UDP port", async () => {
    expect(await checkDns("127.0.0.1", 1)).toBe(false);
  });
});

describe("checkPing", () => {
  it("reports up for localhost", async () => {
    expect(await checkPing("127.0.0.1")).toBe(true);
  });
});
