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

function extractDefaultExportName(code: string): string {
  const match = /export\s+default\s+function\s+(\w+)/.exec(code);
  return match?.[1] ?? "App";
}

function hasRenderCall(code: string): boolean {
  return /createRoot/.test(code) && /\.render\s*\(/.test(code);
}

const REACT_ESM_URL = "https://esm.sh/react@19.0.0";
const REACT_DOM_ESM_URL = "https://esm.sh/react-dom@19.0.0?deps=react@19.0.0";
const REACT_DOM_CLIENT_URL = "https://esm.sh/react-dom@19.0.0/client?deps=react@19.0.0";

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

/**
 * Collect all .tsx/.jsx/.ts files that are NOT the entry point (App.tsx)
 * and build a mapping of module specifiers to their source code.
 */
function collectModules(files: Record<string, string>): Map<string, string> {
  const modules = new Map<string, string>();
  for (const [path, content] of Object.entries(files)) {
    const norm = path.replace(/^\//, "");
    if (/\.(tsx?|jsx?)$/.test(norm) && norm !== "App.tsx" && norm !== "App.jsx" && norm !== "App.js") {
      modules.set(norm, content);
    }
  }
  return modules;
}

/**
 * Build a module-level import map for multi-file React projects.
 * Each module is Babel-transformed and turned into a blob URL by the browser at runtime.
 * The import map tells the browser how to resolve `import X from "./components/Button"`.
 */
function buildImportMapScript(modules: Map<string, string>): string {
  if (modules.size === 0) return "";

  const moduleEntries = Array.from(modules.entries());
  const moduleDataJson = JSON.stringify(
    moduleEntries.map(([path, code]) => ({ path, code })),
  );

  return `
<script>
window.__NIT_MODULES__ = ${moduleDataJson};
</script>
<script type="module">
(async function() {
  const modules = window.__NIT_MODULES__;
  if (!modules || modules.length === 0) return;

  const importMap = { imports: {} };

  for (const mod of modules) {
    try {
      const transformed = Babel.transform(mod.code, {
        presets: [["react", { runtime: "classic" }], "typescript"],
        filename: mod.path,
      });

      let code = transformed.code;
      // Rewrite relative imports to absolute module specifiers (handled by the outer import map)
      code = code.replace(/from\\s+["'](\\.\\/.+?)["']/g, function(match, specifier) {
        // Strip ./ prefix and add extension normalization
        const clean = specifier.replace(/^\\.\\//,'').replace(/\\.(tsx?|jsx?)$/,'');
        return 'from "./' + clean + '"';
      });

      const blob = new Blob([code], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);

      // Map both with and without extension
      const noExt = mod.path.replace(/\\.(tsx?|jsx?)$/, "");
      importMap.imports["./" + mod.path] = url;
      importMap.imports["./" + noExt] = url;
      // Also without leading dot for bare imports used within components
      importMap.imports[mod.path] = url;
      importMap.imports[noExt] = url;
    } catch(e) {
      console.error("[NIT.BY] Failed to transform module:", mod.path, e);
    }
  }

  // React imports mapping
  importMap.imports["react"] = "${REACT_ESM_URL}";
  importMap.imports["react-dom"] = "${REACT_DOM_ESM_URL}";
  importMap.imports["react-dom/client"] = "${REACT_DOM_CLIENT_URL}";

  const mapScript = document.createElement("script");
  mapScript.type = "importmap";
  mapScript.textContent = JSON.stringify(importMap);
  document.head.appendChild(mapScript);

  // Signal that the import map is ready
  window.__NIT_IMPORTMAP_READY__ = true;
  window.dispatchEvent(new Event("nit-importmap-ready"));
})();
</script>`;
}

function stripImportsToGlobals(code: string): string {
  return code
    .replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?\s*\n/gm, "")
    .replace(/^import\s+.*from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "")
    .replace(/^export\s+(?=function|const|let|class|type|interface|enum)/gm, "");
}

function assembleReactSingleFile(files: Record<string, string>): string {
  const appCode = findFile(files, "App.tsx", "App.jsx", "App.js", "app.tsx");
  const css = findFile(files, "index.css", "style.css", "styles.css", "App.css", "globals.css");

  if (!appCode) return assembleHtmlFallback(files);

  const componentName = extractDefaultExportName(appCode);
  const stripped = stripImportsToGlobals(appCode);
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
import React from "${REACT_ESM_URL}";
import ReactDOM from "${REACT_DOM_ESM_URL}";
import {createRoot} from "${REACT_DOM_CLIENT_URL}";

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

// Stubs for commonly used libraries that are NOT available in the preview sandbox.
// These allow LLM-generated code using react-router-dom / lucide-react to render
// without crashing, using state-based fallbacks instead of real routing.
(function(){
  function _p(p){return React.createElement(React.Fragment,null,p.children)}
  function _link(p){
    var rest={};for(var k in p)if(k!=="to"&&k!=="children")rest[k]=p[k];
    rest.href=p.to||"#";rest.onClick=function(e){e.preventDefault()};
    return React.createElement("a",rest,p.children);
  }
  function _routes(p){
    var ch=React.Children.toArray(p.children);
    return ch.length>0?ch[0]:null;
  }
  function _route(p){return p.element||null}
  function _navLink(p){return _link(p)}
  function _useLocation(){return{pathname:"/",search:"",hash:"",state:null,key:"default"}}
  function _useNavigate(){return function(){}}
  function _useParams(){return{}}
  function _outlet(){return null}
  window.BrowserRouter=_p;window.HashRouter=_p;window.MemoryRouter=_p;
  window.Router=_p;window.Routes=_routes;window.Route=_route;
  window.Link=_link;window.NavLink=_navLink;window.Navigate=function(){return null};
  window.Outlet=_outlet;
  window.useLocation=_useLocation;window.useNavigate=_useNavigate;
  window.useParams=_useParams;window.useSearchParams=function(){return[new URLSearchParams(),function(){}]};
  window.useMatch=function(){return null};window.useHref=function(to){return to||"/"};
})();

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

function assembleReactMultiFile(files: Record<string, string>): string {
  const appCode = findFile(files, "App.tsx", "App.jsx", "App.js", "app.tsx");
  const css = findFile(files, "index.css", "style.css", "styles.css", "App.css", "globals.css");

  if (!appCode) return assembleHtmlFallback(files);

  const modules = collectModules(files);
  const componentName = extractDefaultExportName(appCode);
  const alreadyRenders = hasRenderCall(appCode);

  const renderSuffix = alreadyRenders
    ? ""
    : `\nimport {createRoot} from "react-dom/client";const __r=document.getElementById("root");if(__r)createRoot(__r).render(React.createElement(${componentName}));`;

  const appWithRender = appCode + renderSuffix;

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
${buildImportMapScript(modules)}
</head>
<body>
<div id="root"></div>
<script>window.__APP_CODE__=${JSON.stringify(appWithRender)}<\/script>
<script type="module">
import React from "${REACT_ESM_URL}";
import ReactDOM from "${REACT_DOM_ESM_URL}";
import {createRoot} from "${REACT_DOM_CLIENT_URL}";

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

// Stubs for commonly used libraries that are NOT available in the preview sandbox.
// These allow LLM-generated code using react-router-dom / lucide-react to render
// without crashing, using state-based fallbacks instead of real routing.
(function(){
  function _p(p){return React.createElement(React.Fragment,null,p.children)}
  function _link(p){
    var rest={};for(var k in p)if(k!=="to"&&k!=="children")rest[k]=p[k];
    rest.href=p.to||"#";rest.onClick=function(e){e.preventDefault()};
    return React.createElement("a",rest,p.children);
  }
  function _routes(p){
    var ch=React.Children.toArray(p.children);
    return ch.length>0?ch[0]:null;
  }
  function _route(p){return p.element||null}
  function _navLink(p){return _link(p)}
  function _useLocation(){return{pathname:"/",search:"",hash:"",state:null,key:"default"}}
  function _useNavigate(){return function(){}}
  function _useParams(){return{}}
  function _outlet(){return null}
  window.BrowserRouter=_p;window.HashRouter=_p;window.MemoryRouter=_p;
  window.Router=_p;window.Routes=_routes;window.Route=_route;
  window.Link=_link;window.NavLink=_navLink;window.Navigate=function(){return null};
  window.Outlet=_outlet;
  window.useLocation=_useLocation;window.useNavigate=_useNavigate;
  window.useParams=_useParams;window.useSearchParams=function(){return[new URLSearchParams(),function(){}]};
  window.useMatch=function(){return null};window.useHref=function(to){return to||"/"};
})();

function runApp() {
  try{
    var r=Babel.transform(window.__APP_CODE__,{
      presets:[["react",{runtime:"classic"}],"typescript"],
      filename:"App.tsx"
    });
    var s=document.createElement("script");
    s.type="module";
    s.textContent=r.code;
    document.body.appendChild(s);
  }catch(e){
    window.onerror(e.message,"",0);
  }
}

if (window.__NIT_IMPORTMAP_READY__) {
  runApp();
} else {
  window.addEventListener("nit-importmap-ready", runApp, { once: true });
  setTimeout(runApp, 2000);
}
<\/script>
</body>
</html>`;
}

function assembleReactHtml(files: Record<string, string>): string {
  const modules = collectModules(files);
  if (modules.size > 0) {
    return assembleReactMultiFile(files);
  }
  return assembleReactSingleFile(files);
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
