import { defineConfig } from 'vite';
export default defineConfig({root:'web', base:'./', define: { PACKAGE_VERSION: JSON.stringify('3.2.2') }, build:{outDir:'../web-dist', emptyOutDir:true, target:'safari16'}});
