import React, { useEffect } from "react";
import { getAppSettings } from "@/services/appSettings";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        function applyTheme() {
            const settings = getAppSettings();
            const theme = settings.theme || "system";
            const root = window.document.documentElement;

            root.classList.remove("light", "dark");

            if (theme === "system") {
                const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light";
                root.classList.add(systemTheme);
            } else {
                root.classList.add(theme);
            }
        }

        applyTheme();

        // Listen for storage changes (settings saved in another tab or same tab)
        window.addEventListener("storage", applyTheme);

        // Listen for custom settings-updated event (if we want immediate update without storage event)
        window.addEventListener("app-settings-updated", applyTheme);

        // Listen for system theme changes
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            const settings = getAppSettings();
            if (settings.theme === "system") {
                applyTheme();
            }
        };
        mediaQuery.addEventListener("change", handleChange);

        return () => {
            window.removeEventListener("storage", applyTheme);
            window.removeEventListener("app-settings-updated", applyTheme);
            mediaQuery.removeEventListener("change", handleChange);
        };
    }, []);

    return <>{children}</>;
}
