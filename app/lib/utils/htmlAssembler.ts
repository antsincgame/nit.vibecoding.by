type ProjectType = "react" | "html";

function detectProjectType(files: Record<string, string>): ProjectType {
  const paths = Object.keys(files);
  if (paths.some((p) => p.endsWith(".tsx") || p.endsWith(".jsx"))) return "react";
  return "html";
}

function findFile(files: Record<string, string>, ...candidates: string[]): string {
  for (const name of candidates) {
    const direct = files[name];
    if (direct) return direct;
    const slashed = files[`/${name}`];
    if (slashed) return slashed;
    const src = files[`src/${name}`];
    if (src) return src;
    const slashedSrc = files[`/src/${name}`];
    if (slashedSrc) return slashedSrc;
  }
  return "";
}

function escapeForScript(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

function escapeForStyle(code: string): string {
  return code.replace(/<\/style/gi, "<\\/style");
}

function stripImportsAndExports(code: string): string {
  return code
    // multi-line named/default imports: import { ... } from "..."
    .replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?\s*\n/gm, "")
    // single-line imports with destructuring or default
    .replace(/^import\s+.*from\s+["'][^"']+["'];?\s*$/gm, "")
    // side-effect imports: import "..."
    .replace(/^import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "")
    .replace(/^export\s+(?=function|const|let|class|type|interface|enum)/gm, "");
}

function extractDefaultExportName(code: string): string {
  const match = /export\s+default\s+function\s+(\w+)/.exec(code);
  return match?.[1] ?? "App";
}

function hasRenderCall(code: string): boolean {
  return /createRoot/.test(code) && /\.render\s*\(/.test(code);
}

const ERROR_HANDLER_SCRIPT = `<script>
(function(){
  var origLog=console.log,origWarn=console.warn,origErr=console.error,origInfo=console.info;
  function send(level,args){
    try{parent.postMessage({type:'preview-console',level:level,args:Array.from(args).map(function(a){
      try{return typeof a==='object'?JSON.stringify(a,null,2):String(a)}catch(e){return String(a)}
    })},'*')}catch(e){}
  }
  console.log=function(){send('log',arguments);origLog.apply(console,arguments)};
  console.warn=function(){send('warn',arguments);origWarn.apply(console,arguments)};
  console.error=function(){send('error',arguments);origErr.apply(console,arguments)};
  console.info=function(){send('info',arguments);origInfo.apply(console,arguments)};

  window.onerror=function(m,u,l,c){
    var loc=u?u.replace(/^blob:[^/]+\\/[^/]+\\//,''):'';
    var pos=l?(loc?loc+':':'')+'line '+l+(c?':'+c:''):'';
    var msg=String(m).replace(/^Uncaught\\s*/,'');
    parent.postMessage({type:'preview-error',message:msg,pos:pos},'*');
    var d=document.createElement('div');
    d.style.cssText='position:fixed;inset:0;background:#1a1a2e;color:#ff4444;padding:24px;font-family:monospace;z-index:99999;overflow:auto;font-size:14px;';
    d.innerHTML='<h3 style="color:#ffd700;margin:0 0 12px">Runtime Error</h3>'
      +'<p style="color:#ff9999;margin:0 0 8px;font-size:12px">'+(pos||'')+'</p>'
      +'<pre style="white-space:pre-wrap;word-break:break-word">'+msg.replace(/</g,'&lt;')+'</pre>';
    document.body.appendChild(d);
  };
  window.addEventListener('unhandledrejection',function(e){window.onerror(e.reason?.message||String(e.reason),'',0)});
})();
<\/script>`;

function assembleReactHtml(files: Record<string, string>): string {
  const appCode = findFile(files, "App.tsx", "App.jsx", "App.js", "app.tsx");
  const css = findFile(files, "index.css", "style.css", "styles.css", "App.css", "globals.css");

  if (!appCode) return assembleHtmlFallback(files);

  const componentName = extractDefaultExportName(appCode);
  const stripped = stripImportsAndExports(appCode);
  const alreadyRenders = hasRenderCall(stripped);

  const renderSuffix = alreadyRenders
    ? ""
    : `\nvar __r=document.getElementById("root");if(__r)createRoot(__r).render(React.createElement(${componentName}));`;

  const fullCode = stripped + renderSuffix;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
${escapeForStyle(css)}
</style>
${ERROR_HANDLER_SCRIPT}
</head>
<body>
<div id="root"></div>
<script>window.__APP_CODE__=${JSON.stringify(fullCode)}<\/script>
<script type="module">
import React from "https://esm.sh/react@19?bundle";
import ReactDOM from "https://esm.sh/react-dom@19?bundle";
import {createRoot} from "https://esm.sh/react-dom@19/client?bundle";

window.React=React;
window.ReactDOM=ReactDOM;
window.createRoot=createRoot;

var h=["useState","useEffect","useRef","useMemo","useCallback","useReducer",
"useContext","useId","useTransition","useDeferredValue","useLayoutEffect",
"useImperativeHandle","useDebugValue","useSyncExternalStore","useInsertionEffect",
"memo","forwardRef","lazy","Suspense","Fragment","StrictMode","Children",
"createElement","cloneElement","isValidElement","createContext","startTransition"];
h.forEach(function(k){if(React[k]!==undefined)window[k]=React[k]});
window.createPortal=ReactDOM.createPortal;

try{
  var r=Babel.transform(window.__APP_CODE__,{
    presets:[["react",{runtime:"classic"}],"typescript"],
    filename:"App.tsx"
  });
  var s=document.createElement("script");
  s.textContent=r.code;
  document.body.appendChild(s);
}catch(e){
  window.onerror(e.message,"",0);
}
<\/script>
</body>
</html>`;
}

function assembleHtmlProject(files: Record<string, string>): string {
  let html = findFile(files, "index.html");
  const css = findFile(files, "style.css", "styles.css", "index.css");
  const js = findFile(files, "script.js", "main.js", "index.js", "app.js");

  if (!html) return assembleHtmlFallback(files);

  if (css && !html.includes(css.slice(0, 50))) {
    html = html.replace("</head>", `<style>\n${css}\n</style>\n</head>`);
  }

  if (js && !html.includes(js.slice(0, 50))) {
    html = html.replace("</body>", `<script>\n${escapeForScript(js)}\n<\/script>\n</body>`);
  }

  if (!html.includes("onerror")) {
    html = html.replace("<body", `${ERROR_HANDLER_SCRIPT}\n<body`);
  }

  return html;
}

function assembleHtmlFallback(files: Record<string, string>): string {
  const entries = Object.entries(files);
  const htmlFile = entries.find(([p]) => p.endsWith(".html"));
  if (htmlFile) return htmlFile[1];

  const cssFiles = entries.filter(([p]) => p.endsWith(".css")).map(([, c]) => c);
  const jsFiles = entries.filter(([p]) => /\.(js|ts)$/.test(p)).map(([, c]) => c);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"><\/script>
<style>${cssFiles.join("\n")}</style>
${ERROR_HANDLER_SCRIPT}
</head>
<body class="bg-gray-900 text-white min-h-screen">
<div id="root"></div>
${jsFiles.map((js) => `<script>${escapeForScript(js)}<\/script>`).join("\n")}
</body>
</html>`;
}

export function assemblePreviewHtml(files: Record<string, string>): string {
  if (Object.keys(files).length === 0) return "";

  const type = detectProjectType(files);

  switch (type) {
    case "react":
      return assembleReactHtml(files);
    default:
      return assembleHtmlProject(files);
  }
}
