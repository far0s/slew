module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "#05060a",
        "background-elevated": "#0b0c12",
        border: "rgba(255,255,255,0.06)",
        accent: "#38bdf8",
        accentMuted: "#0f172a",
        accentSoft: "#1e293b",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "0.375rem",
        DEFAULT: "0.5rem",
        lg: "0.75rem",
      },
      boxShadow: {
        subtle: "0 1px 0 0 rgba(15,23,42,0.9), 0 0 0 1px rgba(15,23,42,1)",
        "subtle-elevated":
          "0 8px 24px rgba(15,23,42,0.65), 0 0 0 1px rgba(15,23,42,1)",
      },
      spacing: {
        4.5: "1.125rem",
      },
    },
  },
  plugins: [],
};
