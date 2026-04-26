import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme';
import { useApp } from '../context/AppContext';

// IMPORTING THE API HELPER
import { registerUser } from '../services/api';

export default function SignUpScreen({ navigation }) {
    const { t } = useApp();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);

    const validateEmail = (emailText) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(emailText);
    };

    const handleSignUp = async () => {
        // 1. Validation Checks (Using standard web alert to prevent silent browser crashes)
        if (!fullName.trim()) { alert(t('signup.enterFullName')); return; }
        if (!email.trim()) { alert(t('signup.enterEmail')); return; }
        if (!validateEmail(email.trim())) { alert(t('signup.invalidEmail')); return; }
        if (!password.trim()) { alert(t('signup.enterPassword')); return; }
        if (password.length < 6) { alert(t('signup.passwordMin')); return; }
        if (password !== confirmPassword) { alert(t('signup.passwordMismatch')); return; }
        if (!agreedToTerms) { alert(t('signup.mustAgreeTerms')); return; }

        // 2. The API Call to your Express Backend
        try {
            const result = await registerUser(fullName.trim(), email.trim(), password);
            
            if (result.error) {
                alert(t('signup.signupFailed', { error: result.error }));
            } else {
                // 3. Success! Show a simple alert and navigate back
                alert(t('signup.signupSuccess'));
                navigation.goBack();
            }
        } catch (error) {
            alert(t('signup.connectError'));
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                {/* Back Button */}
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={20} color={COLORS.text} />
                </TouchableOpacity>

                {/* Logo */}
                <View style={styles.logoWrap}>
                    <View style={styles.logoCircle}>
                    <Ionicons name="flame" size={36} color={COLORS.primary} />
                    </View>
                </View>

                {/* Heading */}
                <Text style={styles.title}>{t('signup.title')}</Text>
                <Text style={styles.subtitle}>
                    {t('signup.subtitle')}
                </Text>

                {/* Card */}
                <View style={styles.card}>
                    {/* Full Name */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('signup.fullName')}</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="person-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder={t('signup.fullNamePlaceholder')}
                                placeholderTextColor={COLORS.text3}
                                autoCapitalize="words"
                                value={fullName}
                                onChangeText={setFullName}
                            />
                        </View>
                    </View>

                    {/* Email */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('signup.email')}</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="mail-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder={t('signup.emailPlaceholder')}
                                placeholderTextColor={COLORS.text3}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={email}
                                onChangeText={setEmail}
                            />
                        </View>
                    </View>

                    {/* Password */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('signup.password')}</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="lock-closed-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={[styles.input, { paddingRight: 44 }]}
                                placeholder={t('signup.passwordPlaceholder')}
                                placeholderTextColor={COLORS.text3}
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                            />
                            <TouchableOpacity
                                style={styles.eyeBtn}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={18}
                                    color={COLORS.text3}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Confirm Password */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>{t('signup.confirmPassword')}</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="lock-closed-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={[styles.input, { paddingRight: 44 }]}
                                placeholder={t('signup.confirmPasswordPlaceholder')}
                                placeholderTextColor={COLORS.text3}
                                secureTextEntry={!showConfirmPassword}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                            />
                            <TouchableOpacity
                                style={styles.eyeBtn}
                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                <Ionicons
                                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={18}
                                    color={COLORS.text3}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Terms Checkbox */}
                    <TouchableOpacity
                        style={styles.termsRow}
                        onPress={() => setAgreedToTerms(!agreedToTerms)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                            {agreedToTerms && <Ionicons name="checkmark" size={12} color="#fff" />}
                        </View>
                        <Text style={styles.termsText}>
                            {t('signup.terms')}{' '}
                            <Text style={styles.termsLink}>{t('signup.termsOfService')}</Text>
                            {' '}{t('signup.and')}{' '}
                            <Text style={styles.termsLink}>{t('signup.privacyPolicy')}</Text>
                        </Text>
                    </TouchableOpacity>

                    {/* Sign Up Button */}
                    <TouchableOpacity
                        style={styles.signUpBtn}
                        onPress={handleSignUp}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.signUpText}>{t('signup.createAccount')}</Text>
                    </TouchableOpacity>
                </View>

                    {/* Sign In Link */}
                    <Text style={styles.signinRow}>
                        {t('signup.alreadyHaveAccount')}{' '}
                        <Text
                            style={styles.signinLink}
                            onPress={() => navigation.goBack()}
                        >
                            {t('signup.signIn')}
                        </Text>
                    </Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFF9F9' },
    scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: SPACING.xxl, gap: SPACING.md },
    backBtn: { alignSelf: 'flex-start', width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
    logoWrap: { marginVertical: SPACING.sm },
    logoCircle: { width: 72, height: 72, backgroundColor: COLORS.white, borderRadius: 36, alignItems: 'center', justifyContent: 'center', ...SHADOW.medium, shadowColor: COLORS.primary },
    title: { fontSize: 26, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
    subtitle: { fontSize: 14, color: COLORS.text2, textAlign: 'center', marginTop: -SPACING.sm },
    card: { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, padding: SPACING.xl, width: '100%', gap: SPACING.lg, ...SHADOW.small },
    fieldGroup: { gap: SPACING.xs },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
    inputIcon: { marginLeft: 12, marginRight: 4 },
    input: { flex: 1, paddingVertical: 13, paddingHorizontal: 8, fontSize: 14, color: COLORS.text, fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif' },
    eyeBtn: { padding: 12, position: 'absolute', right: 0 },
    termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
    checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    termsText: { fontSize: 12, color: COLORS.text2, lineHeight: 18, flex: 1 },
    termsLink: { color: COLORS.primary, fontWeight: '600', textDecorationLine: 'underline' },
    signUpBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    signUpText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
    signinRow: { fontSize: 13, color: COLORS.text2, textAlign: 'center' },
    signinLink: { color: COLORS.primary, fontWeight: '700' },
});