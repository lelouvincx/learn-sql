import { readFileSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare(),
		// Publish PRODUCT.md, byte for byte, at /product.md (see https://product.md).
		{
			name: "product-md",
			applyToEnvironment: (env) => env.name === "client",
			generateBundle() {
				this.emitFile({ type: "asset", fileName: "product.md", source: readFileSync("PRODUCT.md") });
			},
		},
	],
});
