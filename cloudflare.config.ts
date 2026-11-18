import { defineConfig } from "cf/config";

// An assets-only Worker: Vite builds the static site and Cloudflare serves it on
// learn-sql.lelouvincx.com. There is no server code; SQL runs in the browser (sql.js).
export default defineConfig({
	accountId: "3dae581425f7a04837a71679b2a0117c",
	worker: {
		name: "learn-sql",
		compatibilityDate: "2026-11-18",
		assets: { notFoundHandling: "404-page" },
		domains: ["learn-sql.lelouvincx.com"],
	},
});
