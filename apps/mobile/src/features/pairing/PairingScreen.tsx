import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StyleSheet, Text, View } from "react-native";

import { MobilePairParamsSchema, type MobileDevice } from "@cucoudle/protocol";
import {
  buildPairingProfile,
  parseQrPairingRequest,
  type PairingProfile,
  type PairingRequest,
  type PairingResult,
  type PairingTransportRequest,
} from "../../pairing/pairingProfile";
import { AppButton } from "../../ui/components/AppButton";
import { AppScreen } from "../../ui/components/AppScreen";
import { colors, radii, spacing, typography } from "../../ui/theme";
import { ManualPairingForm } from "./ManualPairingForm";

export type PairingScreenProps = {
  pair(request: PairingTransportRequest): Promise<PairingResult>;
  saveProfile(profile: PairingProfile): Promise<void>;
  getDeviceIdentity(): Promise<MobileDevice>;
  onPaired(profile: PairingProfile): void;
};

const pairingErrors: Record<string, string> = {
  PAIRING_EXPIRED: "Код подключения истёк. Создайте новый код на компьютере.",
  PAIRING_NOT_FOUND: "Код подключения не найден. Проверьте данные или создайте новый код.",
  DESKTOP_OFFLINE: "Компьютер не в сети. Запустите Cucoudle на компьютере и попробуйте снова.",
};

function errorCopy(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (pairingErrors[code]) return pairingErrors[code];
  }
  return "Не удалось подключиться. Проверьте соединение и попробуйте снова.";
}

export function PairingScreen({
  pair,
  saveProfile,
  getDeviceIdentity,
  onPaired,
}: PairingScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairingInProgress = useRef(false);

  async function submit(request: PairingRequest) {
    if (pairingInProgress.current) return;
    pairingInProgress.current = true;
    setLoading(true);
    setError(null);
    try {
      const mobileDevice = await getDeviceIdentity();
      const params = MobilePairParamsSchema.parse({
        desktopId: request.desktopId,
        pairingCode: request.pairingCode,
        mobileDevice,
      });
      const result = await pair({ relayWsUrl: request.relayWsUrl, ...params });
      const profile = buildPairingProfile(request, mobileDevice, result);
      await saveProfile(profile);
      onPaired(profile);
    } catch (caught) {
      setError(errorCopy(caught));
    } finally {
      pairingInProgress.current = false;
      setLoading(false);
    }
  }

  function scan(data: string) {
    try {
      void submit(parseQrPairingRequest(data));
    } catch {
      setError("Не удалось прочитать QR-код подключения.");
    }
  }

  return (
    <AppScreen contentStyle={styles.screen} testID="pairing-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Подключить компьютер</Text>
        <Text style={styles.subtitle}>
          Отсканируйте QR-код из Cucoudle на компьютере.
        </Text>
      </View>

      {manual ? (
        <ManualPairingForm loading={loading} onSubmit={(request) => void submit(request)} />
      ) : (
        <View style={styles.cameraArea}>
          {permission?.granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={loading ? undefined : ({ data }) => scan(data)}
              style={styles.camera}
            />
          ) : permission ? (
            <View style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>Нет доступа к камере</Text>
              <Text style={styles.subtitle}>
                Разрешите доступ к камере или подключитесь вручную.
              </Text>
              {permission.canAskAgain ? (
                <AppButton label="Разрешить камеру" onPress={() => void requestPermission()} />
              ) : null}
            </View>
          ) : (
            <Text style={styles.subtitle}>Проверяем доступ к камере…</Text>
          )}

          <AppButton
            label="Ввести данные вручную"
            onPress={() => {
              setError(null);
              setManual(true);
            }}
            variant="secondary"
          />
        </View>
      )}

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      {manual ? (
        <AppButton
          disabled={loading}
          label="Вернуться к QR-коду"
          onPress={() => {
            setError(null);
            setManual(false);
          }}
          variant="secondary"
        />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  header: { gap: spacing.sm },
  title: { color: colors.text, fontSize: typography.title, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 24 },
  cameraArea: { flex: 1, gap: spacing.md },
  camera: { flex: 1, minHeight: 260, borderRadius: radii.card, overflow: "hidden" },
  permissionCard: {
    flex: 1,
    minHeight: 260,
    justifyContent: "center",
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  permissionTitle: { color: colors.text, fontSize: typography.title, fontWeight: "800" },
  error: {
    color: colors.attentionText,
    backgroundColor: colors.attentionSurface,
    borderColor: colors.attentionBorder,
    borderWidth: 1,
    borderRadius: radii.small,
    padding: spacing.md,
    fontSize: typography.body,
  },
});
