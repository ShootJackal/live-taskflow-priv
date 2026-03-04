import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";

export type LocaleCode = "en" | "es" | "ru";

const LOCALE_KEY = "ci_locale";

const DICT: Record<LocaleCode, Record<string, string>> = {
  en: {
    collect: "Collect",
    tools: "Tools",
    stats: "Stats",
    live: "Live",
    settings: "Settings",
    appearance_language: "Appearance & Language",
    language: "Language",
    theme: "Theme",
    todays_activity: "Today's Activity",
    load_more: "Load More",
    show_less: "Show Less",
    quick_actions: "Quick Actions",
    my_profile: "My Profile",
    display_settings: "Display Settings",
    hide_status_bar: "Hide Status Bar",
    install_app: "Install App",
  },
  es: {
    collect: "Recolectar",
    tools: "Herramientas",
    stats: "Estadísticas",
    live: "En Vivo",
    settings: "Configuración",
    appearance_language: "Apariencia e Idioma",
    language: "Idioma",
    theme: "Tema",
    todays_activity: "Actividad de Hoy",
    load_more: "Ver Más",
    show_less: "Ver Menos",
    quick_actions: "Acciones Rápidas",
    my_profile: "Mi Perfil",
    display_settings: "Ajustes de Pantalla",
    hide_status_bar: "Ocultar Barra de Estado",
    install_app: "Instalar App",
  },
  ru: {
    collect: "Сбор",
    tools: "Инструменты",
    stats: "Статистика",
    live: "Лайв",
    settings: "Настройки",
    appearance_language: "Внешний вид и Язык",
    language: "Язык",
    theme: "Тема",
    todays_activity: "Активность Сегодня",
    load_more: "Показать Еще",
    show_less: "Свернуть",
    quick_actions: "Быстрые Действия",
    my_profile: "Профиль",
    display_settings: "Настройки Экрана",
    hide_status_bar: "Скрыть Статус Бар",
    install_app: "Установить Приложение",
  },
};

export const [LocaleProvider, useLocale] = createContextHook(() => {
  const [locale, setLocaleState] = useState<LocaleCode>("en");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((stored) => {
      if (stored === "en" || stored === "es" || stored === "ru") {
        setLocaleState(stored);
      }
      setLoaded(true);
    });
  }, []);

  const setLocale = useCallback(async (next: LocaleCode) => {
    setLocaleState(next);
    await AsyncStorage.setItem(LOCALE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      return DICT[locale][key] ?? fallback ?? key;
    },
    [locale]
  );

  return {
    locale,
    loaded,
    setLocale,
    t,
    localeOptions: [
      { code: "en" as LocaleCode, label: "English" },
      { code: "es" as LocaleCode, label: "Español" },
      { code: "ru" as LocaleCode, label: "Русский" },
    ],
  };
});
