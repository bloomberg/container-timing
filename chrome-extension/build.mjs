import esbuild from "esbuild";
import { copy } from "esbuild-plugin-copy";
const watch = process.argv[2] === "--watch";
const production = process.argv[2] === "--production";

const context = await esbuild
  .context({
    entryPoints: ["./src/content.js", "./src/content.css"],
    bundle: true,
    outdir: "build",
    format: "iife",
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
                from: ["./container-timing/polyfill/polyfill.js"],
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
