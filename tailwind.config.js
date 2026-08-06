/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#a20513",
        "primary-container": "#c62828",
        "on-primary": "#ffffff",
        "on-background": "#1a1c1c",
        "on-surface": "#1a1c1c",
        surface: "#f9f9f9",
        "surface-container": "#eeeeee",
        "surface-container-low": "#f3f3f3",
        "surface-container-high": "#e8e8e8",
        "surface-container-lowest": "#ffffff",
        "surface-dim": "#dadada",
        secondary: "#5f5e5e",
        "secondary-container": "#e4e2e1",
        outline: "#8f706c",
        "outline-variant": "#e4beba",
        "secondary-fixed-dim": "#c8c6c6",
        /* Dashboard: Clear Blue */
        "dash-blue": "#4A7FB5",
        "dash-blue-deep": "#3A6A9E",
        "dash-sand": "#C9A882",
        /* Admin: Sage Green */
        "admin-teal": "#5E8B7E",
        "admin-teal-deep": "#4A7569",
        "admin-amber": "#D4A574",
      },
      fontFamily: {
        headline: ["Work Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
        label: ["Work Sans", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "6px",
        lg: "10px",
        xl: "14px",
      },
    },
  },
  plugins: [],
};
