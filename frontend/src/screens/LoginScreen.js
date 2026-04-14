import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform, 
    Alert,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme';

// Import your API function (Make sure this path is correct!)
import { loginUser } from '../api'; 

export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    
    // Added a loading state so the button can show a spinner while connecting
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async () => {
        // 1. Validation
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing Fields', 'Please enter both email and password.');
            return;
        }

        // 2. Start Loading
        setIsLoading(true);

        try {
            // 3. Call your Express Backend API
            const result = await loginUser(email.trim(), password);

            // 4. Check for errors from the server (e.g. "Wrong password")
            if (result.error) {
                Alert.alert('Login Failed', result.error);
            } else {
                // 5. Success! Navigate to Home
                if (navigation?.replace) {
                    navigation.replace('Home');
                }
            }
        } catch (error) {
            Alert.alert('Error', 'Could not connect to the server. Is your backend running?');
        } finally {
            // Stop Loading
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardContainer}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContainer}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Logo */}
                    <View style={styles.logoWrap}>
                        <View style={styles.logoCircle}>
                            <Ionicons name="flame" size={48} color={COLORS.primary} />
                        </View>
                    </View>

                    {/* Heading */}
                    <Text style={styles.title}>Welcome Back</Text>
                    <Text style={styles.subtitle}>Sign in to your account</Text>

                    {/* Sign in email and password fields */}
                    <View style={styles.card}>
                        {/* Email */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Email</Text>
                            <View style={styles.inputWrap}>
                                <Ionicons name="mail-outline" size={18} color={COLORS.text3} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your email"
                                    placeholderTextColor={COLORS.text3}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={email}
                                    onChangeText={setEmail}
                                    editable={!isLoading} // Disable input while loading
                                />
                            </View>
                        </View>

                        {/* Password */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Password</Text>
                            <View style={styles.inputWrap}>
                                <Ionicons name="lock-closed-outline" size={18} color={COLORS.text3} style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.input, { paddingRight: 44 }]}
                                    placeholder="Enter your password"
                                    placeholderTextColor={COLORS.text3}
                                    secureTextEntry={!showPassword}
                                    value={password}
                                    onChangeText={setPassword}
                                    editable={!isLoading} // Disable input while loading
                                />
                                <TouchableOpacity
                                    style={styles.eyeBtn}
                                    onPress={() => setShowPassword(!showPassword)}
                                    disabled={isLoading}
                                >
                                    <Ionicons
                                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                        size={18}
                                        color={COLORS.text3}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Remember me and Forgot password */}
                        <View style={styles.rememberRow}>
                            <TouchableOpacity
                                style={styles.rememberLeft}
                                onPress={() => setRememberMe(!rememberMe)}
                                activeOpacity={0.7}
                                disabled={isLoading}
                            >
                                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                                    {rememberMe && <Ionicons name="checkmark" size={12} color="#fff" />}
                                </View>
                                <Text style={styles.rememberText}>Remember me</Text>
                            </TouchableOpacity>
                            <TouchableOpacity disabled={isLoading}>
                                <Text style={styles.forgotText}>Forgot password?</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Sign in button */}
                        <TouchableOpacity 
                            style={[styles.signInBtn, isLoading && { opacity: 0.7 }]} 
                            onPress={handleLogin} 
                            activeOpacity={0.85}
                            disabled={isLoading} // Prevent double clicking
                        >
                            {isLoading ? (
                                <ActivityIndicator color={COLORS.white} />
                            ) : (
                                <Text style={styles.signInText}>Sign In</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Sign up link */}
                    <Text style={styles.signupRow}>
                        Don't have an account?{' '}
                        <Text style={styles.signupLink} onPress={() => !isLoading && navigation.navigate('Signup')}>
                            Sign Up
                        </Text>
                    </Text>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFF9F9',
    },
    keyboardContainer: {
        flex: 1,
    },
    scrollContainer: {
        flexGrow: 1,
        alignItems: 'center',
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.xxxl,
        paddingBottom: SPACING.xxl,
        gap: SPACING.lg,
    },
    logoWrap: {
        marginBottom: SPACING.sm,
    },
    logoCircle: {
        width: 72,
        height: 72,
        backgroundColor: COLORS.white,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOW.medium,
        shadowColor: COLORS.primary,
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
        color: COLORS.text,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: COLORS.text2,
        textAlign: 'center',
        marginTop: -SPACING.sm,
    }, 
    card: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xl,
        padding: SPACING.xl,
        width: '100%',
        gap: SPACING.lg,
        ...SHADOW.small,
    },
    fieldGroup: {
        gap: SPACING.xs,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.text,
        marginBottom: 2,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8F8F8',
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    inputIcon: {
        marginLeft: 12,
        marginRight: 4,
    },
    input: {
        flex: 1,
        paddingVertical: 13,
        paddingHorizontal: 8,
        fontSize: 14,
        color: COLORS.text,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    },
    eyeBtn: {
        padding: 12,
        position: 'absolute',
        right: 0,
    },
    rememberRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: -SPACING.xs,
    },
    rememberLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: COLORS.text3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    rememberText: {
        fontSize: 13,
        color: COLORS.text2,
    },
    forgotText: {
        fontSize: 13,
        color: COLORS.primary,
        fontWeight: '600',
    },
    signInBtn: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.lg,
        paddingVertical: 15,
        alignItems: 'center',
        marginTop: SPACING.xs,
    },
    signInText: {
        color: COLORS.white,
        fontSize: 16,
        fontWeight: '700',
    },
    signupRow: {
        fontSize: 14,
        color: COLORS.text2,
        textAlign: 'center',       
    },
    signupLink: {
        color: COLORS.primary,
        fontWeight: '700',
    },
});