import React from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { AppProvider, useApp } from './src/context/AppContext';
import TutorialOverlay from './src/components/TutorialOverlay';

// Renders the navigator plus the global first-launch tutorial overlay.
// Kept as a child of AppProvider so it can read tutorial state from context.
function AppContent() {
    const { tutorialVisible, closeTutorial } = useApp();
    return (
        <>
            <AppNavigator />
            <TutorialOverlay visible={tutorialVisible} onClose={closeTutorial} />
        </>
    );
}

export default function App() {
    return (
        <AppProvider>
            <AppContent />
        </AppProvider>
    );
}
