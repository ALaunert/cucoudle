import {
  MobileDeviceSchema,
  MobilePairResultSchema,
  QrPayloadSchema,
  type MobileDevice,
  type MobilePlatform,
} from "@cucoudle/protocol";

export type PairingRequest = {
  relayWsUrl: string;
  desktopId: string;
  pairingCode: string;
};

export type PairingTransportRequest = PairingRequest & {
  mobileDevice: MobileDevice;
};

export type PairingResult = {
  desktopId: string;
  desktopName: string;
  paired: true;
  mobileSessionToken: string;
  mobileSessionExpiresAt: string;
};

export type PairingProfile = {
  relayWsUrl: string;
  desktopId: string;
  desktopName: string;
  mobileDeviceId: string;
  mobileDeviceName: string;
  mobilePlatform: MobilePlatform;
  mobileSessionToken: string;
  mobileSessionExpiresAt: string;
};

export type ManualPairingErrors = Partial<Record<keyof PairingRequest, string>>;

export type ManualPairingValidation =
  | { ok: true; value: PairingRequest }
  | { ok: false; errors: ManualPairingErrors };

const profileKeys: readonly (keyof PairingProfile)[] = [
  "relayWsUrl",
  "desktopId",
  "desktopName",
  "mobileDeviceId",
  "mobileDeviceName",
  "mobilePlatform",
  "mobileSessionToken",
  "mobileSessionExpiresAt",
];

function relayUrlError(value: string): string | null {
  if (!value) return "Укажите адрес реле";
  if (!value.startsWith("ws://") && !value.startsWith("wss://")) {
    return "Адрес реле должен начинаться с ws:// или wss://";
  }
  if (!value.endsWith("/v1/ws/mobile")) {
    return "Адрес реле должен оканчиваться на /v1/ws/mobile";
  }
  try {
    const url = new URL(value);
    if (!url.hostname || url.pathname !== "/v1/ws/mobile") {
      return "Укажите корректный адрес реле";
    }
  } catch {
    return "Укажите корректный адрес реле";
  }
  return null;
}

export function validateManualPairingRequest(input: PairingRequest): ManualPairingValidation {
  const value = {
    relayWsUrl: input.relayWsUrl.trim(),
    desktopId: input.desktopId.trim(),
    pairingCode: input.pairingCode.trim(),
  };
  const errors: ManualPairingErrors = {};
  const relayError = relayUrlError(value.relayWsUrl);
  if (relayError) errors.relayWsUrl = relayError;
  if (!value.desktopId) errors.desktopId = "Укажите ID компьютера";
  if (!value.pairingCode) errors.pairingCode = "Укажите код подключения";

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

export function parseQrPairingRequest(raw: string): PairingRequest {
  const payload = QrPayloadSchema.parse(JSON.parse(raw));
  const validation = validateManualPairingRequest({
    relayWsUrl: payload.relayUrl,
    desktopId: payload.desktopId,
    pairingCode: payload.pairingCode,
  });
  if (!validation.ok) throw new Error("Invalid QR pairing payload");
  return validation.value;
}

function parsePairingProfile(input: unknown): PairingProfile {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid pairing profile");
  }
  const source = input as Record<string, unknown>;
  if (
    Object.keys(source).length !== profileKeys.length ||
    profileKeys.some((key) => !(key in source))
  ) {
    throw new Error("Invalid pairing profile fields");
  }
  for (const key of profileKeys) {
    if (key !== "mobilePlatform" && (typeof source[key] !== "string" || !source[key])) {
      throw new Error(`Invalid pairing profile ${key}`);
    }
  }
  const relayError = relayUrlError(source.relayWsUrl as string);
  if (relayError) throw new Error(relayError);
  if (!["ios", "android", "unknown"].includes(source.mobilePlatform as string)) {
    throw new Error("Invalid pairing profile mobilePlatform");
  }
  return source as PairingProfile;
}

export const PairingProfileSchema = {
  parse: parsePairingProfile,
  safeParse(input: unknown):
    | { success: true; data: PairingProfile }
    | { success: false; error: Error } {
    try {
      return { success: true, data: parsePairingProfile(input) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  },
};

export function buildPairingProfile(
  request: PairingRequest,
  mobileDeviceInput: MobileDevice,
  resultInput: PairingResult,
): PairingProfile {
  const requestValidation = validateManualPairingRequest(request);
  if (!requestValidation.ok) throw new Error("Invalid pairing request");
  const mobileDevice = MobileDeviceSchema.parse(mobileDeviceInput);
  const result = MobilePairResultSchema.parse(resultInput);
  if (request.desktopId !== result.desktopId) {
    throw new Error("Pairing result desktopId does not match request desktopId");
  }

  return PairingProfileSchema.parse({
    relayWsUrl: requestValidation.value.relayWsUrl,
    desktopId: result.desktopId,
    desktopName: result.desktopName,
    mobileDeviceId: mobileDevice.id,
    mobileDeviceName: mobileDevice.name,
    mobilePlatform: mobileDevice.platform,
    mobileSessionToken: result.mobileSessionToken,
    mobileSessionExpiresAt: result.mobileSessionExpiresAt,
  });
}
