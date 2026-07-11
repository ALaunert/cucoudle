import { randomInt, randomUUID } from "node:crypto";
import type { WebSocket } from "@fastify/websocket";
import { PROTOCOL_CAPABILITIES, type ErrorCode, type MobileDevice, type QrPayload } from "@cucoudle/protocol";

// Capabilities the relay itself can carry (it forwards interaction.respond and
// fans out interaction.* events). The negotiated set is the intersection of
// mobile, relay and desktop offers.
export const RELAY_CAPABILITIES: readonly string[] = PROTOCOL_CAPABILITIES;

export function negotiateCapabilities(
  mobileOffered: readonly string[],
  desktopOffered: readonly string[],
): string[] {
  const desktop = new Set(desktopOffered);
  const relay = new Set(RELAY_CAPABILITIES);
  return mobileOffered.filter((c) => relay.has(c) && desktop.has(c));
}

export type DesktopConn = {
  desktopId: string;
  name: string;
  platform: string;
  appVersion: string;
  offeredCapabilities: string[];
  socket: WebSocket;
};

export type MobileConn = {
  mobileDeviceId: string;
  mobileDevice: MobileDevice;
  desktopId: string;
  token: string;
  offeredCapabilities: string[];
  socket: WebSocket;
};

type Pairing = { desktopId: string; expiresAt: number };
type MobileSession = { desktopId: string; mobileDeviceId: string; expiresAt: number };
type PendingRequest = {
  desktopId: string;
  requestId: string;
  method: string;
  mobile: MobileConn;
  timeout: ReturnType<typeof setTimeout>;
};

export function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

type Ok = { ok: true };
type Err = { ok: false; code: ErrorCode };

export class RelayState {
  readonly desktops = new Map<string, DesktopConn>();
  private readonly pairings = new Map<string, Pairing>();
  private readonly mobileSessions = new Map<string, MobileSession>();
  readonly links = new Map<string, Set<MobileConn>>();
  private readonly pending = new Map<string, PendingRequest>();

  registerDesktop(
    params: {
      desktopId: string;
      desktopName: string;
      platform: string;
      appVersion: string;
      offeredCapabilities?: string[];
    },
    socket: WebSocket,
  ): void {
    for (const [id, connection] of this.desktops) {
      if (connection.socket === socket && id !== params.desktopId) this.desktops.delete(id);
    }
    const existing = this.desktops.get(params.desktopId);
    if (existing && existing.socket !== socket) existing.socket.close(4001, "replaced by a new connection");
    this.desktops.set(params.desktopId, {
      desktopId: params.desktopId,
      name: params.desktopName,
      platform: params.platform,
      appVersion: params.appVersion,
      offeredCapabilities: params.offeredCapabilities ?? [],
      socket,
    });
  }

  getDesktop(desktopId: string): DesktopConn | undefined {
    return this.desktops.get(desktopId);
  }

  removeDesktopBySocket(socket: WebSocket): string | null {
    for (const [id, conn] of this.desktops) {
      if (conn.socket === socket) {
        this.desktops.delete(id);
        return id;
      }
    }
    return null;
  }

  createPairing(
    desktopId: string,
    ttlSeconds: number,
    relayMobileUrl: string,
    now: number,
  ): { pairingCode: string; expiresAt: string; qrPayload: QrPayload } {
    for (const [code, pairing] of this.pairings) {
      if (pairing.desktopId === desktopId) this.pairings.delete(code);
    }
    let pairingCode: string;
    do {
      pairingCode = generatePairingCode();
    } while (this.pairings.has(pairingCode));
    const expiresAtMs = now + ttlSeconds * 1000;
    this.pairings.set(pairingCode, { desktopId, expiresAt: expiresAtMs });
    const expiresAt = new Date(expiresAtMs).toISOString();
    return {
      pairingCode,
      expiresAt,
      qrPayload: { relayUrl: relayMobileUrl, desktopId, pairingCode, expiresAt },
    };
  }

