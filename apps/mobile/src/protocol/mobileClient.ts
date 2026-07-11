import {
  PROTOCOL_VERSION,
  parseWireMessage,
  type EventMessage,
  type ResponseMessage,
} from "@cucoudle/protocol";
import { ProtocolError } from "./protocolError";

export type ConnectionState = "disconnected" | "connecting" | "connected";

export type MobileClient = {
  connect(url: string): Promise<void>;
  close(): void;
  request<T>(method: string, params: Record<string, unknown>): Promise<T>;
  onEvent(listener: (event: EventMessage) => void): () => void;
  onConnection(listener: (state: ConnectionState) => void): () => void;
};

export type SocketLike = {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
};

type MobileClientDependencies = {
  socketFactory(url: string): SocketLike;
  now(): string;
  id(): string;
};

const defaultDependencies: MobileClientDependencies = {
  socketFactory: (url) => new WebSocket(url) as SocketLike,
  now: () => new Date().toISOString(),
  id: () => `${Date.now()}_${Math.random().toString(36).slice(2)}`,
};

export function createMobileClient(
  dependencies: Partial<MobileClientDependencies> = {},
): MobileClient {
  const deps = { ...defaultDependencies, ...dependencies };
  const pending = new Map<string, PendingRequest>();
  const eventListeners = new Set<(event: EventMessage) => void>();
  const connectionListeners = new Set<(state: ConnectionState) => void>();
  let socket: SocketLike | null = null;
  let state: ConnectionState = "disconnected";
  let cancelConnect: ((reason: Error) => void) | null = null;

  function setState(nextState: ConnectionState) {
    state = nextState;
    for (const listener of connectionListeners) listener(state);
  }

  function rejectPending(reason: Error) {
    for (const request of pending.values()) request.reject(reason);
    pending.clear();
  }

  function handleResponse(response: ResponseMessage) {
    const request = pending.get(response.id);
    if (!request) return;

    pending.delete(response.id);
    if (response.ok) {
      request.resolve(response.result ?? {});
      return;
    }

    const error = response.error ?? {
      code: "INTERNAL_ERROR" as const,
      message: "request failed",
    };
    request.reject(new ProtocolError(error.code, error.message, error.details));
  }

  function handleMessage(raw: string) {
    const parsed = parseWireMessage(raw);
    if (!parsed.ok) return;

    if (parsed.msg.kind === "response") {
      handleResponse(parsed.msg);
    } else if (parsed.msg.kind === "event") {
      for (const listener of eventListeners) listener(parsed.msg);
    }
  }

  function handleClose(closedSocket: SocketLike) {
    if (socket !== closedSocket) return;
    socket = null;
    rejectPending(new Error("connection closed"));
    setState("disconnected");
  }

  return {
    connect(url) {
      cancelConnect?.(new Error("connection superseded"));
      setState("connecting");
      return new Promise<void>((resolve, reject) => {
        try {
          const nextSocket = deps.socketFactory(url);
          let settled = false;
          const cancelAttempt = (reason: Error) => {
            if (settled) return;
            settled = true;
            if (cancelConnect === cancelAttempt) cancelConnect = null;
            reject(reason);
          };
          cancelConnect = cancelAttempt;
          socket = nextSocket;
          nextSocket.onopen = () => {
            if (settled || socket !== nextSocket) return;
            settled = true;
            if (cancelConnect === cancelAttempt) cancelConnect = null;
            setState("connected");
            resolve();
          };
          nextSocket.onmessage = (event) => handleMessage(event.data);
          nextSocket.onclose = () => {
            cancelAttempt(new Error("connection closed"));
            handleClose(nextSocket);
          };
          nextSocket.onerror = () => {
            if (!settled && socket === nextSocket) {
              cancelAttempt(new Error("connection failed"));
              setState("disconnected");
            }
          };
        } catch (error) {
          setState("disconnected");
          reject(error);
        }
      });
    },

    close() {
      const activeSocket = socket;
      if (!activeSocket) return;
      activeSocket.close();
    },

    request<T>(method: string, params: Record<string, unknown>) {
      const activeSocket = socket;
      if (!activeSocket || state !== "connected") {
        return Promise.reject(new Error("not connected"));
      }

      const requestId = deps.id();
      const envelope = {
        version: PROTOCOL_VERSION,
        kind: "request" as const,
        id: requestId,
        method,
        params,
        sentAt: deps.now(),
      };

      return new Promise<T>((resolve, reject) => {
        pending.set(requestId, { resolve: (value) => resolve(value as T), reject });
        try {
          activeSocket.send(JSON.stringify(envelope));
        } catch (error) {
          pending.delete(requestId);
          reject(error);
        }
      });
    },

    onEvent(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },

    onConnection(listener) {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
  };
}
