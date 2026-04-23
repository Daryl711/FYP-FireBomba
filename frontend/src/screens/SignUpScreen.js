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
import { registerUser } from '../api'; 

export default function SignUpScreen({ navigation }) {
    const { login } = useApp();
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

    // Password strength validator — matches backend requirements exactly
    const validatePassword = (pwd) => {
        if (pwd.length < 8) return 'Password must be at least 8 characters.';
        if (pwd.length > 72) return 'Password must be no more than 72 characters.';
        if (!/[A-Z]/.test(pwd)) return 'Password must contain at least one uppercase letter (A-Z).';
        if (!/[a-z]/.test(pwd)) return 'Password must contain at least one lowercase letter (a-z).';
        if (!/[0-9]/.test(pwd)) return 'Password must contain at least one number (0-9).';
        return null; // valid
    };

    // Live password strength indicator (optional but nice UX)
    const getPasswordStrength = () => {
        if (!password) return null;
        const checks = [
            password.length >= 8,
            /[A-Z]/.test(password),
            /[a-z]/.test(password),
            /[0-9]/.test(password),
        ];
        const passed = checks.filter(Boolean).length;
        if (passed <= 1) return { label: 'Weak', color: '#E53935' };
        if (passed <= 2) return { label: 'Fair', color: '#FB8C00' };
        if (passed <= 3) return { label: 'Good', color: '#FDD835' };
        return { label: 'Strong', color: '#43A047' };
    };

    const handleSignUp = async () => {
        // 1. Validation Checks — all rules match the backend so users get helpful messages
        if (!fullName.trim()) { alert('Please enter your full name.'); return; }
        if (fullName.trim().length < 2) { alert('Name must be at least 2 characters.'); return; }
        if (!/^[a-zA-Z\s'-]+$/.test(fullName.trim())) { alert('Name contains invalid characters. Use only letters, spaces, hyphens, and apostrophes.'); return; }
        if (!email.trim()) { alert('Please enter your email address.'); return; }
        if (!validateEmail(email.trim())) { alert('Please enter a valid email address.'); return; }
        if (!password.trim()) { alert('Please enter a password.'); return; }

        // Password strength check
        const passwordError = validatePassword(password);
        if (passwordError) { alert(passwordError); return; }

        if (password !== confirmPassword) { alert('Passwords do not match.'); return; }
        if (!agreedToTerms) { alert('You must agree to the Terms of Service to sign up.'); return; }

        // 2. The API Call to your Express Backend
        try {
            const result = await registerUser(fullName.trim(), email.trim(), password);
            
            if (result.error) {
                alert('Sign Up Failed: ' + result.error);
            } else {
                // 3. Success! Show a simple alert and navigate back
                alert('Success! Account created. You can now log in.');
                navigation.goBack();
            }
        } catch (error) {
            alert('Error: Could not connect to the server. Make sure your backend is running!');
        }
    };

    const passwordStrength = getPasswordStrength();

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
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>
                    Sign up for FireGuard to monitor your home
                </Text>

                {/* Card */}
                <View style={styles.card}>
                    {/* Full Name */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Full Name</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="person-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="John Doe"
                                placeholderTextColor={COLORS.text3}
                                autoCapitalize="words"
                                value={fullName}
                                onChangeText={setFullName}
                            />
                        </View>
                    </View>

                    {/* Email */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Email Address</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="mail-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="you@example.com"
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
                        <Text style={styles.fieldLabel}>Password</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="lock-closed-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={[styles.input, { paddingRight: 44 }]}
                                placeholder="8+ chars, upper, lower, number"
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
                        {/* Live password strength indicator */}
                        {passwordStrength && (
                            <Text style={[styles.strengthText, { color: passwordStrength.color }]}>
                                Strength: {passwordStrength.label}
                            </Text>
                        )}
                    </View>

                    {/* Confirm Password */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Confirm Password</Text>
                        <View style={styles.inputWrap}>
                            <Ionicons
                                name="lock-closed-outline"
                                size={18}
                                color={COLORS.text3}
                                style={styles.inputIcon}
                            />
                            <TextInput
                                style={[styles.input, { paddingRight: 44 }]}
                                placeholder="Confirm your password"
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
                            I agree to the{' '}
                            <Text style={styles.termsLink}>Terms of Service</Text>
                            {' '}and{' '}
                            <Text style={styles.termsLink}>Privacy Policy</Text>
                        </Text>
                    </TouchableOpacity>

                    {/* Sign Up Button */}
                    <TouchableOpacity
                        style={styles.signUpBtn}
                        onPress={handleSignUp}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.signUpText}>Create Account</Text>
                    </TouchableOpacity>
                </View>

                    {/* Sign In Link */}
                    <Text style={styles.signinRow}>
                        Already have an account?{' '}
                        <Text
                            style={styles.signinLink}
                            onPress={() => navigation.goBack()}
                        >
                            Sign In
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
    strengthText: { fontSize: 12, fontWeight: '600', marginTop: 4, marginLeft: 4 },
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