  consumePairing(desktopId: string, code: string, now: number): Ok | Err {
    const pairing = this.pairings.get(code);
    if (!pairing || pairing.desktopId !== desktopId) {
      return { ok: false, code: "PAIRING_NOT_FOUND" };
    }
    if (now > pairing.expiresAt) {
      this.pairings.delete(code);
      return { ok: false, code: "PAIRING_EXPIRED" };
    }
    this.pairings.delete(code);
    return { ok: true };
  }

  issueMobileSession(
    desktopId: string,
    mobileDeviceId: string,
    ttlMs: number,
    now: number,
  ): { token: string; expiresAt: string } {
    const token = `mst_${randomUUID().replace(/-/g, "")}`;
    const expiresAtMs = now + ttlMs;
    this.mobileSessions.set(token, { desktopId, mobileDeviceId, expiresAt: expiresAtMs });
    return { token, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  resumeMobile(desktopId: string, mobileDeviceId: string, token: string, now: number): Ok | Err {
    const session = this.mobileSessions.get(token);
    if (!session || session.desktopId !== desktopId || session.mobileDeviceId !== mobileDeviceId) {
      return { ok: false, code: "UNAUTHORIZED" };
    }
    if (now > session.expiresAt) {
      this.mobileSessions.delete(token);
      return { ok: false, code: "PAIRING_EXPIRED" };
    }
    return { ok: true };
  }

  linkMobile(conn: MobileConn): void {
    let set = this.links.get(conn.desktopId);
    if (!set) {
      set = new Set();
      this.links.set(conn.desktopId, set);
    }
    set.add(conn);
  }

  unlinkMobileBySocket(socket: WebSocket): { mobileDeviceId: string; desktopId: string } | null {
    for (const [desktopId, set] of this.links) {
      for (const conn of set) {
        if (conn.socket === socket) {
          set.delete(conn);
          if (set.size === 0) this.links.delete(desktopId);
          for (const [key, pending] of this.pending) {
            if (pending.mobile.socket === socket) {
              clearTimeout(pending.timeout);
              this.pending.delete(key);
            }
          }
          return { mobileDeviceId: conn.mobileDeviceId, desktopId };
        }
      }
    }
    return null;
  }

  mobilesForDesktop(desktopId: string): MobileConn[] {
    return [...(this.links.get(desktopId) ?? [])];
  }

  addPending(
    desktopId: string,
    requestId: string,
    method: string,
    mobile: MobileConn,
    timeoutMs: number,
    onTimeout: (mobile: MobileConn) => void,
  ): boolean {
    const key = this.pendingKey(desktopId, requestId);
    if (this.pending.has(key)) return false;
    const timeout = setTimeout(() => {
      const pending = this.pending.get(key);
      if (!pending) return;
      this.pending.delete(key);
      onTimeout(pending.mobile);
    }, timeoutMs);
    timeout.unref();
    this.pending.set(key, { desktopId, requestId, method, mobile, timeout });
    return true;
  }

  takePending(desktopId: string, requestId: string): { mobile: MobileConn; method: string } | undefined {
    const key = this.pendingKey(desktopId, requestId);
    const pending = this.pending.get(key);
    if (!pending) return undefined;
    clearTimeout(pending.timeout);
    this.pending.delete(key);
    return { mobile: pending.mobile, method: pending.method };
  }

  removePendingForDesktop(desktopId: string): Array<{ requestId: string; mobile: MobileConn }> {
    const removed: Array<{ requestId: string; mobile: MobileConn }> = [];
    for (const [key, pending] of this.pending) {
      if (pending.desktopId !== desktopId) continue;
      clearTimeout(pending.timeout);
      this.pending.delete(key);
      removed.push({ requestId: pending.requestId, mobile: pending.mobile });
    }
    return removed;
  }

  private pendingKey(desktopId: string, requestId: string): string {
    return `${desktopId}\u0000${requestId}`;
  }
}
