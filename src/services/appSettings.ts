export type AppSettings = {
    layout: string;
    lineHeight: number;
    watermarkOpacity: number;
    showAddress: boolean;
    watermarkType: string;
    paperFontSize: number;
    schoolName: string;
    schoolLogo: string;
    secondaryLogo: string;
    schoolAddress: string;
    theme: "light" | "dark" | "system";
};

const defaultSettings: AppSettings = {
    layout: "Layout - 1",
    lineHeight: 1.5,
    watermarkOpacity: 0.1,
    showAddress: true,
    watermarkType: "Image",
    paperFontSize: 12,
    schoolName: "ABC Public School",
    schoolLogo: "",
    secondaryLogo: "",
    schoolAddress: "123 Education Street, Learning District",
    theme: "system",
};

export function getAppSettings(): AppSettings {
    try {
        const saved = localStorage.getItem("app_global_settings");
        if (saved) {
            return { ...defaultSettings, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.warn("Failed to parse app settings from local storage");
    }
    return defaultSettings;
}

export function saveAppSettings(settings: AppSettings) {
    localStorage.setItem("app_global_settings", JSON.stringify(settings));
}

