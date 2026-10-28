import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api/client';
import { colors } from '../theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e, 'Could not sign in.'));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <Text style={styles.brand}>Meat Vanta</Text>
        <Text style={styles.sub}>Order alerts</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#8b7a78"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#8b7a78"
          secureTextEntry
          onSubmitEditing={submit}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
        <Text style={styles.hint}>Use the same email and password as the admin panel.</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, justifyContent: 'center', padding: 24 },
  brand: { fontSize: 38, fontWeight: '800', color: colors.brand, textAlign: 'center' },
  sub: { fontSize: 18, color: colors.inkSoft, textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 14,
  },
  error: { color: colors.brand, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 20, fontWeight: '700' },
  hint: { marginTop: 18, textAlign: 'center', color: colors.inkSoft, fontSize: 14 },
});
