import React, { createContext, useContext, useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";

const Targets = createContext(null);
const TutorialScroll = createContext(null);

export function TutorialProvider({ children }) {
  const targets = useRef(new Map()).current;
  return <Targets.Provider value={targets}>{children}</Targets.Provider>;
}

export const useTutorialTargets = () => useContext(Targets);

// Keep the real layout as the source of truth, including translated text and
// different screen sizes. Hidden stack screens must not supply stale targets.
export default function TutorialTarget({ id, children, ...props }) {
  const targets = useTutorialTargets();
  const scroll = useContext(TutorialScroll);
  const focused = useIsFocused();
  const ref = useRef(null);
  useEffect(() => {
    if (!targets || !focused || !id) return;
    const entry = { ref, scroll };
    targets.set(id, entry);
    return () => {
      if (targets.get(id) === entry) targets.delete(id);
    };
  }, [targets, id, focused, scroll]);
  return <View ref={ref} collapsable={false} {...props}>{children}</View>;
}

export function TutorialScrollView({ children, onScroll, ...props }) {
  const scroll = useRef({ ref: React.createRef(), offset: 0 }).current;
  return (
    <TutorialScroll.Provider value={scroll}>
      <ScrollView {...props} ref={scroll.ref} scrollEventThrottle={16}
        onScroll={(event) => {
          scroll.offset = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}>
        {children}
      </ScrollView>
    </TutorialScroll.Provider>
  );
}
