jest.mock("@cucoudle/protocol", () =>
  jest.requireActual("../../../../../packages/protocol/src/envelope.ts"),
);

import { PROTOCOL_VERSION, type EventMessage } from "@cucoudle/protocol";
import { createMobileClient, type SocketLike } from "../mobileClient";
import { ProtocolError } from "../protocolError";

class FakeSocket implements SocketLike {
  static readonly OPEN = 1;

  readonly sent: string[] = [];
  readyState = FakeSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  receive(message: unknown): void {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    this.onmessage?.({ data });
  }
}

const sentAt = "2026-07-11T12:34:56.000Z";

function setup() {
  const socket = new FakeSocket();
  let nextId = 0;
  const client = createMobileClient({
    socketFactory: () => socket,
    now: () => sentAt,
    id: () => `mobile_${++nextId}`,
  });
  return { client, socket };
}

async function connect(client: ReturnType<typeof createMobileClient>, socket: FakeSocket) {
  const connected = client.connect("wss://relay.example/ws");
  socket.open();
  await connected;
}

describe("mobile protocol client", () => {
  test("correlates a successful response with the matching request id", async () => {
    const { client, socket } = setup();
    await connect(client, socket);

    const result = client.request<{ sessions: string[] }>("session.list", {});
    socket.receive({
      version: PROTOCOL_VERSION,
      kind: "response",
      id: "mobile_1",
      ok: true,
      result: { sessions: ["session_1"] },
      sentAt,
    });

    await expect(result).resolves.toEqual({ sessions: ["session_1"] });
  });

  test("turns a structured response error into a typed ProtocolError", async () => {
    const { client, socket } = setup();
    await connect(client, socket);

    const result = client.request("session.list", {});
    socket.receive({
      version: PROTOCOL_VERSION,
      kind: "response",
      id: "mobile_1",
      ok: false,
      error: {
        code: "DESKTOP_OFFLINE",
        message: "Desktop is offline",
        details: { desktopId: "desktop_1" },
      },
      sentAt,
    });

    const error = await result.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ProtocolError);
    expect(error).toMatchObject({
      code: "DESKTOP_OFFLINE",
      message: "Desktop is offline",
      details: { desktopId: "desktop_1" },
    });
  });

  test("ignores response ids that have no pending request", async () => {
    const { client, socket } = setup();
    await connect(client, socket);

    const result = client.request<{ paired: boolean }>("mobile.resume", {});
    socket.receive({
      version: PROTOCOL_VERSION,
      kind: "response",
      id: "unknown_id",
      ok: true,
      result: { paired: false },
      sentAt,
    });
    socket.receive({
      version: PROTOCOL_VERSION,
      kind: "response",
      id: "mobile_1",
      ok: true,
      result: { paired: true },
      sentAt,
    });

    await expect(result).resolves.toEqual({ paired: true });
  });

  test("delivers events and supports unsubscribing", async () => {
    const { client, socket } = setup();
    await connect(client, socket);
    const listener = jest.fn<void, [EventMessage]>();
    const unsubscribe = client.onEvent(listener);

    const first = {
      version: PROTOCOL_VERSION,
      kind: "event" as const,
      event: "terminal.output",
      data: { sessionId: "session_1", data: "hello" },
      sentAt,
    };
    socket.receive(first);
    unsubscribe();
    socket.receive({ ...first, data: { sessionId: "session_1", data: "ignored" } });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(first);
  });

  test("safely ignores invalid JSON and still handles later valid messages", async () => {
    const { client, socket } = setup();
    await connect(client, socket);
    const result = client.request<{ sessions: unknown[] }>("session.list", {});

    expect(() => socket.receive("not json{")) .not.toThrow();
    socket.receive({
      version: PROTOCOL_VERSION,
      kind: "response",
      id: "mobile_1",
      ok: true,
      result: { sessions: [] },
      sentAt,
    });

    await expect(result).resolves.toEqual({ sessions: [] });
  });

  test("rejects every pending request when the socket closes", async () => {
    const { client, socket } = setup();
    await connect(client, socket);
    const first = client.request("session.list", {});
    const second = client.request("session.subscribe", { sessionId: "session_1" });

    socket.close();

    await expect(first).rejects.toThrow("connection closed");
    await expect(second).rejects.toThrow("connection closed");
  });

  test("rejects connect when the socket closes before opening", async () => {
    const { client, socket } = setup();
    const connected = client.connect("wss://relay.example/ws");

    socket.close();

    const outcome = await Promise.race([
      connected.then(
        () => "resolved",
        (error: unknown) => error,
      ),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 0)),
    ]);
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).toMatchObject({ message: "connection closed" });
  });

  test("rejects an in-flight connect when a newer connect supersedes it", async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const sockets = [firstSocket, secondSocket];
    const client = createMobileClient({
      socketFactory: () => sockets.shift()!,
      now: () => sentAt,
      id: () => "mobile_1",
    });
    const firstConnect = client.connect("wss://first.example/ws");

    const secondConnect = client.connect("wss://second.example/ws");
    const firstOutcome = await Promise.race([
      firstConnect.then(
        () => "resolved",
        (error: unknown) => error,
      ),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 0)),
    ]);

    expect(firstOutcome).toBeInstanceOf(Error);
    expect(firstOutcome).toMatchObject({ message: "connection superseded" });
    firstSocket.open();
    secondSocket.open();
    await expect(secondConnect).resolves.toBeUndefined();
  });

  test("sends the complete request envelope", async () => {
    const { client, socket } = setup();
    await connect(client, socket);

    void client.request("session.subscribe", { sessionId: "session_1" });

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      version: PROTOCOL_VERSION,
      kind: "request",
      id: "mobile_1",
      sentAt,
      method: "session.subscribe",
      params: { sessionId: "session_1" },
    });
  });

  test("sends session.input exactly once and never retries it automatically", async () => {
    const { client, socket } = setup();
    await connect(client, socket);

    const pending = client.request("session.input", {
      sessionId: "session_1",
      inputMode: "text",
      data: "continue\n",
    });
    expect(socket.sent).toHaveLength(1);

    socket.close();
    await expect(pending).rejects.toThrow("connection closed");
    expect(socket.sent).toHaveLength(1);
  });
});
