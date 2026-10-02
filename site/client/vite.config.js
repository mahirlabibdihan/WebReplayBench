import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev, everything that is not a client route goes to the Express server.
const backend = 'http://localhost:4000';
const proxied = ['/api', '/wishlist/add', '/unsubscribe', '/support/tickets', '/logout', '/addresses'];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      ...Object.fromEntries(proxied.map((p) => [p, backend])),
    },
  },
});
