import { defineConfig, type Plugin } from 'vite';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Multi-page build: the menu at the root plus every <game>/index.html.
const root = fileURLToPath(new URL('.', import.meta.url));
const games = Object.fromEntries(
  readdirSync(root)
    .filter((name) => !name.startsWith('.') && name !== 'node_modules' && name !== 'dist')
    .filter((name) => existsSync(`${root}${name}/index.html`))
    .map((name) => [name, `${root}${name}/index.html`]),
);

// Dev server: '/lattoo' (no trailing slash) would fall back to the menu, so
// redirect folder URLs that have an index.html to 'folder/'.
function folderRedirect(): Plugin {
  return {
    name: 'folder-redirect',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, query] = (req.url ?? '').split('?');
        if (path !== '/' && !path.endsWith('/') && !path.includes('.') && existsSync(`${root}${path}/index.html`)) {
          res.statusCode = 301;
          res.setHeader('Location', `${path}/${query ? `?${query}` : ''}`);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [folderRedirect()],
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        ...games,
      },
    },
  },
});
