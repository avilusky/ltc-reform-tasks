// ============================================
// build.js - Build script for production
// Creates minified + obfuscated files in dist/
// ============================================

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const DIST = path.join(__dirname, 'dist');
const JS_FILES = ['firebase-config.js', 'store.js', 'calendar.js', 'gantt.js', 'app.js'];
const CSS_FILES = ['styles.css'];

async function build() {
    console.log('Building production version...\n');

    // Clean and create dist folder
    if (fs.existsSync(DIST)) {
        fs.rmSync(DIST, { recursive: true });
    }
    fs.mkdirSync(DIST);

    // Minify and obfuscate JS files
    for (const file of JS_FILES) {
        const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
        const result = await minify(code, {
            mangle: {
                toplevel: false, // Don't mangle globals (firebase, db, store, app, etc.)
                properties: false
            },
            compress: {
                drop_console: false, // Keep console for Firebase debug
                passes: 2
            },
            format: {
                comments: false
            }
        });
        fs.writeFileSync(path.join(DIST, file), result.code);
        const ratio = Math.round((1 - result.code.length / code.length) * 100);
        console.log(`  ${file}: ${code.length} -> ${result.code.length} bytes (${ratio}% smaller)`);
    }

    // Minify CSS
    const CleanCSS = require('clean-css');
    const cleanCSS = new CleanCSS({ level: 2 });
    for (const file of CSS_FILES) {
        const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
        const result = cleanCSS.minify(code);
        fs.writeFileSync(path.join(DIST, file), result.styles);
        const ratio = Math.round((1 - result.styles.length / code.length) * 100);
        console.log(`  ${file}: ${code.length} -> ${result.styles.length} bytes (${ratio}% smaller)`);
    }

    // Minify HTML
    const { minify: minifyHTML } = require('html-minifier-terser');
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const minifiedHTML = await minifyHTML(html, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true
    });
    fs.writeFileSync(path.join(DIST, 'index.html'), minifiedHTML);
    const htmlRatio = Math.round((1 - minifiedHTML.length / html.length) * 100);
    console.log(`  index.html: ${html.length} -> ${minifiedHTML.length} bytes (${htmlRatio}% smaller)`);

    // Copy serve.js for running dist locally
    fs.copyFileSync(path.join(__dirname, 'serve.js'), path.join(DIST, 'serve.js'));

    console.log('\nBuild complete! Files in dist/ folder.');
}

build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
