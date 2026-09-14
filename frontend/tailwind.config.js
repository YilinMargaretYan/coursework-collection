import daisyui from "daisyui";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        coffee: {
          primary: "#8B5E3C",
          "primary-content": "#FFFDF8",
          secondary: "#C08A5D",
          "secondary-content": "#35251C",
          accent: "#A65D3B",
          "accent-content": "#FFFDF8",
          neutral: "#4A3325",
          "neutral-content": "#FFFDF8",
          "base-100": "#FFFDF8",
          "base-200": "#F7F0E5",
          "base-300": "#EADCCB",
          "base-content": "#35251C",
          info: "#3D6F8E",
          success: "#5D8A66",
          warning: "#B7791F",
          error: "#B54B4B",
        },
      },
    ],
  },
};
