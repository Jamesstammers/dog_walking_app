#!/usr/bin/env bash
# Builds the demo (sample data, no backend) as a static website in dist-demo/.
# The output works from any folder, so it can be hosted anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist-demo
EXPO_OFFLINE=1 EXPO_PUBLIC_DEMO=1 npx expo export --platform web --output-dir dist-demo
python3 - <<'PY'
import glob, re
# Asset and script paths are absolute ("/assets/..."); make them relative.
for js in glob.glob('dist-demo/_expo/static/js/web/*.js'):
    s = open(js).read().replace('"/assets/', '"assets/')
    open(js, 'w').write(s)
html = open('dist-demo/index.html').read()
html = html.replace('src="/_expo/', 'src="_expo/').replace('href="/favicon.ico"', 'href="favicon.ico"')
# Pin relative URLs to the page's folder, then show the router a clean "/" path.
boot = ('<script>(function(){var d=location.href.replace(/[#?].*$/,"").replace(/[^/]*$/,"");'
        'document.write(\'<base href="\'+d+\'">\');'
        'try{history.replaceState(null,"",location.origin+"/")}catch(e){}})();</script>')
html = html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n    ' + boot, 1)
html = html.replace('<title>Portsmouth Paws</title>', '<title>Portsmouth Paws</title>\n    <meta name="description" content="Demo of the Portsmouth Paws booking app with sample data.">')
open('dist-demo/index.html', 'w').write(html)
PY
echo "Built dist-demo/"
