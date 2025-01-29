import esbuild from "esbuild";
import { copy } from "esbuild-plugin-copy";
const watch = process.argv[2] === "--watch";
const production = process.argv[2] === "--production";

const context = await esbuild
  .context({
    entryPoints: ["./src/content.js"],
    bundle: true,
    outdir: "build",
    format: "esm",
    sourcemap: !production,
    minify: production,
    platform: "browser",
    target: "ES2022",
    plugins: [
        copy({
            resolveFrom: 'cwd',
            assets: [{
                from: ["./public/**/*"],
                to: ["./build"]
            }, {
                from: ["../polyfill/polyfill.js"],
                to: ["./build"]
            },
            {
                from: ["../demo-overlays/demo-overlays.css"],
                to: ["./build"]
            },
            {
                from: ["./src/setVars.js"],
                to: ["./build"]
            }
          ],
            watch

        })
    ]
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

if (watch) {
  await context.watch();
} else {
  context.rebuild();
  context.dispose();
}
