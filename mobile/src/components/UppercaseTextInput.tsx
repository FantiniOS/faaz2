import React from "react";
import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
  Platform,
} from "react-native";

export interface UppercaseTextInputProps extends RNTextInputProps {
  /**
   * Se true, desativa a conversão forçada para caixa alta (útil para e-mails e senhas)
   */
  disableUppercase?: boolean;
}

/**
 * Componente padronizado de TextInput com regra de negócio global de CAIXA ALTA:
 * - autoCapitalize="characters" nativo para o teclado do sistema abrir em maiúsculas
 * - onChangeText aplicando .toUpperCase() no valor antes de propagar ao estado
 * - Exceção automática para senhas (secureTextEntry) e e-mails (keyboardType === 'email-address')
 */
export const UppercaseTextInput = React.forwardRef<any, UppercaseTextInputProps>(
  (
    {
      onChangeText,
      autoCapitalize,
      secureTextEntry,
      keyboardType,
      disableUppercase = false,
      style,
      ...restProps
    },
    ref
  ) => {
    const isSensitiveOrEmail =
      disableUppercase ||
      secureTextEntry ||
      keyboardType === "email-address";

    const computedAutoCapitalize = isSensitiveOrEmail
      ? autoCapitalize || "none"
      : autoCapitalize || "characters";

    const handleTextChange = (text: string) => {
      if (!onChangeText) return;
      if (isSensitiveOrEmail) {
        onChangeText(text);
      } else {
        onChangeText(text.toUpperCase());
      }
    };

    return (
      <RNTextInput
        ref={ref}
        autoCapitalize={computedAutoCapitalize}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        onChangeText={handleTextChange}
        style={[
          style,
          Platform.OS === "web" && ({ outlineStyle: "none" } as any),
        ]}
        {...restProps}
      />
    );
  }
);

UppercaseTextInput.displayName = "UppercaseTextInput";
