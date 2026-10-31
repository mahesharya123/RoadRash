# Highway Rash
Original 3D arcade motorcycle combat racer. Three.js + TypeScript + Vite. All models, textures and audio are generated procedurally in code (no copyrighted assets).

Controls: Arrows/WASD steer, gas, brake · Z/Q/J punch left · X/E/K kick right · M mute · Enter restart. On touch devices, on-screen buttons appear automatically.

    npm install
    npm run dev       # http://localhost:5173
    npm run build     # outputs dist/

Deploy to Vercel: push to GitHub, "Add New Project" in Vercel, import the repo. Framework Vite, build `npm run build`, output `dist` (already set in vercel.json). Or: `npm i -g vercel && vercel --prod`.
