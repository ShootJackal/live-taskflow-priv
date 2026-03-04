import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";

const HIDE_STATUS_BAR_KEY = "ci_hide_status_bar";

export const [UiPrefsProvider, useUiPrefs] = createContextHook(() => {
  const [hideStatusBar, setHideStatusBarState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HIDE_STATUS_BAR_KEY)
      .then((stored) => {
        setHideStatusBarState(stored === "1");
      })
      .finally(() => {
        setLoaded(true);
      });
  }, []);

  const setHideStatusBar = useCallback(async (next: boolean) => {
    setHideStatusBarState(next);
    await AsyncStorage.setItem(HIDE_STATUS_BAR_KEY, next ? "1" : "0");
  }, []);

  return {
    loaded,
    hideStatusBar,
    setHideStatusBar,
  };
});

