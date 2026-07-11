import { randomInt, randomUUID } from "node:crypto";
import type { WebSocket } from "@fastify/websocket";
import type { ErrorCode, MobileDevice, QrPayload } from "@cucoudle/protocol";

export type DesktopConn = {
  desktopId: string;
  name: string;
  platform: string;
  appVersion: string;
  socket: WebSocket;
};

export type MobileConn = {
  mobileDeviceId: string;
  mobileDevice: MobileDevice;
  desktopId: string;
  token: string;
  socket: WebSocket;
};

type Pairing = { desktopId: string; expiresAt: number };
type MobileSession = { desktopId: string; mobileDeviceId: string; expiresAt: number };

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
  readonly pending = new Map<string, MobileConn>();

  registerDesktop(
    params: { desktopId: string; desktopName: string; platform: string; appVersion: string },
    socket: WebSocket,
  ): void {
    this.desktops.set(params.desktopId, {
      desktopId: params.desktopId,
      name: params.desktopName,
      platform: params.platform,
      appVersion: params.appVersion,
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
    const pairingCode = generatePairingCode();
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
          for (const [id, mob] of this.pending) {
            if (mob.socket === socket) this.pending.delete(id);
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
}
