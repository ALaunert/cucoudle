import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  validateManualPairingRequest,
  type ManualPairingErrors,
  type PairingRequest,
} from "../../pairing/pairingProfile";
import { AppButton } from "../../ui/components/AppButton";
import { colors, radii, spacing, typography } from "../../ui/theme";

type ManualPairingFormProps = {
  loading: boolean;
  onSubmit(request: PairingRequest): void;
};

export function ManualPairingForm({ loading, onSubmit }: ManualPairingFormProps) {
  const [values, setValues] = useState<PairingRequest>({
    relayWsUrl: "",
    desktopId: "",
    pairingCode: "",
  });
  const [errors, setErrors] = useState<ManualPairingErrors>({});

  function update(key: keyof PairingRequest, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function submit() {
    const validation = validateManualPairingRequest(values);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    onSubmit(validation.value);
  }

  return (
    <View style={styles.form}>
      <Field
        label="Адрес реле"
        value={values.relayWsUrl}
        onChangeText={(value) => update("relayWsUrl", value)}
        error={errors.relayWsUrl}
        autoCapitalize="none"
        placeholder="wss://relay.example/v1/ws/mobile"
      />
      <Field
        label="ID компьютера"
        value={values.desktopId}
        onChangeText={(value) => update("desktopId", value)}
        error={errors.desktopId}
        autoCapitalize="none"
      />
      <Field
        label="Код подключения"
        value={values.pairingCode}
        onChangeText={(value) => update("pairingCode", value)}
        error={errors.pairingCode}
        autoCapitalize="characters"
      />
      <AppButton
        label="Подключить"
        loading={loading}
        loadingLabel="Подключаем…"
        onPress={submit}
      />
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText(value: string): void;
  error?: string;
  autoCapitalize: "none" | "characters";
  placeholder?: string;
};

function Field({ label, value, onChangeText, error, autoCapitalize, placeholder }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error && styles.inputError]}
        value={value}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  label: { color: colors.text, fontSize: typography.caption, fontWeight: "700" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
  },
  inputError: { borderColor: colors.destructive },
  error: { color: colors.destructive, fontSize: typography.caption },
});
