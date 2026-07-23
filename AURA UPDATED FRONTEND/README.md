# Aura — Clinical Decision Support (prototype)

A React + Vite single-page app: sidebar dashboard, case cards, AI insights panel,
patient intake with a mock differential-diagnosis engine, light/dark theme, and a
built-in spotlight-style guided tour.

## Requirements
- [Node.js](https://nodejs.org) version 18 or newer (includes npm). Check with:
  ```
  node --version
  ```

## Run it locally
1. Unzip this folder and open a terminal inside it (the folder containing `package.json`).
2. Install dependencies:
   ```
   npm install
   ```
3. Start the dev server:
   ```
   npm run dev
   ```
4. Open the URL it prints — usually **http://localhost:5173** — in your browser.

That's it. Edit any file in `src/` and the page will hot-reload automatically.

## Build for production / deploy
```
npm run build
```
This creates a `dist/` folder with static HTML/CSS/JS you can upload anywhere
(Vercel, Netlify, GitHub Pages, S3, your own server, etc.). To preview that
production build locally first:
```
npm run preview
```

## Project structure
```
aura-app/
├─ index.html          entry HTML page
├─ package.json         dependencies + scripts
├─ vite.config.js        build tool config
└─ src/
   ├─ main.jsx           mounts the app
   ├─ index.css          minimal reset
   └─ App.jsx             the entire app (components, mock data, styles)
```

Everything — layout, mock patient data, the diagnosis-matching logic, and all
CSS — lives in `src/App.jsx`. There's no backend; all data is generated in the
browser and resets on refresh.
